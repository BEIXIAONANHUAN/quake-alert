/**
 * Supabase 客户端初始化
 */
(function () {
  const cfg = window.QUAKE_CONFIG;
  if (!window.supabase || !cfg || cfg.SUPABASE_URL === "YOUR_SUPABASE_URL") {
    console.warn("[地震预警] Supabase 尚未配置，请先填写 js/config.js");
  }

  window.QuakeDB = {
    client: null,
    ready: false,

    init() {
      if (this.client) return this.client;
      if (!window.supabase || !cfg || cfg.SUPABASE_URL === "YOUR_SUPABASE_URL") {
        this.client = null;
        this.ready = false;
        return null;
      }
      this.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      this.ready = true;
      return this.client;
    },

    async getSession() {
      const sb = this.init();
      if (!sb) return null;
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    async getUser() {
      const sb = this.init();
      if (!sb) return null;
      const { data, error } = await sb.auth.getUser();
      if (error) throw error;
      return data.user;
    },

    onAuthStateChange(cb) {
      const sb = this.init();
      if (!sb) return { data: { subscription: null } };
      return sb.auth.onAuthStateChange(cb);
    },

    async signOut() {
      const sb = this.init();
      if (!sb) return;
      await sb.auth.signOut();
    },
  };
})();
