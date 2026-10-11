/**
 * 前端公开配置
 * 部署时把 Supabase 项目的 URL 与 anon key 填入下面两项即可。
 * anon key 本身可公开；service_role / PushPlus token 绝不可出现在这里。
 */
window.QUAKE_CONFIG = {
  // 项目 URL
  SUPABASE_URL: "https://lmmcaioddkysfnasslvg.supabase.co",
  // anon key（可公开）
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbWNhaW9kZGt5c2ZuYXNzbHZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNjEwNTMsImV4cCI6MjEwMzgzNzA1M30.Z00eh691iKbyREMkK_nFQhG859C4KKkApCVRfuU54IM",
  // 单用户固定身份（网站唯一用户）
  FIXED_USER_ID: "00000000-0000-0000-0000-000000000001",
  // 监测地区（固定）
  PREFECTURE: "山梨県",
  ADDRESS: "山梨県甲府市善光寺3-1-5",
  // P2P 地震情報
  P2P_API: "https://api.p2pquake.net/v2/history?codes=551&codes=556&limit=20",
};
