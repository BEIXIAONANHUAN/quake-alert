/**
 * 邮箱魔法链接登录
 */
(function () {
  const $ = (sel) => document.querySelector(sel);

  function showLoginMsg(text, isError) {
    const el = $("#login-msg");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden", "err");
    if (isError) el.classList.add("err");
  }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = ($("#login-email").value || "").trim();
    const btn = $("#login-btn");
    if (!email) return;

    btn.disabled = true;
    btn.textContent = "发送中…";
    try {
      const sb = window.QuakeDB.init();
      if (!sb) {
        throw new Error("尚未配置 Supabase，请先填写 js/config.js");
      }
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      showLoginMsg("魔法链接已发送，请打开邮箱点击链接完成登录。");
    } catch (err) {
      showLoginMsg(err.message || "发送失败，请稍后重试", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "发送魔法链接";
    }
  }

  async function handleLogout() {
    try {
      await window.QuakeDB.signOut();
      window.AppUI.showLogin();
      window.AppUI.toast("已退出登录", "ok");
    } catch (err) {
      window.AppUI.toast(err.message || "退出失败", "err");
    }
  }

  window.QuakeAuth = {
    bind() {
      const form = $("#login-form");
      if (form) form.addEventListener("submit", handleLoginSubmit);
      const logout = $("#logout-btn");
      if (logout) logout.addEventListener("click", handleLogout);
    },
  };
})();
