/**
 * 设置页逻辑：震度下限 / 冬眠 / 测试推送（单用户）
 */
(function () {
  const $ = (sel) => document.querySelector(sel);

  function shindoText(v) {
    const map = {
      0: "0（无感/仅仪器）",
      1: "1",
      2: "2",
      3: "3",
      4: "4",
      5: "5（含弱/强）",
      6: "6（含弱/强）",
      7: "7",
    };
    return map[String(v)] ?? String(v);
  }

  function confirmDialog(title, body) {
    return new Promise((resolve) => {
      const modal = $("#modal");
      const ok = $("#modal-ok");
      const cancel = $("#modal-cancel");
      $("#modal-title").textContent = title;
      $("#modal-body").textContent = body;
      modal.classList.remove("hidden");

      const cleanup = () => {
        modal.classList.add("hidden");
        ok.onclick = null;
        cancel.onclick = null;
      };
      ok.onclick = () => {
        cleanup();
        resolve(true);
      };
      cancel.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  }

  function setSlider(value) {
    const slider = $("#min-shindo");
    const label = $("#min-shindo-val");
    if (slider) slider.value = String(value);
    if (label) label.textContent = String(value);
    const meta = $("#meta-min-shindo");
    if (meta) meta.textContent = shindoText(value);
  }

  function setHibernateButton(isHibernating) {
    const btn = $("#hibernate-btn");
    if (!btn) return;
    if (isHibernating) {
      btn.textContent = "关闭冬眠";
      btn.classList.remove("btn-warn");
      btn.classList.add("btn-primary");
    } else {
      btn.textContent = "开启冬眠";
      btn.classList.add("btn-warn");
      btn.classList.remove("btn-primary");
    }
  }

  async function loadSettings() {
    const user = window.QuakeDB.getUser();
    const sb = window.QuakeDB.init();
    let { data, error } = await sb
      .from("settings")
      .select("min_shindo, is_hibernating")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    // 首次使用自动插入默认设置
    if (!data) {
      const { data: inserted, error: insErr } = await sb
        .from("settings")
        .insert({ user_id: user.id, min_shindo: 2, is_hibernating: false })
        .select("min_shindo, is_hibernating")
        .single();
      if (insErr) throw insErr;
      data = inserted;
    }
    return data;
  }

  async function saveMinShindo(value) {
    const user = window.QuakeDB.getUser();
    const sb = window.QuakeDB.init();
    const { error } = await sb
      .from("settings")
      .upsert({ user_id: user.id, min_shindo: value }, { onConflict: "user_id" });
    if (error) throw error;
  }

  async function saveHibernation(flag) {
    const user = window.QuakeDB.getUser();
    const sb = window.QuakeDB.init();
    const { error } = await sb
      .from("settings")
      .upsert({ user_id: user.id, is_hibernating: flag }, { onConflict: "user_id" });
    if (error) throw error;
  }

  async function sendTestPush() {
    const sb = window.QuakeDB.init();
    const { data, error } = await sb.functions.invoke("test-push", {
      body: { source: "settings-page", user_id: window.QuakeDB.userId },
    });
    if (error) throw error;
    return data;
  }

  window.QuakeSettings = {
    setSlider,
    setHibernateButton,
    loadSettings,
    confirmDialog,
    bind() {
      const slider = $("#min-shindo");
      if (slider) {
        slider.addEventListener("input", () => {
          $("#min-shindo-val").textContent = slider.value;
        });
        slider.addEventListener("change", async () => {
          const val = Number(slider.value);
          try {
            await saveMinShindo(val);
            window.QuakeSettings.setSlider(val);
            window.AppUI.toast(`震度下限已设为 ${val}`, "ok");
            window.AppUI.refreshDashboard();
          } catch (err) {
            window.AppUI.toast(err.message || "保存失败", "err");
          }
        });
      }

      const hib = $("#hibernate-btn");
      if (hib) {
        hib.addEventListener("click", async () => {
          const user = window.QuakeDB.getUser();
          const sb = window.QuakeDB.init();
          const { data } = await sb
            .from("settings")
            .select("is_hibernating")
            .eq("user_id", user.id)
            .maybeSingle();
          const current = Boolean(data && data.is_hibernating);
          const next = !current;
          const ok = await confirmDialog(
            next ? "开启冬眠模式" : "关闭冬眠模式",
            next
              ? "开启后将停止全部地震监控与推送（含夜间汇总）。确定开启？"
              : "关闭冬眠后将恢复监控与推送。确定关闭？"
          );
          if (!ok) return;
          try {
            await saveHibernation(next);
            window.QuakeSettings.setHibernateButton(next);
            window.AppUI.applyStatusFromSettings(next);
            window.AppUI.toast(next ? "已进入冬眠 🛌" : "已恢复工作中", "ok");
          } catch (err) {
            window.AppUI.toast(err.message || "操作失败", "err");
          }
        });
      }

      const testBtn = $("#test-push-btn");
      if (testBtn) {
        testBtn.addEventListener("click", async () => {
          testBtn.disabled = true;
          testBtn.textContent = "发送中…";
          try {
            const result = await sendTestPush();
            window.AppUI.toast(
              result && result.ok
                ? "测试推送已发送，请查看微信"
                : result && result.message
                  ? result.message
                  : "已请求发送",
              result && result.ok === false ? "err" : "ok"
            );
          } catch (err) {
            window.AppUI.toast(err.message || "测试推送失败", "err");
          } finally {
            testBtn.disabled = false;
            testBtn.textContent = "发送测试推送";
          }
        });
      }
    },
  };
})();
