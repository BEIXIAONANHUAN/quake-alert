/**
 * 前端公开配置
 * 部署时把 Supabase 项目的 URL 与 anon key 填入下面两项即可。
 * anon key 本身可公开；service_role / PushPlus token 绝不可出现在这里。
 */
window.QUAKE_CONFIG = {
  // 例如：https://abcdefgh.supabase.co
  SUPABASE_URL: "YOUR_SUPABASE_URL",
  // 例如：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
  // 监测地区（固定）
  PREFECTURE: "山梨県",
  ADDRESS: "山梨県甲府市善光寺3-1-5",
  // P2P 地震情報
  P2P_API: "https://api.p2pquake.net/v2/history?codes=551,556&limit=20",
};
