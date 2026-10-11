/**
 * Supabase 客户端初始化（单用户模式，不依赖登录）
 */
(function () {
  const cfg = window.QUAKE_CONFIG;
  if (!window.supabase || !cfg || cfg.SUPABASE_URL === "YOUR_SUPABASE_URL") {
    console.warn("[地震预警] Supabase 尚未配置，请先填写 js/config.js");
  }

  window.QuakeDB = {
    client: null,
    ready: false,
    /** 网站唯一用户 */
    userId: (cfg && cfg.FIXED_USER_ID) || "00000000-0000-0000-0000-000000000001",

    init() {
      if (this.client) return this.client;
      if (!window.supabase || !cfg || cfg.SUPABASE_URL === "YOUR_SUPABASE_URL") {
        this.client = null;
        this.ready = false;
        return null;
      }
      this.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      this.ready = true;
      return this.client;
    },

    getUser() {
      return { id: this.userId };
    },
  };
})();
