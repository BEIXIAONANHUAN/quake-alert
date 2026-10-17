/**
 * 主应用：仪表盘 / 预警历史 / 实时地震 / 设置
 * 单用户模式（固定 user_id）
 */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const cfg = window.QUAKE_CONFIG || {};
  const PAGE_SIZE = 20;

  let historyOffset = 0;
  let currentAlerts = [];

  /* ---------- 工具 ---------- */
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatJST(dateLike) {
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

  /** 剥离 HTML 标签，保留换行，按纯文本展示 */
  function stripHtml(html) {
    if (html == null) return "";
    let s = String(html);
    // 把常见块级标签转成换行，避免文字粘连
    s = s.replace(/<\/(div|p|br|li|tr|h[1-6])>/gi, "\n");
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<[^>]+>/g, "");
    // 还原常用实体
    s = s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    // 压缩多余空行
    s = s
      .split("\n")
      .map((line) => line.trim())
      .filter((line, i, arr) => !(line === "" && (i === 0 || arr[i - 1] === "")))
      .join("\n")
      .trim();
    return s;
  }

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

  /** 完整震度文案（5弱/5強、6弱/6強） */
  function scaleText(v) {
    const n = Number(v);
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
    if (map[n] !== undefined) return map[n];
    const lv = scaleToUser(v);
    return lv < 0 ? "—" : String(lv);
  }

  function shindoClass(userLevel) {
    if (userLevel >= 5) return "lv5";
    if (userLevel === 4) return "lv4";
    if (userLevel === 3) return "lv3";
    if (userLevel === 2) return "lv2";
    if (userLevel === 1) return "lv1";
    return "lv0";
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function isDemo() {
    return new URLSearchParams(location.search).get("demo") === "1";
  }

  /* ---------- 页面导航 ---------- */
  function showPage(name) {
    const pages = ["dashboard", "history", "quakes", "settings"];
    const target = pages.includes(name) ? name : "dashboard";

    document.querySelectorAll(".page").forEach((p) => {
      p.classList.toggle("active", p.id === "page-" + target);
    });
    document.querySelectorAll(".nav-item").forEach((n) => {
      n.classList.toggle("active", n.dataset.page === target);
    });

    if (!isDemo()) {
      if (target === "dashboard") refreshDashboard();
      if (target === "history") refreshHistory(true);
      if (target === "quakes") refreshQuakesPage();
      if (target === "settings") refreshSettings();
    }
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* ---------- 冬眠 UI ---------- */
  function setHibernateUI(isHibernating) {
    const screen = $("#hibernate-screen");
    const topbar = $("#topbar");
    const nav = $("#bottom-nav");
    const topPill = $("#top-status-pill");

    if (isHibernating) {
      screen?.classList.remove("hidden");
      topbar?.classList.add("dimmed");
      nav?.classList.add("dimmed");
      if (topPill) topPill.textContent = "😴 冬眠中";
      document.body.classList.add("is-hibernating");
    } else {
      screen?.classList.add("hidden");
      topbar?.classList.remove("dimmed");
      nav?.classList.remove("dimmed");
      if (topPill) topPill.textContent = "🟢 工作中";
      document.body.classList.remove("is-hibernating");
    }
    window.QuakeSettings?.setHibernateButton(Boolean(isHibernating));
  }

  function applyStatusFromSettings(isHibernating, hasActiveAlert) {
    const hero = $("#panel-status");
    const glyph = $("#status-glyph");
    const label = $("#status-label");
    const desc = $("#status-desc");
    const topPill = $("#top-status-pill");

    if (isHibernating) {
      setHibernateUI(true);
      if (hero) hero.classList.add("is-hibernate");
      if (glyph) glyph.textContent = "😴";
      if (label) label.textContent = "冬眠中";
      if (desc) desc.textContent = "监控与推送已全部暂停";
      return;
    }

    setHibernateUI(false);
    if (hero) {
      hero.classList.remove("is-hibernate", "is-alert");
      if (hasActiveAlert) hero.classList.add("is-alert");
    }
    if (hasActiveAlert) {
      if (glyph) glyph.textContent = "🔴";
      if (label) label.textContent = "当前有活跃警戒";
      if (desc) desc.textContent = "检测到緊急地震速報，请注意安全";
      if (topPill) topPill.textContent = "🔴 活跃警戒";
    } else {
      if (glyph) glyph.textContent = "🟢";
      if (label) label.textContent = "工作中";
      if (desc) desc.textContent = "正在监测山梨県地震活动";
      if (topPill) topPill.textContent = "🟢 工作中";
    }
  }

  /* ---------- 提醒列表 ---------- */
  function sortAlerts(list) {
    return (list || []).slice().sort((a, b) => {
      const aEew = a.type === "eew" ? 0 : 1;
      const bEew = b.type === "eew" ? 0 : 1;
      if (aEew !== bEew) return aEew - bEew;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  function alertCardHtml(item) {
    const isEew = item.type === "eew";
    const isNightly = item.type === "nightly";
    const isTest = item.type === "test";
    const badge = isEew
      ? '<span class="badge badge-eew">緊急地震速報</span>'
      : isTest
        ? '<span class="badge badge-test">测试推送</span>'
        : isNightly
          ? '<span class="badge badge-nightly">夜间汇总</span>'
          : '<span class="badge badge-quake">有感地震</span>';
    const cls = isEew
      ? "card eew"
      : isTest
        ? "card test"
        : isNightly
          ? "card nightly"
          : "card quiet";
    const text = stripHtml(item.content);
    return `
      <article class="${cls}">
        <div class="card-top">
          <div class="card-title">${badge}${escapeHtml(item.title || "")}</div>
          <div class="card-time">${formatJST(item.created_at)}</div>
        </div>
        <div class="card-body">${escapeHtml(text)}</div>
      </article>
    `;
  }

  function renderAlertsInto(el, list, emptyText) {
    if (!el) return;
    const rows = sortAlerts(list);
    if (!rows.length) {
      el.innerHTML = `<div class="empty muted">${escapeHtml(emptyText || "暂无提醒记录")}</div>`;
      return;
    }
    el.innerHTML = rows.map(alertCardHtml).join("");
  }

  async function loadAlerts(limit, offset) {
    const user = window.QuakeDB.getUser();
    const sb = window.QuakeDB.init();
    let q = sb
      .from("alerts")
      .select("id, quake_id, type, title, content, shindo, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /* ---------- 地震 ---------- */
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

  /** 山梨 raw scale（10/20/…/45/50/55…），用于 5弱/5強 文案 */
  function extractYamanashiRawScale(item) {
    const points = item.points || item.areas || [];
    let max = -1;
    for (const p of points) {
      const pref = p.pref || "";
      if (pref.includes("山梨")) {
        const s = Number(p.scale ?? p.scaleFrom ?? p.maxScale);
        if (!Number.isNaN(s) && s > max) max = s;
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

  /* ---------- 未知值 / 异常值 / 事件合并 ---------- */
  const MAG_ABNORMAL = 9.5;

  function formatMag(mag) {
    if (mag === null || mag === undefined || mag === "") return "—";
    const n = Number(mag);
    if (Number.isNaN(n)) return "—";
    if (n > MAG_ABNORMAL) return `M${n}`;
    return `M${n}`;
  }

  function formatDepth(depth) {
    if (depth === null || depth === undefined || depth === "") return "不明";
    const n = Number(depth);
    if (Number.isNaN(n)) return "不明";
    if (n < 0) return "不明";
    return `${n}km`;
  }

  function formatDepthDisplay(depth) {
    const t = formatDepth(depth);
    return t === "不明" ? "深度不明" : `深${t}`;
  }

  function formatName(name) {
    const s = String(name || "").trim();
    return s || "震源不明";
  }

  function isAbnormalMag(mag) {
    const n = Number(mag);
    return !Number.isNaN(n) && n > MAG_ABNORMAL;
  }

  function isUnknownMag(mag) {
    return mag === null || mag === undefined || mag === "" || Number.isNaN(Number(mag));
  }

  /** 发震时刻 → ms（本地解析 "2026/10/16 12:38:00"） */
  function parseQuakeTime(item) {
    const eq = item?.earthquake || {};
    const raw = eq.time || item?.time;
    if (!raw) return NaN;
    const s = String(raw).replace(/\//g, "-").replace("T", " ");
    // "2026-10-16 12:38:00" or with .xxx
    const d = new Date(s.replace(" ", "T") + (String(s).includes("Z") ? "" : ""));
    if (!Number.isNaN(d.getTime())) return d.getTime();
    return new Date(String(raw).replace(/\//g, "-")).getTime();
  }

  /** 报文完整度评分：越高越优先展示 */
  function quakeScore(item) {
    const eq = item?.earthquake || {};
    const h = eq?.hypocenter || {};
    const name = String(h?.name || "").trim();
    const mag = h?.magnitude;
    const depth = h?.depth;
    const points = (item?.points || item?.areas || []).length;
    let score = 0;
    if (name && name !== "震源不明") score += 50;
    if (!isUnknownMag(mag) && !isAbnormalMag(mag)) score += 40;
    else if (!isUnknownMag(mag)) score += 10;
    if (depth !== null && depth !== undefined && Number(depth) >= 0) score += 15;
    if (item?.code === 551) score += 20; // 正式地震情报优于 EEW 初报
    if (eq?.maxScale != null) score += 5;
    score += Math.min(points, 30);
    // 略偏新报
    const t = parseQuakeTime(item);
    if (!Number.isNaN(t)) score += Math.min(5, t / 1e15);
    return score;
  }

  /**
   * 合并同一事件：发震时刻 ±windowMin 分钟内归为一组
   * 每组只保留最完整的一条
   */
  function mergeQuakes(items, windowMin) {
    const windowMs = (windowMin ?? 10) * 60 * 1000;
    const list = (items || [])
      .map((item) => ({ item, t: parseQuakeTime(item), score: quakeScore(item) }))
      .filter((x) => !Number.isNaN(x.t))
      .sort((a, b) => b.t - a.t); // 新→旧

    const kept = [];
    for (const cand of list) {
      const dup = kept.find((k) => Math.abs(k.t - cand.t) <= windowMs);
      if (!dup) {
        kept.push(cand);
        continue;
      }
      // 已有代表条 vs 候选：保留更完整；同分取更新
      if (
        cand.score > dup.score ||
        (cand.score === dup.score && cand.t > dup.t)
      ) {
        dup.item = cand.item;
        dup.t = cand.t;
        dup.score = cand.score;
      }
    }
    return kept.map((k) => k.item);
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
        const yamaRaw = extractYamanashiRawScale(item);
        const maxLv = extractMaxScale(item);
        const hit = yama >= minShindo;
        const pillLv = yama >= 0 ? yama : maxLv;
        const pillText =
          yama >= 0 ? `山梨 ${scaleText(yamaRaw)}` : `最大 ${maxLv < 0 ? "—" : maxLv}`;
        const when = eq.time || item.time;

        const nameText = formatName(hypo.name);
        const magText = formatMag(hypo.magnitude);
        const abnormal = isAbnormalMag(hypo.magnitude);
        const magSuffix = abnormal ? "（初报推算中）" : "";
        const status =
          yama < 0
            ? "无山梨观测"
            : hit
              ? '<span class="badge badge-hit">达下限</span>'
              : "未达下限";

        return `
          <article class="card ${hit ? "hit quake-hit" : ""}">
            <div class="quake-row">
              <div class="quake-main">
                <div class="quake-name">${escapeHtml(nameText)}</div>
                <div class="quake-sub">
                  ${formatJST(when)} · ${escapeHtml(magText)}${escapeHtml(magSuffix)} · ${escapeHtml(formatDepthDisplay(hypo.depth))}
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
    const res = await fetch(
      cfg.P2P_API || "https://api.p2pquake.net/v2/history?codes=551&codes=556&limit=20"
    );
    if (!res.ok) throw new Error("地震接口请求失败：" + res.status);
    const raw = await res.json();
    const items = (raw || []).filter((x) => x.code === 551 || x.code === 556);
    // 同一事件（±10 分钟）只保留最完整报文
    return mergeQuakes(items, 10);
  }

  /* ---------- 统计（山梨有感，震度≥1） ---------- */
  function last30Keys() {
    const keys = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() + 9 * 3600 * 1000);
      d.setUTCDate(d.getUTCDate() - i);
      keys.push(
        d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate())
      );
    }
    return keys;
  }

  function dayKey(dateLike) {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    const jst = new Date(d.getTime() + 9 * 3600 * 1000);
    return (
      jst.getUTCFullYear() + "-" + pad(jst.getUTCMonth() + 1) + "-" + pad(jst.getUTCDate())
    );
  }

  function renderDailyChart(dayStats, minShindo) {
    const box = $("#daily-chart");
    if (!box) return;
    const keys = last30Keys();
    const vals = keys.map((k) => (dayStats[k] ? dayStats[k].count : 0));
    const max = Math.max(1, ...vals);

    box.innerHTML = keys
      .map((k, i) => {
        const st = dayStats[k] || { count: 0, maxShindo: -1 };
        const v = st.count;
        const h = v ? Math.max(8, Math.round((v / max) * 100)) : 3;
        const hit = st.maxShindo >= minShindo && v > 0;
        const isToday = i === keys.length - 1;
        // 每 5 天标一个；最右端固定「今天」
        let label = "";
        if (isToday) label = "今天";
        else if (i % 5 === 0) label = shortDay(k);

        const tipText = v
          ? `${longDay(k)} · ${v}次 · 最大震度${st.maxRaw > 0 ? scaleText(st.maxRaw) : st.maxShindo < 0 ? "—" : st.maxShindo}`
          : `${longDay(k)} · 无有感地震`;

        return `
          <div class="bar-col" data-tip="${escapeHtml(tipText)}" data-day="${k}">
            <div class="bar-val">${v || ""}</div>
            <div class="bar ${v ? (hit ? "hit" : "") : "zero"}" style="height:${h}px"></div>
            <div class="bar-label ${isToday ? "today" : ""} ${label ? "" : "empty"}">${label}</div>
          </div>
        `;
      })
      .join("");

    bindBarTips(box);
  }

  function shortDay(k) {
    // "2026-10-01" -> "10/1"
    const parts = String(k).split("-");
    if (parts.length < 3) return k;
    return `${Number(parts[1])}/${Number(parts[2])}`;
  }

  function longDay(k) {
    const parts = String(k).split("-");
    if (parts.length < 3) return k;
    return `${Number(parts[1])}月${Number(parts[2])}日`;
  }

  function bindBarTips(box) {
    const old = box.querySelector(".chart-tip");
    if (old) old.remove();

    const showTip = (col) => {
      hideTip();
      const tip = document.createElement("div");
      tip.className = "chart-tip";
      tip.textContent = col.getAttribute("data-tip") || "";
      box.appendChild(tip);
      const colRect = col.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      tip.style.left = colRect.left - boxRect.left + colRect.width / 2 + "px";
      tip.style.top = colRect.top - boxRect.top + "px";
      col.classList.add("active");
      box.__tipCol = col;
    };
    const hideTip = () => {
      const t = box.querySelector(".chart-tip");
      if (t) t.remove();
      if (box.__tipCol) {
        box.__tipCol.classList.remove("active");
        box.__tipCol = null;
      }
    };

    box.querySelectorAll(".bar-col").forEach((col) => {
      col.addEventListener("mouseenter", () => showTip(col));
      col.addEventListener("mouseleave", hideTip);
      col.addEventListener("click", (e) => {
        e.stopPropagation();
        if (box.__tipCol === col) hideTip();
        else showTip(col);
      });
    });
    box.addEventListener("mouseleave", hideTip);
  }

  function renderShindoChart(dist) {
    const box = $("#shindo-chart");
    if (!box) return;
    // dist key = raw scale (10/20/30/40/45/50/55/60/70)
    const rows = [
      { raw: 10, label: "震度1" },
      { raw: 20, label: "震度2" },
      { raw: 30, label: "震度3" },
      { raw: 40, label: "震度4" },
      { raw: 45, label: "震度5弱" },
      { raw: 50, label: "震度5強" },
      { raw: 55, label: "震度6弱" },
      { raw: 60, label: "震度6強" },
      { raw: 70, label: "震度7" },
    ];
    const values = rows.map((r) => dist[r.raw] || 0);
    const max = Math.max(1, ...values);
    box.innerHTML = rows
      .map((r, i) => {
        const v = values[i];
        const pct = Math.round((v / max) * 100);
        const hot = i >= 4 ? "hot" : "";
        return `
          <div class="hbar-row">
            <div class="hbar-label">${r.label}</div>
            <div class="hbar-track"><div class="hbar-fill ${hot}" style="width:${pct}%"></div></div>
            <div class="hbar-num">${v}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderStatsSummary(total, maxShindo, maxRaw, minShindo) {
    const el = $("#stats-summary");
    if (!el) return;
    if (!total) {
      el.innerHTML = "近 30 天山梨有感地震：<strong>0</strong> 次";
      return;
    }
    const maxText = maxRaw > 0 ? scaleText(maxRaw) : maxShindo < 0 ? "—" : String(maxShindo);
    el.innerHTML = `近30天共 <strong>${total}</strong> 次有感 · 最大震度 <strong>${maxText}</strong> · 高亮阈值震度${minShindo}`;
  }

  async function loadStats(minShindo) {
    const threshold = Number(minShindo ?? 2);
    const keys = new Set(last30Keys());
    const dayStats = {};
    const dist = {};
    let total = 0;
    let maxShindo = -1;
    let maxRaw = -1;

    const pageSize = 100;
    let offset = 0;
    let keepGoing = true;

    while (keepGoing && offset < 1000) {
      const url =
        "https://api.p2pquake.net/v2/history?codes=551&limit=" +
        pageSize +
        "&offset=" +
        offset;
      const res = await fetch(url);
      if (!res.ok) throw new Error("统计接口失败");
      const raw = (await res.json()) || [];
      if (!raw.length) break;

      for (const item of raw) {
        const when = item.time || item.earthquake?.time || item.timestamp?.register;
        const k = dayKey(when);
        if (!k) continue;
        if (!keys.has(k)) continue;
        const yama = extractYamanashiScale(item);
        // 口径：山梨県震度 ≥ 1
        if (yama < 1) continue;
        const raw = extractYamanashiRawScale(item);
        if (!dayStats[k]) dayStats[k] = { count: 0, maxShindo: -1, maxRaw: -1 };
        dayStats[k].count += 1;
        if (yama > dayStats[k].maxShindo) dayStats[k].maxShindo = yama;
        if (raw > (dayStats[k].maxRaw ?? -1)) dayStats[k].maxRaw = raw;
        if (yama > maxShindo) maxShindo = yama;
        if (raw > maxRaw) maxRaw = raw;
        dist[raw] = (dist[raw] || 0) + 1;
        total += 1;
      }

      const lastDay = dayKey(raw[raw.length - 1]?.time || raw[raw.length - 1]?.earthquake?.time);
      const oldestKey = [...keys].sort()[0];
      if (lastDay && lastDay < oldestKey) keepGoing = false;
      if (raw.length < pageSize) keepGoing = false;
      offset += pageSize;
    }

    const body = $("#stats-body");
    const empty = $("#stats-empty");
    if (!total) {
      if (body) body.classList.add("hidden");
      if (empty) empty.classList.remove("hidden");
      renderStatsSummary(0, -1, -1, threshold);
      return;
    }
    if (body) body.classList.remove("hidden");
    if (empty) empty.classList.add("hidden");
    renderStatsSummary(total, maxShindo, maxRaw, threshold);
    renderDailyChart(dayStats, threshold);
    renderShindoChart(dist);
  }

  /* ---------- 刷新入口 ---------- */
  async function refreshSettings() {
    try {
      const s = await window.QuakeSettings.loadSettings();
      if (s) {
        window.QuakeSettings.setSlider(Number(s.min_shindo ?? 2));
        window.QuakeSettings.setHibernateButton(Boolean(s.is_hibernating));
        if (s.is_hibernating) setHibernateUI(true);
      }
    } catch (err) {
      toast(err.message || "读取设置失败", "err");
    }
  }

  async function refreshDashboard() {
    const updated = $("#meta-updated");
    if (updated) updated.textContent = formatJSTFull(new Date());

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

    // 冬眠：直接进入极简页
    if (isHibernating) {
      applyStatusFromSettings(true, false);
      return;
    }
    applyStatusFromSettings(false, false);

    try {
      currentAlerts = await loadAlerts(30, 0);
      // 仪表盘只显示 2 条
      renderAlertsInto($("#alerts-list"), currentAlerts.slice(0, 2), "暂无提醒记录");
      const last = currentAlerts[0];
      const lastPush = $("#meta-last-push");
      if (lastPush) lastPush.textContent = last ? formatJST(last.created_at) : "—";

      const recentEew = currentAlerts.find(
        (a) => a.type === "eew" && Date.now() - new Date(a.created_at).getTime() < 2 * 3600 * 1000
      );
      applyStatusFromSettings(false, Boolean(recentEew));
    } catch (err) {
      const box = $("#alerts-list");
      if (box) box.innerHTML = `<div class="empty muted">${escapeHtml(err.message || "加载提醒失败")}</div>`;
    }

    try {
      await loadStats(minShindo);
    } catch (err) {
      const box = $("#daily-chart");
      if (box) box.innerHTML = `<div class="empty muted">${escapeHtml(err.message || "统计失败")}</div>`;
    }
  }

  async function refreshHistory(reset) {
    const box = $("#history-list");
    const moreBtn = $("#load-more-history");
    if (reset) {
      historyOffset = 0;
      if (box) box.innerHTML = '<div class="empty muted">加载中…</div>';
    }
    try {
      const rows = await loadAlerts(PAGE_SIZE, historyOffset);
      if (reset) {
        renderAlertsInto(box, rows, "暂无提醒记录");
      } else if (box && rows.length) {
        const frag = sortAlerts(rows).map(alertCardHtml).join("");
        box.insertAdjacentHTML("beforeend", frag);
      }
      historyOffset += rows.length;
      if (moreBtn) {
        moreBtn.disabled = rows.length < PAGE_SIZE;
        moreBtn.textContent = rows.length < PAGE_SIZE ? "没有更多了" : "加载更多";
      }
    } catch (err) {
      if (reset && box) {
        box.innerHTML = `<div class="empty muted">${escapeHtml(err.message || "加载失败")}</div>`;
      }
    }
  }

  async function refreshQuakesPage() {
    let minShindo = 2;
    try {
      const s = await window.QuakeSettings.loadSettings();
      if (s) minShindo = Number(s.min_shindo ?? 2);
    } catch (_) {
      /* ignore */
    }
    try {
      const quakes = await loadQuakes();
      renderQuakes(quakes, minShindo);
    } catch (err) {
      const box = $("#quakes-list");
      if (box) box.innerHTML = `<div class="empty muted">${escapeHtml(err.message || "加载地震失败")}</div>`;
    }
  }

  /* ---------- 演示模式 ---------- */
  function loadDemo() {
    const q = new URLSearchParams(location.search);
    const hib = q.get("hib") === "1";
    const page = q.get("page") || "dashboard";
    showPage(page);
    if (hib) {
      applyStatusFromSettings(true, false);
      return;
    }
    applyStatusFromSettings(false, true);
    const ms = $("#meta-min-shindo");
    if (ms) ms.textContent = "2";
    const lp = $("#meta-last-push");
    if (lp) lp.textContent = "2026-10-11 21:40";
    const up = $("#meta-updated");
    if (up) up.textContent = formatJSTFull(new Date());

    currentAlerts = [
      {
        type: "eew",
        title: "地震预警 · 緊急地震速報",
        content:
          "<div><b>地震预警 2026-10-11 21:40:00</b></div><div>震源地：山梨県東部</div><div>发震时刻：2026/10/11 21:38:12</div><div>震级：M5.2</div><div>山梨県震度：3</div><div>深度：10 km</div><div>强烈摇晃即将到达，立即躲避到桌下</div>",
        created_at: new Date().toISOString(),
      },
      {
        type: "quake",
        title: "地震预警 · 山梨震度3地震",
        content:
          "<div>地震预警 2026-10-10 08:12:00</div><div>震源地：山梨県中・西部</div><div>震级：M4.1</div><div>山梨県震度：3</div><div>深度：15 km</div>",
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        type: "nightly",
        title: "地震预警 · 今夜平安",
        content: "<div>地震预警 夜间汇总 2026-10-10 00:00:00</div><div>监测地点：山梨県 甲府市善光寺3-1-5</div><div>今夜平安，未监测到山梨県相关緊急地震速報或有感地震。</div>",
        created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ];
    renderAlertsInto($("#alerts-list"), currentAlerts.slice(0, 2), "暂无提醒记录");
    renderAlertsInto($("#history-list"), currentAlerts, "暂无提醒记录");
    // showPage 会再调 refresh，demo 下直接填好静态数据即可
    if (page !== "dashboard") {
      // already rendered
    }

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
      ],
      2
    );

    const dayStats = {};
    const dist = { 10: 2, 20: 4, 30: 3, 45: 1, 50: 1 };
    last30Keys().forEach((k, i) => {
      const c = i % 8 === 0 ? 3 : i % 3 === 0 ? 1 : 0;
      if (c) dayStats[k] = {
        count: c,
        maxShindo: i % 8 === 0 ? 3 : 2,
        maxRaw: i % 8 === 0 ? 30 : 20,
      };
    });
    const total = Object.values(dayStats).reduce((s, x) => s + x.count, 0);
    renderStatsSummary(total, 3, 30, 2);
    renderDailyChart(dayStats, 2);
    renderShindoChart(dist);
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    window.QuakeAuth.bind();
    window.QuakeSettings.bind();

    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => showPage(btn.dataset.page));
    });

    $("#goto-history")?.addEventListener("click", () => showPage("history"));
    $("#goto-quakes")?.addEventListener("click", () => showPage("quakes"));
    $("#refresh-all")?.addEventListener("click", () => {
      showPage(document.querySelector(".page.active")?.id.replace("page-", "") || "dashboard");
      toast("已刷新", "ok");
    });
    $("#refresh-history")?.addEventListener("click", () => refreshHistory(true));
    $("#refresh-quakes")?.addEventListener("click", () => refreshQuakesPage());
    $("#load-more-history")?.addEventListener("click", () => refreshHistory(false));

    $("#wake-btn")?.addEventListener("click", async () => {
      const ok = await window.QuakeSettings.confirmDialog(
        "结束冬眠",
        "结束后将恢复地震监控与推送。确定结束冬眠？"
      );
      if (!ok) return;
      try {
        await window.QuakeSettings.saveHibernation(false);
        setHibernateUI(false);
        applyStatusFromSettings(false, false);
        toast("已恢复工作中", "ok");
        showPage("dashboard");
        refreshSettings();
      } catch (err) {
        toast(err.message || "操作失败", "err");
      }
    });

    // PWA
    if ("serviceWorker" in navigator && !isDemo()) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    if (isDemo()) {
      loadDemo();
      return;
    }

    await refreshSettings();
    const page = new URLSearchParams(location.search).get("page");
    showPage(page || "dashboard");
  }

  window.AppUI = {
    toast,
    refreshDashboard,
    applyStatusFromSettings,
    showPage,
    setHibernateUI,
    stripHtml,
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
