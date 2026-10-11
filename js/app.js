/**
 * 主应用：仪表盘 / 实时地震 / 统计 / 状态灯
 */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const cfg = window.QUAKE_CONFIG || {};

  /* ---------- 工具 ---------- */
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatJST(dateLike) {
    if (!dateLike) return "—";
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return String(dateLike);
    // 固定按日本时间展示（UTC+9）
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return (
      jst.getUTCFullYear() +
      "-" +
      pad(jst.getUTCMonth() + 1) +
      "-" +
      pad(jst.getUTCDate()) +
      " " +
      pad(jst.getUTCHours()) +
      ":" +
      pad(jst.getUTCMinutes())
    );
  }

  function formatJSTFull(dateLike) {
    if (!dateLike) return "—";
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return String(dateLike);
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return (
      jst.getUTCFullYear() +
      "-" +
      pad(jst.getUTCMonth() + 1) +
      "-" +
      pad(jst.getUTCDate()) +
      " " +
      pad(jst.getUTCHours()) +
      ":" +
      pad(jst.getUTCMinutes()) +
      ":" +
      pad(jst.getUTCSeconds())
    );
  }

  // P2P maxScale / scale 编码 → 展示震度
  function scaleText(v) {
    if (v === null || v === undefined || v === "") return "—";
    const n = Number(v);
    if (Number.isNaN(n)) return "—";
    const map = {
      0: "0",
      10: "1",
      20: "2",
      30: "3",
      40: "4",
      45: "5弱",
      50: "5強",
      55: "6弱",
      60: "6強",
      70: "7",
    };
    return map[n] !== undefined ? map[n] : String(n);
  }

  // 用于与「用户下限（0~7）」比较的归一化震度
  function scaleToUser(v) {
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

  function shindoClass(userLevel) {
    if (userLevel >= 5) return "lv5";
    if (userLevel === 4) return "lv4";
    if (userLevel === 3) return "lv3";
    if (userLevel === 2) return "lv2";
    if (userLevel === 1) return "lv1";
    return "lv0";
  }

  function toast(msg, type) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden", "ok", "err");
    if (type) el.classList.add(type);
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- 视图切换 ---------- */
  function showLogin() {
    $("#view-login")?.classList.remove("hidden");
    $("#view-main")?.classList.add("hidden");
  }

  function showMain() {
    $("#view-login")?.classList.add("hidden");
    $("#view-main")?.classList.remove("hidden");
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    $("#tab-dashboard")?.classList.toggle("hidden", name !== "dashboard");
    $("#tab-settings")?.classList.toggle("hidden", name !== "settings");
    if (name === "dashboard") refreshDashboard();
    if (name === "settings") refreshSettings();
  }

  /* ---------- 状态灯 ---------- */
  function applyStatusFromSettings(isHibernating, hasActiveAlert) {
    const hero = $("#status-hero");
    const glyph = $("#status-glyph");
    const label = $("#status-label");
    const desc = $("#status-desc");
    if (!hero) return;

    hero.classList.remove("is-hibernate", "is-alert");
    if (hasActiveAlert) {
      hero.classList.add("is-alert");
      glyph.textContent = "🔴";
      label.textContent = "当前有活跃警戒";
      desc.textContent = "检测到緊急地震速報，请注意安全";
    } else if (isHibernating) {
      hero.classList.add("is-hibernate");
      glyph.textContent = "😴";
      label.textContent = "冬眠中";
      desc.textContent = "监控与推送已全部暂停";
    } else {
      glyph.textContent = "🟢";
      label.textContent = "工作中";
      desc.textContent = "正在监测山梨県地震活动";
    }
    window.QuakeSettings?.setHibernateButton(Boolean(isHibernating));
  }

  /* ---------- 最近提醒 ---------- */
  // 緊急地震速報 红色置顶，其余按时间倒序
  function sortAlerts(list) {
    return (list || []).slice().sort((a, b) => {
      const aEew = a.type === "eew" ? 0 : 1;
      const bEew = b.type === "eew" ? 0 : 1;
      if (aEew !== bEew) return aEew - bEew;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  function renderAlerts(list) {
    const box = $("#alerts-list");
    if (!box) return;
    const rows = sortAlerts(list);
    if (!rows.length) {
      box.innerHTML = '<div class="empty muted">暂无提醒记录</div>';
      return;
    }
    box.innerHTML = rows
      .map((item) => {
        const isEew = item.type === "eew";
        const isNightly = item.type === "nightly";
        const badge = isEew
          ? '<span class="badge badge-eew">緊急地震速報</span>'
          : isNightly
            ? '<span class="badge badge-nightly">夜间汇总</span>'
            : '<span class="badge badge-quake">有感地震</span>';
        const cls = isEew ? "card eew" : isNightly ? "card nightly" : "card quiet";
        return `
          <article class="${cls}">
            <div class="card-top">
              <div class="card-title">${badge}${escapeHtml(item.title || "")}</div>
              <div class="card-time">${formatJST(item.created_at)}</div>
            </div>
            <div class="card-body">${escapeHtml(item.content || "")}</div>
          </article>
        `;
      })
      .join("");
  }

  async function loadAlerts() {
    const user = await window.QuakeDB.getUser();
    if (!user) return [];
    const sb = window.QuakeDB.init();
    const { data, error } = await sb
      .from("alerts")
      .select("id, quake_id, type, title, content, shindo, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data || [];
  }

  /* ---------- 实时地震 ---------- */
  function extractYamanashiScale(item) {
    const points = item.points || item.areas || [];
    let max = -1;
    for (const p of points) {
      const pref = p.pref || "";
      if (pref.includes("山梨")) {
        const s = scaleToUser(p.scale ?? p.maxScale ?? p.scaleFrom);
        if (s > max) max = s;
      }
    }
    return max;
  }

  function extractMaxScale(item) {
    const eq = item.earthquake || {};
    if (eq.maxScale !== undefined && eq.maxScale !== null) return scaleToUser(eq.maxScale);
    const points = item.points || item.areas || [];
    let max = -1;
    for (const p of points) {
      const s = scaleToUser(p.scale ?? p.scaleFrom ?? p.maxScale);
      if (s > max) max = s;
    }
    return max;
  }

  function renderQuakes(list, minShindo) {
    const box = $("#quakes-list");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="empty muted">暂无地震数据</div>';
      return;
    }
    box.innerHTML = list
      .map((item) => {
        const eq = item.earthquake || {};
        const hypo = eq.hypocenter || {};
        const yama = extractYamanashiScale(item);
        const maxLv = extractMaxScale(item);
        const hit = yama >= minShindo;
        const pillLv = yama >= 0 ? yama : maxLv;
        const pillText = yama >= 0 ? `山梨 ${yama}` : `最大 ${maxLv < 0 ? "—" : maxLv}`;
        const when = eq.time || item.time || item.earthquake?.originTime;
        const status = yama < 0 ? "无山梨观测" : hit ? `<span class="badge badge-hit">达下限</span>` : "未达下限";
        return `
          <article class="card ${hit ? "hit quake-hit" : ""}">
            <div class="quake-row">
              <div class="quake-main">
                <div class="quake-name">${escapeHtml(hypo.name || "震源不明")}</div>
                <div class="quake-sub">
                  ${formatJST(when)} · M${escapeHtml(hypo.magnitude ?? "—")} · 深${escapeHtml(hypo.depth ?? "—")}km
                  · 山梨 ${status}
                </div>
              </div>
              <div class="shindo-pill ${shindoClass(pillLv)}">${escapeHtml(pillText)}</div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadQuakes() {
    const res = await fetch(cfg.P2P_API || "https://api.p2pquake.net/v2/history?codes=551,556&limit=20");
    if (!res.ok) throw new Error("地震接口请求失败：" + res.status);
    const raw = await res.json();
    return (raw || []).filter((x) => x.code === 551 || x.code === 556);
  }

  /* ---------- 统计 ---------- */
  function last30Keys() {
    const keys = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() + 9 * 3600 * 1000);
      d.setUTCDate(d.getUTCDate() - i);
      keys.push(
        d.getUTCFullYear() +
          "-" +
          pad(d.getUTCMonth() + 1) +
          "-" +
          pad(d.getUTCDate())
      );
    }
    return keys;
  }

  function dayKey(dateLike) {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    const jst = new Date(d.getTime() + 9 * 3600 * 1000);
    return (
      jst.getUTCFullYear() +
      "-" +
      pad(jst.getUTCMonth() + 1) +
      "-" +
      pad(jst.getUTCDate())
    );
  }

  function renderDailyChart(countMap) {
    const box = $("#daily-chart");
    if (!box) return;
    const keys = last30Keys();
    const vals = keys.map((k) => countMap[k] || 0);
    const max = Math.max(1, ...vals);
    const range = $("#stats-range");
    if (range) range.textContent = keys[0] + " ~ " + keys[29];

    box.innerHTML = keys
      .map((k, i) => {
        const v = vals[i];
        const h = Math.max(4, Math.round((v / max) * 110));
        const showLabel = i % 5 === 0 || i === keys.length - 1;
        return `
          <div class="bar-col" title="${k}：${v} 次">
            <div class="bar-val">${v || ""}</div>
            <div class="bar ${v ? "" : "zero"}" style="height:${h}px"></div>
            <div class="bar-label">${showLabel ? k.slice(5) : ""}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderShindoChart(dist) {
    const box = $("#shindo-chart");
    if (!box) return;
    const labels = ["0-1", "2", "3", "4", "5+", "6+", "7"];
    const values = labels.map((_, idx) => {
      if (idx === 0) return (dist[0] || 0) + (dist[1] || 0);
      if (idx === 1) return dist[2] || 0;
      if (idx === 2) return dist[3] || 0;
      if (idx === 3) return dist[4] || 0;
      if (idx === 4) return (dist[5] || 0) + (dist[6] || 0);
      if (idx === 5) return (dist[7] || 0) + (dist[8] || 0);
      return dist[9] || 0;
    });
    const max = Math.max(1, ...values);
    box.innerHTML = labels
      .map((lab, i) => {
        const v = values[i];
        const pct = Math.round((v / max) * 100);
        const hot = i >= 3 ? "hot" : "";
        return `
          <div class="hbar-row">
            <div class="hbar-label">${lab}</div>
            <div class="hbar-track"><div class="hbar-fill ${hot}" style="width:${pct}%"></div></div>
            <div class="hbar-num">${v}</div>
          </div>
        `;
      })
      .join("");
  }

  async function loadStats() {
    // 用公开 P2P 历史拉近30天：接口 limit 100 足够做展示统计
    const res = await fetch("https://api.p2pquake.net/v2/history?codes=551&limit=100");
    if (!res.ok) throw new Error("统计接口失败");
    const raw = await res.json() || [];
    const keys = new Set(last30Keys());
    const countMap = {};
    const dist = {};
    for (const item of raw) {
      const k = dayKey(item.time || item.earthquake?.time || item.timestamp?.register);
      if (!k || !keys.has(k)) continue;
      countMap[k] = (countMap[k] || 0) + 1;
      const lv = extractMaxScale(item);
      if (lv >= 0) dist[lv] = (dist[lv] || 0) + 1;
    }
    renderDailyChart(countMap);
    renderShindoChart(dist);
  }

  /* ---------- 设置刷新 ---------- */
  async function refreshSettings() {
    try {
      const s = await window.QuakeSettings.loadSettings();
      if (s) {
        window.QuakeSettings.setSlider(Number(s.min_shindo ?? 2));
        window.QuakeSettings.setHibernateButton(Boolean(s.is_hibernating));
      }
    } catch (err) {
      toast(err.message || "读取设置失败", "err");
    }
  }

  async function refreshDashboard() {
    $("#meta-updated").textContent = formatJSTFull(new Date());
    let minShindo = 2;
    let isHibernating = false;
    try {
      const s = await window.QuakeSettings.loadSettings();
      if (s) {
        minShindo = Number(s.min_shindo ?? 2);
        isHibernating = Boolean(s.is_hibernating);
        window.QuakeSettings.setSlider(minShindo);
        window.QuakeSettings.setHibernateButton(isHibernating);
      }
    } catch (_) {
      /* ignore */
    }

    let alerts = [];
    try {
      alerts = await loadAlerts();
      renderAlerts(alerts);
      const last = alerts[0];
      $("#meta-last-push").textContent = last ? formatJST(last.created_at) : "—";
    } catch (err) {
      $("#alerts-list").innerHTML = `<div class="empty muted">${escapeHtml(err.message || "加载提醒失败")}</div>`;
    }

    // 活跃警戒：最近 2 小时内有 eew 记录
    const recentEew = alerts.find(
      (a) => a.type === "eew" && Date.now() - new Date(a.created_at).getTime() < 2 * 3600 * 1000
    );
    applyStatusFromSettings(isHibernating, Boolean(recentEew));

    try {
      const quakes = await loadQuakes();
      renderQuakes(quakes, minShindo);
    } catch (err) {
      $("#quakes-list").innerHTML = `<div class="empty muted">${escapeHtml(err.message || "加载地震失败")}</div>`;
    }

    try {
      await loadStats();
    } catch (err) {
      $("#daily-chart").innerHTML = `<div class="empty muted">${escapeHtml(err.message || "统计失败")}</div>`;
    }
  }

  /* ---------- 演示模式（未接数据库时预览 UI） ---------- */
  function isDemo() {
    return new URLSearchParams(location.search).get("demo") === "1";
  }

  function loadDemo() {
    showMain();
    applyStatusFromSettings(false, true);
    $("#meta-min-shindo").textContent = "2";
    $("#meta-last-push").textContent = "2026-10-11 21:40";
    $("#meta-updated").textContent = formatJSTFull(new Date());
    renderAlerts([
      {
        type: "eew",
        title: "地震预警 · 緊急地震速報",
        content: "地震预警 2026-10-11 21:40:00\n震源地：山梨県東部\n发震时刻：2026/10/11 21:38:12\n震级：M5.2\n山梨県震度：3\n深度：10 km\n强烈摇晃即将到达，立即躲避到桌下",
        created_at: new Date().toISOString(),
      },
      {
        type: "quake",
        title: "地震预警 · 山梨震度3地震",
        content: "地震预警 2026-10-10 08:12:00\n震源地：山梨県中・西部\n震级：M4.1\n山梨県震度：3\n深度：15 km",
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        type: "nightly",
        title: "地震预警 · 今夜平安",
        content: "地震预警 夜间汇总 2026-10-10 00:00:00\n监测地点：山梨県 甲府市善光寺3-1-5\n今夜平安，未监测到山梨県相关緊急地震速報或有感地震。",
        created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ]);
    renderQuakes(
      [
        {
          code: 551,
          earthquake: {
            time: "2026/10/11 15:49:00",
            hypocenter: { name: "山梨県東部", magnitude: 3.2, depth: 10 },
            maxScale: 30,
          },
          points: [{ pref: "山梨県", scale: 30 }],
        },
        {
          code: 551,
          earthquake: {
            time: "2026/10/11 12:10:00",
            hypocenter: { name: "宮崎県南部平野部", magnitude: 2.3, depth: 10 },
            maxScale: 10,
          },
          points: [{ pref: "宮崎県", scale: 10 }],
        },
        {
          code: 551,
          earthquake: {
            time: "2026/10/11 10:12:00",
            hypocenter: { name: "長野県南部", magnitude: 2.8, depth: 10 },
            maxScale: 10,
          },
          points: [{ pref: "長野県", scale: 10 }],
        },
      ],
      2
    );
    const countMap = {};
    const dist = { 1: 4, 2: 6, 3: 3, 4: 1 };
    last30Keys().forEach((k, i) => {
      countMap[k] = i % 7 === 0 ? 4 : i % 3 === 0 ? 2 : i % 2 === 0 ? 1 : 0;
    });
    renderDailyChart(countMap);
    renderShindoChart(dist);
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    window.QuakeAuth.bind();
    window.QuakeSettings.bind();

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
    $("#refresh-alerts")?.addEventListener("click", () => {
      refreshDashboard();
      toast("已刷新", "ok");
    });
    $("#refresh-quakes")?.addEventListener("click", () => {
      refreshDashboard();
      toast("已刷新", "ok");
    });

    // PWA
    if ("serviceWorker" in navigator && !isDemo()) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    if (isDemo()) {
      loadDemo();
      return;
    }

    const session = await window.QuakeDB.getSession().catch(() => null);
    if (session) {
      showMain();
      await refreshSettings();
      await refreshDashboard();
    } else {
      showLogin();
    }

    window.QuakeDB.onAuthStateChange(async (event, session) => {
      if (session) {
        showMain();
        await refreshSettings();
        await refreshDashboard();
      } else if (event === "SIGNED_OUT") {
        showLogin();
      }
    });
  }

  window.AppUI = {
    showLogin,
    showMain,
    toast,
    refreshDashboard,
    applyStatusFromSettings,
    switchTab,
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
