// ============================================
// Edge Function: nightly-report
// 每天日本时间 0 点（UTC 15:00）推送夜间汇总
// 有事报事，无事报「今夜平安」
// ============================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const PREFECTURE = "山梨県";
/** 单用户固定身份 */
const FIXED_USER_ID = "00000000-0000-0000-0000-000000000001";
const P2P_URL = "https://api.p2pquake.net/v2/history?codes=551&codes=556&limit=50";
const PUSHPLUS_URL = "http://www.pushplus.plus/send";

function scaleToUser(v: unknown): number {
  if (v === null || v === undefined || v === "") return -1;
  const n = Number(v);
  if (Number.isNaN(n)) return -1;
  if (n >= 70) return 7;
  if (n >= 60) return 6;
  if (n >= 55) return 6;
  if (n >= 50) return 5;
  if (n >= 45) return 5;
  if (n >= 40) return 4;
  if (n >= 30) return 3;
  if (n >= 20) return 2;
  if (n >= 10) return 1;
  return 0;
}

/** 完整震度文案 */
function scaleLabel(v: unknown): string {
  const n = Number(v);
  const map: Record<number, string> = {
    0: "0", 10: "1", 20: "2", 30: "3", 40: "4",
    45: "5弱", 50: "5強", 55: "6弱", 60: "6強", 70: "7",
  };
  if (map[n] !== undefined) return map[n];
  const lv = scaleToUser(v);
  return lv < 0 ? "—" : String(lv);
}

function nowJstString(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return (
    d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds())
  );
}

function jstDateKey(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000 - offsetDays * 24 * 3600 * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}

function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET") || "";
  const auth = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (secret && cronHeader === secret) return true;
  if (!secret) return true;
  if (auth.replace("Bearer ", "") === secret) return true;
  if (auth.startsWith("Bearer ey")) return true;
  return false;
}

async function sendPushPlus(token: string, title: string, content: string): Promise<boolean> {
  const res = await fetch(PUSHPLUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, title, content, template: "html" }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && (data?.code === 200 || data?.code === "200" || data?.code === undefined);
}

function extractYamanashiScale(item: any): number {
  const points: any[] = item?.points || item?.areas || [];
  let max = -1;
  for (const p of points) {
    if (String(p?.pref || "").includes("山梨")) {
      const s = scaleToUser(p?.scale ?? p?.scaleFrom ?? p?.maxScale);
      if (s > max) max = s;
    }
  }
  return max;
}

