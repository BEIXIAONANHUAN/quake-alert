// ============================================
// Edge Function: test-push
// 单用户模式：无需登录，直接发测试推送
// ============================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const PUSHPLUS_URL = "http://www.pushplus.plus/send";
/** 单用户固定身份 */
const FIXED_USER_ID = "00000000-0000-0000-0000-000000000001";

function nowJstString(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return (
    d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds())
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pushToken = Deno.env.get("PUSHPLUS_TOKEN") || "";

  if (!pushToken) {
    return json({ ok: false, message: "尚未配置 PUSHPLUS_TOKEN" }, 500);
  }

  const title = "地震预警 · 测试推送";
  const content =
    `<div><b>地震预警 测试推送 ${nowJstString()}</b></div>` +
    `<div>这是一条测试消息，说明 PushPlus 通道工作正常。</div>` +
    `<div>监测地点：山梨県甲府市善光寺3-1-5</div>` +
    `<div>若你能看到本条微信通知，部署已成功。</div>`;

  try {
    const res = await fetch(PUSHPLUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: pushToken,
        title,
        content,
        template: "html",
      }),
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && (data?.code === 200 || data?.code === "200");

    const admin = createClient(supabaseUrl, serviceKey);
    await admin.from("alerts").upsert({
      user_id: FIXED_USER_ID,
      quake_id: `test-${Date.now()}`,
      type: "test",
      title,
      content,
      shindo: null,
    }, { onConflict: "user_id,quake_id,type" });

    return json({
      ok,
      message: ok ? "测试推送已发送" : `PushPlus 返回：${JSON.stringify(data)}`,
      pushplus: data,
    });
  } catch (e) {
    return json({ ok: false, message: String(e) }, 500);
  }
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
