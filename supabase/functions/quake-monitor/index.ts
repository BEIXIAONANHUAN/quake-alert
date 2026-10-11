// ============================================
// Edge Function: quake-monitor
// 每 5 分钟由 GitHub Actions 调用
// 1) 拉取 P2P 地震情報
// 2) 判定 EEW / 有感地震
// 3) 去重后 PushPlus 推送并写入 alerts
// ============================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const PREFECTURE = "山梨県";
/** 单用户固定身份 */
const FIXED_USER_ID = "00000000-0000-0000-0000-000000000001";
const P2P_URL = "https://api.p2pquake.net/v2/history?codes=551&codes=556&limit=20";
const PUSHPLUS_URL = "http://www.pushplus.plus/send";

/** P2P scale 编码 → 0~7 用户震度 */
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

function scaleText(v: unknown): string {
  const n = Number(v);
  const map: Record<number, string> = {
    0: "0", 10: "1", 20: "2", 30: "3", 40: "4",
    45: "5弱", 50: "5強", 55: "6弱", 60: "6強", 70: "7",
  };
  return map[n] !== undefined ? map[n] : (v === null || v === undefined ? "—" : String(v));
}

function userLevelToText(lv: number): string {
  if (lv < 0) return "无观测";
  return String(lv);
}

function nowJstString(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return (
    d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds())
  );
}

function isAuthorized(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET") || "";
  const auth = req.headers.get("authorization") || "";
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (secret && cronHeader === secret) return true;
  // Supabase 函数调用默认带 Authorization: Bearer <key>
  // 无 CRON_SECRET 时放行（仅内网/自有仓库触发）
  if (!secret) return true;
  if (auth.replace("Bearer ", "") === secret) return true;
  // 允许 service_role / anon 调用（test 场景）
  if (auth.startsWith("Bearer ey")) return true;
  return false;
}

async function sendPushPlus(token: string, title: string, content: string): Promise<boolean> {
  const body = {
    token,
    title,
    content,
    template: "html",
  };
  const res = await fetch(PUSHPLUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && (data?.code === 200 || data?.code === "200" || data?.code === undefined);
}

function extractYamanashiScale(item: any): number {
  const points: any[] = item?.points || item?.areas || [];
  let max = -1;
  for (const p of points) {
    const pref = String(p?.pref || "");
    if (pref.includes("山梨")) {
      const s = scaleToUser(p?.scale ?? p?.scaleFrom ?? p?.maxScale);
      if (s > max) max = s;
    }
  }
  return max;
}

function eewIncludesYamanashi(item: any): boolean {
  const areas: any[] = item?.areas || item?.points || [];
  for (const a of areas) {
    const pref = String(a?.pref || a?.name || "");
    if (pref.includes("山梨")) return true;
  }
  // 有些报文只写地区名
  const hypo = String(item?.earthquake?.hypocenter?.name || "");
  return hypo.includes("山梨");
}

function quakeDetailHtml(item: any, yamaLv: number): string {
  const eq = item?.earthquake || {};
  const hypo = eq?.hypocenter || {};
  const when = eq?.time || item?.time || "—";
  const mag = hypo?.magnitude ?? "—";
  const depth = hypo?.depth ?? "—";
  const name = hypo?.name || "震源不明";
  return [
    `<div>震源地：${name}</div>`,
    `<div>发震时刻：${when}</div>`,
    `<div>震级：M${mag}</div>`,
    `<div>山梨県震度：${userLevelToText(yamaLv)}</div>`,
    `<div>深度：${depth} km</div>`,
  ].join("");
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

  if (!isAuthorized(req)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pushToken = Deno.env.get("PUSHPLUS_TOKEN") || "";
  const admin = createClient(supabaseUrl, serviceKey);

  // 单用户模式：只读固定用户的设置
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

  // 拉取 P2P
  let items: any[] = [];
  try {
    const res = await fetch(P2P_URL, {
      headers: { "User-Agent": "quake-alert-personal/1.0" },
    });
    const text = await res.text();
    if (!res.ok) {
      return json({ ok: false, error: `P2P HTTP ${res.status}`, body: text.slice(0, 200) }, 502);
    }
    items = text ? JSON.parse(text) : [];
    if (!Array.isArray(items)) items = [];
  } catch (e) {
    return json({ ok: false, error: "P2P fetch failed: " + String(e) }, 502);
  }

  const results: any[] = [];
  const now = new Date();

  for (const item of items) {
    const code = item?.code;
    if (code !== 551 && code !== 556) continue;
    const quakeId = String(item?.id || item?.earthquake?.time || item?.time || "");

    // EEW（556）：警报地区含山梨 → 立即推
    if (code === 556) {
      if (!eewIncludesYamanashi(item)) continue;
      for (const u of activeUsers) {
        const title = "地震预警 · 緊急地震速報";
        const content =
          `<div><b>地震预警 ${nowJstString()}</b></div>` +
          quakeDetailHtml(item, extractYamanashiScale(item)) +
          `<div style="margin-top:8px;color:#f04438"><b>强烈摇晃即将到达，立即躲避到桌下</b></div>`;
        const dup = await admin
          .from("alerts")
          .select("id")
          .eq("user_id", u.user_id)
          .eq("quake_id", quakeId)
          .eq("type", "eew")
          .maybeSingle();
        if (dup.data) continue;

        let pushed = false;
        if (pushToken) {
          pushed = await sendPushPlus(pushToken, title, content);
        }
        await admin.from("alerts").upsert({
          user_id: u.user_id,
          quake_id: quakeId,
          type: "eew",
          title,
          content,
          shindo: extractYamanashiScale(item),
        }, { onConflict: "user_id,quake_id,type" });
        results.push({ user: u.user_id, type: "eew", pushed, quakeId });
      }
      continue;
    }

    // 有感地震（551）
    const yamaLv = extractYamanashiScale(item);
    for (const u of activeUsers) {
      const min = Number(u.min_shindo ?? 2);
      // 无山梨观测或低于下限 → 静默
      if (yamaLv < 0) continue;
      if (yamaLv < min) continue;

      const title = `地震预警 · 山梨震度${yamaLv}地震`;
      const content =
        `<div><b>地震预警 ${nowJstString()}</b></div>` +
        quakeDetailHtml(item, yamaLv);

      const dup = await admin
        .from("alerts")
        .select("id")
        .eq("user_id", u.user_id)
        .eq("quake_id", quakeId)
        .eq("type", "quake")
        .maybeSingle();
      if (dup.data) continue;

      let pushed = false;
      if (pushToken) {
        pushed = await sendPushPlus(pushToken, title, content);
      }
      await admin.from("alerts").upsert({
        user_id: u.user_id,
        quake_id: quakeId,
        type: "quake",
        title,
        content,
        shindo: yamaLv,
      }, { onConflict: "user_id,quake_id,type" });
      results.push({ user: u.user_id, type: "quake", pushed, quakeId, shindo: yamaLv });
    }
  }

  return json({
    ok: true,
    checked: items.length,
    activeUsers: activeUsers.length,
    hibernating: users.length - activeUsers.length,
    actions: results,
    at: now.toISOString(),
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
