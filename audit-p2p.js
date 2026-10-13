const https = require("https");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data || "[]"));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function dayKey(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function yamaScale(item) {
  const pts = item.points || item.areas || [];
  let mx = -1;
  for (const p of pts) {
    if (String(p.pref || "").includes("山梨")) {
      const sc = p.scale ?? p.scaleFrom;
      if (sc == null) continue;
      const n = Number(sc);
      let lv = 0;
      if (n >= 70) lv = 7;
      else if (n >= 60) lv = 6;
      else if (n >= 55) lv = 6;
      else if (n >= 50) lv = 5;
      else if (n >= 45) lv = 5;
      else if (n >= 40) lv = 4;
      else if (n >= 30) lv = 3;
      else if (n >= 20) lv = 2;
      else if (n >= 10) lv = 1;
      if (lv > mx) mx = lv;
    }
  }
  return mx;
}

(async () => {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const keys = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    keys.push(
      d.getUTCFullYear() +
        "-" +
        String(d.getUTCMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getUTCDate()).padStart(2, "0")
    );
  }
  const keyset = new Set(keys);
  let total = 0;
  let maxs = -1;
  const byDay = {};

  for (let off = 0; off < 500; off += 100) {
    const raw = await fetchJson(
      `https://api.p2pquake.net/v2/history?codes=551&limit=100&offset=${off}`
    );
    if (!Array.isArray(raw) || !raw.length) break;
    for (const item of raw) {
      const when = item.time || (item.earthquake || {}).time;
      const k = dayKey(when);
      if (!k || !keyset.has(k)) continue;
      const y = yamaScale(item);
      if (y < 1) continue;
      total++;
      if (y > maxs) maxs = y;
      byDay[k] = (byDay[k] || 0) + 1;
    }
    if (raw.length < 100) break;
  }

  console.log("window", keys[0], "~", keys[keys.length - 1]);
  console.log("yamanashi_felt_total", total, "max_shindo", maxs);
  console.log("days_with_felt", Object.keys(byDay).length);
  console.log("byDay", JSON.stringify(byDay));
})();