function extractYamanashiRawScale(item: any): number {
  const points: any[] = item?.points || item?.areas || [];
  let max = -1;
  for (const p of points) {
    if (String(p?.pref || "").includes("山梨")) {
      const s = Number(p?.scale ?? p?.scaleFrom ?? p?.maxScale);
      if (!Number.isNaN(s) && s > max) max = s;
    }
  }
  return max;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    });
  }
  if (!isAuthorized(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pushToken = Deno.env.get("PUSHPLUS_TOKEN") || "";
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: settingsRows, error: setErr } = await admin
    .from("settings")
    .select("user_id, min_shindo, is_hibernating")
    .eq("user_id", FIXED_USER_ID)
    .maybeSingle();
  if (setErr) return json({ ok: false, error: setErr.message }, 500);

  const userRow = settingsRows || {
    user_id: FIXED_USER_ID,
    min_shindo: 2,
    is_hibernating: false,
  };
  const users = [userRow];
  const activeUsers = users.filter((u) => !u.is_hibernating);

  // 近 24 小时数据
  let items: any[] = [];
  try {
    const res = await fetch(P2P_URL, {
      headers: { "User-Agent": "quake-alert-personal/1.0" },
    });
    const text = await res.text();
    if (!res.ok) {
      return json({ ok: false, error: `P2P HTTP ${res.status}`, body: text.slice(0, 200) }, 502);
    }
    const raw = text ? JSON.parse(text) : [];
    items = Array.isArray(raw) ? raw : [];
  } catch (e) {
    return json({ ok: false, error: String(e) }, 502);
  }

  const cutoff = Date.now() - 24 * 3600 * 1000;
  const eewList: any[] = [];
  const yamaList: any[] = [];

  for (const item of items) {
    const t = item?.earthquake?.time || item?.time;
    const ts = t ? new Date(String(t).replace(/\//g, "-")).getTime() : NaN;
    if (!Number.isNaN(ts) && ts < cutoff) continue;

    if (item?.code === 556) {
      const areas = item?.areas || item?.points || [];
      const hit = areas.some((a: any) => String(a?.pref || a?.name || "").includes("山梨")) ||
        String(item?.earthquake?.hypocenter?.name || "").includes("山梨");
      if (hit) eewList.push(item);
    }
    if (item?.code === 551) {
      const lv = extractYamanashiScale(item);
      if (lv >= 0) yamaList.push({ item, lv, raw: extractYamanashiRawScale(item) });
    }
  }

  const lines: string[] = [];
  lines.push(`<div><b>地震预警 夜间汇总 ${nowJstString()}</b></div>`);
  lines.push(`<div>监测地点：${PREFECTURE} 甲府市善光寺3-1-5</div>`);

  if (!eewList.length && !yamaList.length) {
    lines.push(`<div style="margin-top:10px">今夜平安，未监测到山梨県相关緊急地震速報或有感地震。</div>`);
  } else {
    if (eewList.length) {
      lines.push(`<div style="margin-top:10px"><b>緊急地震速報（${eewList.length}）</b></div>`);
      for (const e of eewList.slice(0, 5)) {
        const eq = e?.earthquake || {};
        lines.push(
          `<div>· ${eq?.hypocenter?.name || "—"} M${eq?.hypocenter?.magnitude ?? "—"} ${eq?.time || e?.time || ""}</div>`
        );
      }
    }
    if (yamaList.length) {
      lines.push(`<div style="margin-top:10px"><b>山梨有感地震（${yamaList.length}）</b></div>`);
      for (const y of yamaList.slice(0, 8)) {
        const eq = y.item?.earthquake || {};
        lines.push(
          `<div>· ${eq?.hypocenter?.name || "—"} 震度${scaleLabel(y.raw)} M${eq?.hypocenter?.magnitude ?? "—"} ${eq?.time || ""}</div>`
        );
      }
    }
  }

  lines.push(`<div style="margin-top:12px;color:#8b9bab">请继续注意防灾准备。本站为个人自用工具。</div>`);
  const content = lines.join("");
  const title = eewList.length || yamaList.length
    ? "地震预警 · 警戒情報汇总"
    : "地震预警 · 今夜平安";

  const actions: any[] = [];
  // 时间窗口去重：20 小时内发过 type=nightly 就跳过（错峰 cron 幂等）
  const WINDOW_HOURS = 20;
  const windowStart = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  for (const u of activeUsers) {
    const { data: recent, error: recentErr } = await admin
      .from("alerts")
      .select("id, created_at, quake_id")
      .eq("user_id", u.user_id)
      .eq("type", "nightly")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentErr) {
      actions.push({ user: u.user_id, skipped: true, error: recentErr.message });
      continue;
    }
    if (recent) {
      actions.push({
        user: u.user_id,
        skipped: true,
        reason: `within ${WINDOW_HOURS}h`,
        last_at: recent.created_at,
      });
      continue;
    }

    let pushed = false;
    if (pushToken) pushed = await sendPushPlus(pushToken, title, content);
    const quakeId = `nightly-${Date.now()}`;
    await admin.from("alerts").upsert({
      user_id: u.user_id,
      quake_id: quakeId,
      type: "nightly",
      title,
      content,
      shindo: null,
    }, { onConflict: "user_id,quake_id,type" });
    actions.push({ user: u.user_id, pushed, title, quake_id: quakeId });
  }

  return json({
    ok: true,
    title,
    eew: eewList.length,
    yamanashi: yamaList.length,
    actions,
    hibernatingSkipped: users.length - activeUsers.length,
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
