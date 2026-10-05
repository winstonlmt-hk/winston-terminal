// app.js – Winston Terminal v4: state, storage, routing, rendering, events. No maths here (see calc.js).
// v2: pages registered in window.WT_MODULES (e.g. vc-app.js, methodology.js) are routed, rendered and reset from here.
// v3 (polish foundation): panel source/as-of chips, header data-quality chips, count-up + change flash, focused-panel brackets, watermark, version.
// v4 (Phase 2): window.WT_APP – a small navigation/display API for cmd.js (command line, palette, tour). Coming-soon pages show plan-v3 modules.

(function () {
  "use strict";

  /* ===== SECTION: STATE ===== */
  const state = {
    mode: "demo", settings: null, demoPrices: {}, my: { holdings: [], transactions: [] },
    pf: null, model: null, page: "dashboard", sort: { key: "valueHKD", dir: -1 }, filter: "ALL",
    txFilter: "", notices: [], charts: {}, imp: null, today: hktTodayISO(),
    flashPrev: {}, counted: false, focusKey: null, chart: "loading"
  };
  const APP_VERSION = "v4.0", APP_BUILD = "2026-10-05";
  const $ = function (id) { return document.getElementById(id); };

  /* ===== SECTION: STORAGE (localStorage, keys "winstonTerminal.v1.*") ===== */
  function load(key, fallback, label) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      state.notices.push("Saved " + label + " couldn't be read, so defaults are shown.");
      return fallback;
    }
  }
  function save(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { toast("Couldn't save in this browser (storage blocked or full).", true); }
  }
  function cleanSettings(s) {
    const out = Object.assign({}, DEFAULT_SETTINGS, { rate_as_of: state.today });
    if (s && typeof s === "object") {
      ["usd_hkd_rate", "max_weight_pct", "max_drawdown_pct", "watch_weight_pct", "watch_drawdown_pct"].forEach(function (k) {
        const v = Calc.num(s[k]); if (isFinite(v) && v >= 0) out[k] = v;
      });
      if (typeof s.rate_as_of === "string" && Calc.parseDate(s.rate_as_of)) out.rate_as_of = s.rate_as_of;
    }
    return out;
  }
  function cleanPortfolio(p) {
    if (!p || !Array.isArray(p.holdings) || !Array.isArray(p.transactions)) return null;
    return {
      holdings: p.holdings.filter(function (h) { return h && typeof h.symbol === "string"; }),
      transactions: p.transactions.filter(function (t) { return t && typeof t.symbol === "string" && typeof t.trade_date === "string" && TX_TYPES.indexOf(t.type) >= 0; })
    };
  }
  function loadAll() {
    const mode = load(STORAGE_KEYS.mode, "demo", "mode");
    state.mode = mode === "my" ? "my" : "demo";
    const s = load(STORAGE_KEYS.settings, null, "settings");
    state.settings = s ? cleanSettings(s) : cleanSettings(buildDemoPortfolio(state.today).settings);
    const dp = load(STORAGE_KEYS.demoPrices, {}, "demo prices");
    state.demoPrices = dp && typeof dp === "object" && !Array.isArray(dp) ? dp : {};
    const my = load(STORAGE_KEYS.myPortfolio, null, "My Portfolio");
    const clean = my === null ? null : cleanPortfolio(my);
    if (my !== null && !clean) state.notices.push("Saved My Portfolio was damaged, so it starts empty. Restore a JSON backup if you have one.");
    state.my = clean || { holdings: [], transactions: [] };
  }
  function saveMy() { save(STORAGE_KEYS.myPortfolio, state.my); }

  /* ===== SECTION: ACTIVE PORTFOLIO + RECALC ===== */
  function demoPortfolio() {
    const d = buildDemoPortfolio(state.today);
    d.holdings.forEach(function (h) {
      const o = state.demoPrices[h.symbol];
      if (o && Calc.num(o.last_price) > 0) { h.last_price = Calc.num(o.last_price); h.last_price_date = o.last_price_date || state.today; h.price_note = "Edited in this browser (demo)"; }
    });
    return d;
  }
  function recalc() {
    state.pf = state.mode === "demo" ? demoPortfolio() : state.my;
    state.model = Calc.computePortfolio(state.pf.holdings, state.pf.transactions, state.settings);
    renderAll();
  }

  /* ===== SECTION: FORMATTING (display only) ===== */
  const MINUS = "\u2212";
  function fmt(x, dp) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return (x < 0 && /[1-9]/.test(s) ? MINUS : "") + s;
  }
  function fmtS(x, dp) { const s = fmt(x, dp); return x > 0 && /[1-9]/.test(s) ? "+" + s : s; }
  function pct(x) { return x === null || !isFinite(x) ? "—" : fmtS(x, 1) + "%"; }
  function wpct(x) { return fmt(x, 1) + "%"; }
  function tone(x, dp) { if (x === null || !isFinite(x)) return "zero"; const r = Number(x.toFixed(dp === undefined ? 2 : dp)); return r > 0 ? "pos" : r < 0 ? "neg" : "zero"; }
  function sym(s) { return String(s).replace(/\.US$/, ""); }
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fdate(iso) { if (!iso) return "—"; const p = String(iso).split("-"); return p.length === 3 ? p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0] : esc(iso); }
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function badge(status) { const c = { FLAG: "b-flag", WATCH: "b-watch", OK: "b-ok", PASS: "b-pass", FAIL: "b-fail", DUPLICATE: "b-dup", ERROR: "b-fail" }[status] || "b-ok"; return '<span class="badge ' + c + '">' + status + "</span>"; }
  function reasonText(r, row) {
    const word = r.level === "FLAG" ? "limit" : "watch";
    if (r.kind === "weight") return "is " + wpct(r.value) + " of portfolio (" + word + " " + r.limit + "%)";
    return "is down " + fmt(r.value, 1) + "% from avg cost " + fmt(r.avg, 2) + " " + row.currency + " (" + word + " " + r.limit + "%)";
  }
  function asOf() {
    const dates = state.pf.holdings.map(function (h) { return h.last_price_date; }).filter(Boolean).sort();
    return "As of " + (dates.length ? fdate(dates[dates.length - 1]) : "—") + (state.mode === "demo" ? " · illustrative prices" : "");
  }

  /* ===== SECTION: HEADER, CLOCK, BANNER, FOOTER ===== */
  const clockFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  function tick() { $("clock").textContent = clockFmt.format(new Date()) + " HKT"; }
  function renderHeader() {
    $("mode-badge").innerHTML = state.mode === "demo" ? '<span class="badge demo-badge">DEMO PORTFOLIO</span>'
      : '<span class="badge my-badge">MY PORTFOLIO · saved in this browser only</span>';
    $("fx-chip").textContent = "USD/HKD " + fmt(state.settings.usd_hkd_rate, 4) + " · " + fdate(state.settings.rate_as_of).replace(/<[^>]+>/g, "");
    const m = state.model, ok = m.checksPassed === 7, chip = $("checks-chip");
    chip.textContent = "Checks " + m.checksPassed + "/7 " + (ok ? "✓" : "✗");
    chip.className = "checks-chip mono " + (ok ? "ok" : "bad");
    const vc = modules().filter(function (x) { return x.status; }).map(function (x) { return x.status(moduleCtx(x.id)); })[0], vchip = $("vc-chip");
    state.vcStatus = vc || null;
    if (vchip) { vchip.hidden = !vc; if (vc) { vchip.textContent = vc.label; vchip.className = "dq-chip mono " + (vc.ok ? "ok" : "bad"); } }
    const f = freshness(), fchip = $("fresh-chip");
    if (fchip) { fchip.textContent = f.label; fchip.className = "dq-chip mono " + f.cls; fchip.title = f.title; }
  }
  function renderBanner() {
    const m = state.model, lines = [];
    state.notices.forEach(function (n, i) { lines.push({ cls: "info", html: '<span class="badge b-dup">INFO</span><span>' + esc(n) + '</span> <a href="#" data-action="dismiss-notice" data-i="' + i + '">Dismiss</a>' }); });
    let html = "";
    if (lines.length) html += '<div class="banner info">' + lines.map(function (l) { return '<div class="banner-line">' + l.html + "</div>"; }).join("") + "</div>";
    const items = [];
    m.flags.concat(m.watch).forEach(function (r) {
      r.reasons.forEach(function (x) { items.push({ level: x.level, html: badge(x.level) + "<b>" + esc(sym(r.symbol)) + "</b><span>" + esc(reasonText(x, r)) + "</span>" }); });
    });
    items.sort(function (a, b) { return a.level === b.level ? 0 : a.level === "FLAG" ? -1 : 1; });
    if (m.rows.length === 0) html += '<div class="banner info"><div class="banner-line">No positions yet. Add a transaction or import a CSV' + (state.mode === "my" ? "" : " (or reset demo data)") + ".</div></div>";
    else if (items.length) html += '<div class="banner ' + (m.flags.length ? "flag" : "watch") + '">' + items.map(function (i) { return '<div class="banner-line">' + i.html + "</div>"; }).join("") + "</div>";
    else html += '<div class="banner clear">All clear – no flags or watch items</div>';
    $("banner").innerHTML = html;
  }
  function renderFooter() {
    $("footer").innerHTML = "Personal research tool. Not investment advice." + (state.mode === "demo" ? " Demo data – illustrative prices, not real holdings." : " My Portfolio is stored only in this browser.") +
      ' <span class="foot-meta"><a href="#methodology">Methodology</a> · <span class="mono">Winston Terminal ' + APP_VERSION + " · build " + fdate(APP_BUILD) + "</span></span>";
  }
  function renderWatermark() {
    const w = $("watermark"), vc = state.page === "valuechain"; if (!w) return;
    w.textContent = vc ? "ILLUSTRATIVE DATA · NOT A FORECAST" : "DEMO PORTFOLIO · ILLUSTRATIVE PRICES";
    w.hidden = !(vc || state.mode === "demo");
  }

  /* ===== SECTION: POLISH HELPERS (panel chips, freshness, count-up, change flash, focused panel) ===== */
  // Display only: no portfolio maths here. Freshness compares price dates with today's HKT date.
  function phead(title, src, asof, actions) {
    return '<div class="panel-head"><span class="panel-title">' + title + "</span>" + (src ? '<span class="src-chip" title="Source">' + src + "</span>" : "") +
      (asof ? '<span class="asof">' + asof + "</span>" : "") + (actions ? '<span class="panel-actions">' + actions + "</span>" : "") + "</div>";
  }
  function srcPf() { return state.mode === "demo" ? "Demo seed" : "My Portfolio · this browser"; }
  function priceAsOf() {
    const dates = state.pf.holdings.map(function (h) { return h.last_price_date; }).filter(Boolean).sort();
    return "as of " + (dates.length ? fdate(dates[dates.length - 1]) : "—");
  }
  function recalcAsOf() { return "recalc " + clockFmt.format(new Date()).slice(0, 5) + " HKT"; }
  function freshness() {
    if (state.mode === "demo") return { label: "Demo data", cls: "demo", title: "Illustrative demo prices, not market data" };
    const hs = state.pf.holdings.filter(function (h) { return state.model.rows.some(function (r) { return r.symbol === h.symbol; }); });
    if (!hs.length) return { label: "No data", cls: "warn", title: "No open positions in My Portfolio" };
    const missing = hs.filter(function (h) { return !(Calc.num(h.last_price) > 0) || !h.last_price_date; }).length;
    if (missing) return { label: missing + " unpriced", cls: "warn", title: "Positions without a last price or price date" };
    const oldest = hs.map(function (h) { return h.last_price_date; }).sort()[0];
    return oldest >= state.today ? { label: "Fresh", cls: "ok", title: "Every price is dated today (HKT)" }
      : { label: "Stale · " + fdate(oldest).slice(0, 6), cls: "warn", title: "Oldest price date " + fdate(oldest) + ". Edit Last to update." };
  }
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function countUp(root) { // first dashboard render only, <=400 ms, always ends on the exact formatted text
    if (state.counted) return; state.counted = true;
    if (reducedMotion() || !window.requestAnimationFrame) return;
    root.querySelectorAll("[data-cu]").forEach(function (el) {
      const end = Number(el.getAttribute("data-cu")), f = el.hasAttribute("data-cs") ? fmtS : fmt, final = el.textContent, t0 = performance.now();
      if (!isFinite(end) || end === 0) return;
      const step = function (t) {
        const k = Math.min(Math.max((t - t0) / 400, 0), 1);
        el.textContent = k < 1 ? f(end * (1 - Math.pow(1 - k, 3)), 0) : final;
        if (k < 1) requestAnimationFrame(step);
      };
      el.textContent = f(0, 0); requestAnimationFrame(step);
    });
  }
  function flash(root, ns) { // 600 ms green/red flash when a [data-fk] value differs from the last render
    if (!root) return;
    root.querySelectorAll("[data-fk]").forEach(function (el) {
      const k = (ns || state.mode) + ":" + el.getAttribute("data-fk"), v = Number(el.getAttribute("data-fv")), prev = state.flashPrev[k];
      if (prev !== undefined && isFinite(v) && isFinite(prev) && Math.abs(v - prev) > 1e-9 && !reducedMotion()) {
        el.classList.remove("flash-up", "flash-down"); void el.offsetWidth; el.classList.add(v > prev ? "flash-up" : "flash-down");
      }
      if (isFinite(v)) state.flashPrev[k] = v;
    });
  }
  function fk(key, v) { return isFinite(v) ? ' data-fk="' + esc(key) + '" data-fv="' + v + '"' : ""; }
  function panelKey(p) { const t = p.querySelector(".panel-title, .label, .vc-title"); return t ? t.textContent : null; }
  function focusPanel(p) {
    document.querySelectorAll(".panel.is-focused").forEach(function (x) { x.classList.remove("is-focused"); });
    if (p) { p.classList.add("is-focused"); state.focusKey = panelKey(p); }
  }
  function restoreFocus() {
    if (!state.focusKey) return;
    const p = Array.prototype.find.call(document.querySelectorAll(".page.active .panel"), function (x) { return panelKey(x) === state.focusKey; });
    if (p && !p.classList.contains("is-focused")) focusPanel(p);
  }
  function afterRender(root, ns) { flash(root, ns); restoreFocus(); }

  /* ===== SECTION: MODULES (extra pages such as the Value Chain Explorer, loaded before app.js) ===== */
  function modules() { return window.WT_MODULES || []; }
  function moduleFor(id) { return modules().find(function (m) { return m.id === id; }) || null; }
  function moduleCtx(id) {
    return { mode: state.mode, settings: state.settings, model: state.model, pf: state.pf, today: state.today, el: $("page-" + id),
      h: { fmt: fmt, fmtS: fmtS, pct: pct, wpct: wpct, tone: tone, sym: sym, esc: esc, badge: badge, fdate: fdate, toast: toast,
        phead: phead, flash: flash, after: function (root, ns) { afterRender(root, ns); renderHeader(); } }, version: APP_VERSION, build: APP_BUILD, chartState: state.chart,
      dq: { checks: state.model.checksPassed, vc: state.vcStatus || null, fresh: freshness() } };
  }

  /* ===== SECTION: ROUTING ===== */
  const PAGES = ["dashboard", "holdings", "transactions", "import", "settings"];
  function route() {
    const h = (location.hash || "#dashboard").slice(1);
    state.page = PAGES.indexOf(h) >= 0 || /^soon-/.test(h) || moduleFor(h) ? h : "dashboard";
    document.querySelectorAll(".nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-page") === state.page); });
    document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("active"); });
    $(/^soon-/.test(state.page) ? "page-soon" : "page-" + state.page).classList.add("active");
    $("sidebar").classList.remove("open");
    renderWatermark(); renderPage();
  }
  function renderAll() { renderHeader(); renderBanner(); renderFooter(); renderWatermark(); renderPage(); }
  function renderPage() {
    const p = state.page;
    if (p === "dashboard") renderDashboard();
    else if (p === "holdings") renderHoldingsPage();
    else if (p === "transactions") renderTransactions();
    else if (p === "import") renderImport();
    else if (p === "settings") renderSettings();
    else if (moduleFor(p)) moduleFor(p).render(moduleCtx(p));
    else renderSoon(p.replace("soon-", ""));
    if (!moduleFor(p)) afterRender($(/^soon-/.test(p) ? "page-soon" : "page-" + p));
  }

  /* ===== SECTION: DASHBOARD ===== */
  function renderDashboard() {
    const m = state.model, t = m.totals, L = m.largest, s = state.settings;
    const mk = {}; m.splits.market.forEach(function (x) { mk[x.key] = x.pct; });
    const empty = m.rows.length === 0;
    const kpi = function (label, big, sub, drill, cls, attrs) {
      return '<div class="panel kpi s3" data-action="drill" data-drill="' + drill + '"><div class="label">' + label + '</div><div class="big ' + (cls || "") + '"' + (attrs || "") + ">" + big + '</div><div class="sub">' + sub + "</div></div>";
    };
    let html = '<div class="grid">' +
      kpi("Total Value HKD", empty ? "—" : fmt(t.valueHKD, 0), empty ? "No positions yet" : "Cost HKD " + fmt(t.costHKD, 0) + (t.unpriced ? " · " + t.unpriced + " unpriced" : ""), "value", "", empty ? "" : fk("kpi:value", t.valueHKD) + ' data-cu="' + t.valueHKD + '"') +
      kpi("Unrealised P&amp;L HKD", empty ? "—" : fmtS(t.unrealHKD, 0), empty ? "—" : '<span class="' + tone(t.unrealPct, 1) + '">' + pct(t.unrealPct) + "</span> vs cost · Realised " + fmtS(t.realisedHKD, 0), "pnl", tone(t.unrealHKD, 0), empty ? "" : fk("kpi:pnl", t.unrealHKD) + ' data-cu="' + t.unrealHKD + '" data-cs') +
      kpi("HK / US split", empty ? "—" : fmt(mk.HK || 0, 1) + " / " + fmt(mk.US || 0, 1), "% of value · HK / US", "split") +
      kpi("Largest position", L ? esc(sym(L.symbol)) + " " + wpct(L.weightPct) : "—", L ? esc(L.name) + " · limit " + s.max_weight_pct + "%" : "—", L ? "row:" + esc(L.symbol) : "value", L && L.weightPct > s.max_weight_pct ? "amber" : "") +
      "</div>";
    html += '<div class="chips">' +
      ["ALL", "FLAG", "WATCH"].map(function (f) {
        const n = f === "ALL" ? m.rows.length : f === "FLAG" ? m.flags.length : m.watch.length;
        return '<button class="chip' + (state.filter === f ? " active" : "") + '" data-action="filter" data-f="' + f + '">' + (f === "ALL" ? "Positions" : f === "FLAG" ? "Flags" : "Watch") + "<b>" + n + "</b></button>";
      }).join("") + '<span class="note">' + asOf() + "</span></div>";
    html += '<div class="grid"><div class="panel s9 dash-main">' + phead("Holdings", srcPf(), priceAsOf(), '<span class="note">Click a row for the maths · edit Last to recalculate</span>') +
      holdingsTable(false) + '</div><div class="s3 stack dash-side">' +
      '<div class="panel">' + phead("By sector", "calc.js", priceAsOf()) + donutBox("sector") + "</div>" +
      '<div class="panel">' + phead("Market · currency", "calc.js", priceAsOf()) + '<div class="donuts"><div><div class="label">By market</div>' + donutBox("market", true) + '</div><div><div class="label">By currency</div>' + donutBox("currency", true) + "</div></div></div>" +
      '<div class="panel">' + phead("Market health", "no feed yet", null, '<span class="badge soon-badge">Live data later</span>') +
      ["HSI", "S&amp;P 500", "USD/HKD"].map(function (n) { return '<div class="kv"><span>' + n + '</span><span class="muted mono">— · not connected</span></div>'; }).join("") + "</div>" +
      checksPanel() + "</div></div>";
    html += '<div class="grid">' + COMING_SOON.map(function (c) { return soonCard(c, " s6"); }).join("") + "</div>";
    const pg = $("page-dashboard"); pg.innerHTML = html;
    drawCharts(); countUp(pg);
  }
  function checksPanel() {
    return '<div class="panel" id="checks-panel">' + phead("Data checks", "calc.js", recalcAsOf(), '<span class="mono">' + state.model.checksPassed + "/7</span>") +
      state.model.checks.map(function (c) { return '<div class="check">' + badge(c.pass ? "PASS" : "FAIL") + "<span>" + c.id + ". " + esc(c.label) + '</span><span class="d">' + esc(c.detail) + "</span></div>"; }).join("") + "</div>";
  }

  /* ===== SECTION: HOLDINGS TABLE (sortable, inline price edit) ===== */
  const COLS = [
    { k: "symbol", t: "Ticker", l: 1 }, { k: "name", t: "Name", l: 1 }, { k: "qty", t: "Qty" }, { k: "avgCost", t: "Avg cost" },
    { k: "last_price", t: "Last" }, { k: "valueLocal", t: "Value local" }, { k: "valueHKD", t: "Value HKD" },
    { k: "unrealHKD", t: "Unreal. P&amp;L HKD" }, { k: "unrealPct", t: "P&amp;L %" }, { k: "weightPct", t: "Weight" }, { k: "status", t: "Tag", l: 1 }
  ];
  const STATUS_RANK = { FLAG: 2, WATCH: 1, OK: 0 };
  function sortedRows(rows) {
    const k = state.sort.key, d = state.sort.dir;
    return rows.slice().sort(function (a, b) {
      let x = k === "status" ? STATUS_RANK[a.status] : a[k], y = k === "status" ? STATUS_RANK[b.status] : b[k];
      if (x === null || x === undefined) x = -Infinity; if (y === null || y === undefined) y = -Infinity;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * d;
    });
  }
  function priceInput(r) {
    return '<input class="num price" type="number" step="any" min="0" data-action="price" data-sym="' + esc(r.symbol) + '" value="' + (r.last_price === null ? "" : r.last_price) + '" placeholder="price" title="' + esc(r.price_note || "") + (r.last_price_date ? " · " + esc(r.last_price_date) : "") + '">';
  }
  function holdingsTable() {
    const m = state.model;
    let rows = m.rows;
    if (state.filter !== "ALL") rows = rows.filter(function (r) { return r.status === state.filter; });
    rows = sortedRows(rows);
    const head = "<tr>" + COLS.map(function (c) {
      const on = state.sort.key === c.k;
      return '<th data-sort="' + c.k + '" class="' + (c.l ? "l " : "") + (on ? "sorted" : "") + '">' + c.t + (on ? (state.sort.dir > 0 ? " ▲" : " ▼") : "") + "</th>";
    }).join("") + "</tr>";
    if (!m.rows.length) return '<div class="table-wrap"><table><thead>' + head + '</thead></table><div class="empty">No positions yet. Add transactions or import a CSV on Import / Export.</div></div>';
    const body = rows.map(function (r) {
      return '<tr class="click" data-action="drill" data-drill="row:' + esc(r.symbol) + '"><td class="tk">' + esc(sym(r.symbol)) + '</td><td class="l name" title="' + esc(r.name) + '">' + esc(r.name) +
        "</td><td>" + fmt(r.qty, 0) + "</td><td>" + fmt(r.avgCost, 2) + "</td><td>" + priceInput(r) + "</td><td>" + (r.hasPrice ? fmt(r.valueLocal, 2) + ' <span class="muted">' + r.currency + "</span>" : '<span class="muted">no price</span>') +
        "</td><td" + fk("v:" + r.symbol, r.valueHKD) + ">" + fmt(r.valueHKD, 2) + '</td><td class="' + tone(r.unrealHKD) + '"' + fk("u:" + r.symbol, r.unrealHKD) + ">" + fmtS(r.unrealHKD, 2) + '</td><td class="' + tone(r.unrealPct, 1) + '">' + pct(r.unrealPct) +
        "</td><td" + fk("w:" + r.symbol, r.weightPct) + ">" + wpct(r.weightPct) + '</td><td class="l">' + badge(r.status) + "</td></tr>";
    }).join("") || '<tr><td colspan="11" class="empty">No rows match this filter.</td></tr>';
    const t = m.totals;
    const foot = '<tr class="total"><td class="tk">TOTAL</td><td class="l">' + m.rows.length + ' positions</td><td></td><td></td><td></td><td></td><td>' + fmt(t.valueHKD, 2) +
      '</td><td class="' + tone(t.unrealHKD) + '">' + fmtS(t.unrealHKD, 2) + '</td><td class="' + tone(t.unrealPct, 1) + '">' + pct(t.unrealPct) + "</td><td>" +
      wpct(m.rows.reduce(function (a, r) { return a + r.weightPct; }, 0)) + "</td><td></td></tr>";
    return '<div class="table-wrap"><table><thead>' + head + "</thead><tbody>" + body + "</tbody><tfoot>" + foot + "</tfoot></table></div>";
  }

  /* ===== SECTION: CHARTS (Chart.js donuts with % labels and centre total) ===== */
  function donutBox(key, small) {
    return '<div class="chart-box' + (small ? " small" : "") + '"><canvas id="chart-' + key + '"></canvas></div><ul class="legend">' +
      state.model.splits[key].map(function (x, i) {
        return '<li><span class="sw" style="background:' + CHART_COLORS[i % CHART_COLORS.length] + '"></span>' + esc(x.key) + '<span class="v">' + wpct(x.pct) + "</span></li>";
      }).join("") + "</ul>";
  }
  const donutPlugin = {
    id: "wtDonut",
    afterDatasetsDraw: function (chart) {
      const ctx = chart.ctx, meta = chart.getDatasetMeta(0), data = chart.data.datasets[0].data;
      const total = data.reduce(function (a, b) { return a + b; }, 0);
      if (!meta.data.length || total <= 0) return;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      meta.data.forEach(function (arc, i) {
        const p = data[i] / total * 100; if (p < 6 || arc.outerRadius - arc.innerRadius < 30) return; // too thin: legend shows %
        const pos = arc.tooltipPosition();
        ctx.fillStyle = "#0A0D10"; ctx.font = "600 10px 'JetBrains Mono', monospace"; ctx.fillText(p.toFixed(1) + "%", pos.x, pos.y);
      });
      const c = meta.data[0];
      ctx.fillStyle = "#E6E6E6"; ctx.font = "500 11px 'JetBrains Mono', monospace"; ctx.fillText(fmt(total, 0), c.x, c.y - 6);
      ctx.fillStyle = "#8A94A6"; ctx.font = "10px Inter, sans-serif"; ctx.fillText("HKD", c.x, c.y + 8);
      ctx.restore();
    }
  };
  function drawCharts() {
    Object.keys(state.charts).forEach(function (k) { state.charts[k].destroy(); }); state.charts = {};
    ["sector", "market", "currency"].forEach(function (key) {
      const canvas = $("chart-" + key); if (!canvas) return;
      const split = state.model.splits[key];
      if (typeof Chart === "undefined" && state.chart === "loading") { canvas.parentNode.innerHTML = '<div class="skel chart-skel" title="Loading chart"></div>'; return; }
      if (typeof Chart === "undefined") { canvas.parentNode.innerHTML = '<div class="chart-fallback state error">Chart unavailable – Chart.js didn\'t load (offline?). Figures below are still exact.</div>'; return; }
      if (!split.length || state.model.totals.valueHKD <= 0) { canvas.parentNode.innerHTML = '<div class="chart-fallback state">No priced positions to chart.</div>'; return; }
      state.charts[key] = new Chart(canvas, {
        type: "doughnut", plugins: [donutPlugin],
        data: { labels: split.map(function (x) { return x.key; }), datasets: [{ data: split.map(function (x) { return x.valueHKD; }), backgroundColor: split.map(function (x, i) { return CHART_COLORS[i % CHART_COLORS.length]; }), borderColor: "#11161C", borderWidth: 2 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "58%", animation: false,
          plugins: { legend: { display: false }, title: { display: false },
            tooltip: { callbacks: { label: function (c) { return " " + c.label + ": HKD " + fmt(c.raw, 2) + " (" + wpct(split[c.dataIndex].pct) + ")"; } },
              bodyFont: { family: "JetBrains Mono" }, backgroundColor: "#0A0D10", borderColor: "#1F2630", borderWidth: 1 } }
        }
      });
    });
  }

  /* ===== SECTION: DRILL-DOWN MODAL ===== */
  function openModal(title, html) {
    $("modal-title").innerHTML = title; $("modal-body").innerHTML = html; $("modal").hidden = false;
    const src = $("modal-src"); if (src) src.innerHTML = '<span class="src-chip" title="Source">' + srcPf() + " · calc.js</span>" + '<span class="asof">' + priceAsOf() + "</span>";
  }
  function closeModal() { $("modal").hidden = true; }
  function simpleTable(head, rows, foot) {
    return '<div class="table-wrap"><table><thead><tr>' + head.map(function (h, i) { return '<th class="' + (i === 0 ? "l" : "") + '">' + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return '<td class="' + (i === 0 ? "tk" : "") + '">' + c + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody>" + (foot ? '<tfoot><tr class="total">' + foot.map(function (c, i) { return '<td class="' + (i === 0 ? "tk" : "") + '">' + c + "</td>"; }).join("") + "</tr></tfoot>" : "") + "</table></div>";
  }
  function drill(what) {
    const m = state.model, t = m.totals;
    if (what.indexOf("row:") === 0) return drillRow(what.slice(4));
    if (what === "value") {
      openModal("Total value HKD – breakdown", simpleTable(["Ticker", "Qty", "Last", "FX", "Value HKD", "Weight"],
        m.rows.map(function (r) { return [esc(sym(r.symbol)), fmt(r.qty, 0), fmt(r.last_price, 2) + " " + r.currency, fmt(r.fx, 4), fmt(r.valueHKD, 2), wpct(r.weightPct)]; }),
        ["TOTAL", "", "", "", fmt(t.valueHKD, 2), "100.0%"]) + '<p class="note">Value HKD = qty × last price × FX (USD/HKD ' + state.settings.usd_hkd_rate + ", HKD = 1). Cost HKD " + fmt(t.costHKD, 2) + ".</p>");
    } else if (what === "pnl") {
      openModal("P&amp;L HKD – by position", simpleTable(["Ticker", "Cost HKD", "Value HKD", "Unrealised HKD", "%", "Realised HKD"],
        m.allRows.map(function (r) { return [esc(sym(r.symbol)), fmt(r.costHKD, 2), fmt(r.valueHKD, 2), '<span class="' + tone(r.unrealHKD) + '">' + fmtS(r.unrealHKD, 2) + "</span>", pct(r.unrealPct), '<span class="' + tone(r.realisedHKD) + '">' + fmtS(r.realisedHKD, 2) + "</span>"]; }),
        ["TOTAL", fmt(t.costHKD, 2), fmt(t.valueHKD, 2), fmtS(t.unrealHKD, 2), pct(t.unrealPct), fmtS(t.realisedHKD, 2)]) +
        '<p class="note">Unrealised = value − cost (average-cost method). Realised comes from sells: qty × (sell price − avg cost) − fees, × FX.' + (t.incomeHKD ? " Dividends less fees: HKD " + fmtS(t.incomeHKD, 2) + "." : "") + "</p>");
    } else if (what === "split") {
      openModal("Splits – market, currency, sector", ["market", "currency", "sector"].map(function (k) {
        return "<h4>By " + k + "</h4>" + simpleTable([k, "Value HKD", "%"], m.splits[k].map(function (x) { return [esc(x.key), fmt(x.valueHKD, 2), wpct(x.pct)]; }),
          ["TOTAL", fmt(t.valueHKD, 2), wpct(m.splits[k].reduce(function (a, x) { return a + x.pct; }, 0))]);
      }).join(""));
    }
  }
  function drillRow(symbol) {
    const r = state.model.allRows.find(function (x) { return x.symbol === symbol; }); if (!r) return;
    const c = r.currency, t = state.model.totals;
    let html = '<div class="grid">' + [["Qty", fmt(r.qty, 0)], ["Avg cost", fmt(r.avgCost, 2) + " " + c], ["Last", r.hasPrice ? fmt(r.last_price, 2) + " " + c : "no price"],
      ["Value HKD", fmt(r.valueHKD, 2)], ["Unrealised HKD", '<span class="' + tone(r.unrealHKD) + '">' + fmtS(r.unrealHKD, 2) + " (" + pct(r.unrealPct) + ")</span>"], ["Weight", wpct(r.weightPct)],
      ["Realised HKD", '<span class="' + tone(r.realisedHKD) + '">' + fmtS(r.realisedHKD, 2) + "</span>"], ["Price date", fdate(r.last_price_date) + ' <span class="note">' + esc(r.price_note) + "</span>"]]
      .map(function (kv) { return '<div class="s3"><div class="label">' + kv[0] + '</div><div class="mono">' + kv[1] + "</div></div>"; }).join("") + "</div>";
    if (r.reasons.length) html += "<h4>Status</h4>" + r.reasons.map(function (x) { return "<div>" + badge(x.level) + " " + esc(sym(r.symbol)) + " " + esc(reasonText(x, r)) + "</div>"; }).join("");
    html += "<h4>Transactions (oldest first)</h4>" + simpleTable(["Date", "Type", "Qty", "Price " + c, "Fees", "Qty after", "Cost after " + c, "Avg after", "Realised " + c],
      r.steps.map(function (s) {
        const x = s.tx;
        return [fdate(x.trade_date), x.type, fmt(Calc.num(x.quantity), 0), fmt(Calc.num(x.price), 2), fmt(Calc.num(x.fees) || 0, 2), fmt(s.qtyAfter, 0), fmt(s.costAfter, 2), fmt(s.avgAfter, 2),
          x.type === "BUY" ? "" : '<span class="' + tone(s.cashEffect) + '">' + fmtS(s.cashEffect, 2) + "</span>"];
      }));
    const steps = [];
    r.steps.forEach(function (s) {
      const x = s.tx;
      if (x.type === "SELL") steps.push("Sell " + fdate(x.trade_date) + ": " + fmt(Calc.num(x.quantity), 0) + " × (" + fmt(Calc.num(x.price), 2) + " − avg " + fmt(s.avgBefore, 2) + ") − fees " + fmt(Calc.num(x.fees) || 0, 2) + " = " + fmtS(s.cashEffect, 2) + " " + c + " × FX " + r.fx + " = " + fmtS(s.cashEffect * r.fx, 2) + " HKD realised");
    });
    if (r.qty > 0) steps.push("Avg cost = remaining cost ÷ qty = " + fmt(r.costLocal, 2) + " ÷ " + fmt(r.qty, 0) + " = " + fmt(r.avgCost, 2) + " " + c);
    if (r.hasPrice) {
      steps.push("Value = " + fmt(r.qty, 0) + " × " + fmt(r.last_price, 2) + " = " + fmt(r.valueLocal, 2) + " " + c + " × FX " + r.fx + " = " + fmt(r.valueHKD, 2) + " HKD");
      steps.push("Unrealised = value − cost = " + fmt(r.valueLocal, 2) + " − " + fmt(r.costLocal, 2) + " = " + fmtS(r.unrealLocal, 2) + " " + c + " (" + pct(r.unrealPct) + ") = " + fmtS(r.unrealHKD, 2) + " HKD");
      steps.push("Weight = " + fmt(r.valueHKD, 2) + " ÷ " + fmt(t.valueHKD, 2) + " = " + wpct(r.weightPct));
      if (r.drawdownPct !== null && r.drawdownPct > 0) steps.push("Below avg cost = (" + fmt(r.avgCost, 2) + " − " + fmt(r.last_price, 2) + ") ÷ " + fmt(r.avgCost, 2) + " = " + fmt(r.drawdownPct, 1) + "%");
    } else steps.push("No last price yet, so value, P&L and weight can't be calculated. Enter a price in the table.");
    html += "<h4>Calculation steps</h4><ol class=\"steps\">" + steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>";
    openModal(esc(sym(r.symbol)) + " · " + esc(r.name) + " " + badge(r.status), html);
  }

  /* ===== SECTION: HOLDINGS PAGE (sector/name editing for My Portfolio) ===== */
  function renderHoldingsPage() {
    const m = state.model, my = state.mode === "my";
    const rows = m.allRows.map(function (r) {
      const h = state.pf.holdings.find(function (x) { return x.symbol === r.symbol; });
      const used = state.pf.transactions.some(function (x) { return x.symbol === r.symbol; });
      const name = my ? '<input data-action="hname" data-sym="' + esc(r.symbol) + '" value="' + esc(h.name) + '">' : esc(r.name);
      const sector = my ? '<select data-action="hsector" data-sym="' + esc(r.symbol) + '">' + SECTORS.map(function (s) { return "<option" + (s === r.sector ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" : esc(r.sector);
      return '<tr><td class="tk"><a href="#" data-action="drill" data-drill="row:' + esc(r.symbol) + '">' + esc(sym(r.symbol)) + '</a></td><td class="l">' + name + '</td><td class="l">' + sector + '</td><td class="l">' + r.market + '</td><td class="l">' + r.currency +
        "</td><td>" + fmt(r.qty, 0) + "</td><td>" + priceInput(r) + "</td><td>" + fdate(r.last_price_date) + '</td><td class="l note">' + esc(r.price_note) + "</td><td>" + fmt(r.valueHKD, 2) + "</td><td>" + (r.qty ? wpct(r.weightPct) : "—") +
        '</td><td class="l">' + (r.qty ? badge(r.status) : '<span class="badge soon-badge">Closed</span>') + "</td><td>" + (my && !used ? '<button class="btn danger" data-action="hdel" data-sym="' + esc(r.symbol) + '">Remove</button>' : "") + "</td></tr>";
    }).join("");
    $("page-holdings").innerHTML = '<div class="panel">' + phead("Holdings – " + (my ? "My Portfolio" : "Demo portfolio"), srcPf(), priceAsOf(), '<span class="note">' +
      (my ? "Edit name, sector and price here. Quantities come from transactions." : "Demo names and sectors are fixed. Price edits are kept in this browser until Reset demo data.") + "</span>") +
      (rows ? '<div class="table-wrap"><table><thead><tr><th class="l">Ticker</th><th class="l">Name</th><th class="l">Sector</th><th class="l">Mkt</th><th class="l">Ccy</th><th>Qty</th><th>Last</th><th>Price date</th><th class="l">Price note</th><th>Value HKD</th><th>Weight</th><th class="l">Tag</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="empty">No holdings yet. Holdings are created when you add a transaction or import a CSV.</div>') + "</div>";
  }

  /* ===== SECTION: TRANSACTIONS PAGE (add / delete for My Portfolio) ===== */
  function renderTransactions() {
    const my = state.mode === "my", f = state.txFilter.trim().toUpperCase();
    const list = state.pf.transactions.map(function (t, i) { return { t: t, i: i }; })
      .filter(function (x) { return !f || x.t.symbol.indexOf(f) >= 0 || x.t.type === f; })
      .sort(function (a, b) { return a.t.trade_date < b.t.trade_date ? 1 : a.t.trade_date > b.t.trade_date ? -1 : b.i - a.i; });
    const form = my ? '<div class="panel"><div class="panel-head"><span class="panel-title">Add transaction</span></div><div class="form-grid">' +
      '<label class="field"><span class="label">Date</span><input id="tx-date" type="date" value="' + state.today + '"></label>' +
      '<label class="field"><span class="label">Ticker</span><input id="tx-ticker" placeholder="0700.HK or AAPL"></label>' +
      '<label class="field"><span class="label">Type</span><select id="tx-type">' + TX_TYPES.map(function (t) { return "<option>" + t + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span class="label">Qty</span><input id="tx-qty" class="num" type="number" step="any"></label>' +
      '<label class="field"><span class="label">Price</span><input id="tx-price" class="num" type="number" step="any"></label>' +
      '<label class="field"><span class="label">Currency</span><select id="tx-ccy"><option value="">Auto</option><option>HKD</option><option>USD</option></select></label>' +
      '<label class="field"><span class="label">Fees</span><input id="tx-fees" class="num" type="number" step="any" value="0"></label>' +
      '<label class="field"><span class="label">Note</span><input id="tx-note"></label>' +
      '</div><div class="row-actions"><button class="btn primary" data-action="tx-add">Add</button><span class="note">DIV: qty = shares, price = dividend per share. FEE: amount in fees.</span><span id="tx-msg" class="err"></span></div></div>'
      : '<div class="panel note">Demo transactions are fixed. Switch to My Portfolio on Rules &amp; Settings to add your own.</div>';
    const rows = list.map(function (x) {
      const t = x.t;
      return "<tr><td>" + fdate(t.trade_date) + '</td><td class="tk">' + esc(sym(t.symbol)) + '</td><td class="l">' + esc(t.type) + "</td><td>" + fmt(Calc.num(t.quantity), 0) + "</td><td>" + fmt(Calc.num(t.price), 2) +
        '</td><td class="l">' + esc(t.currency) + "</td><td>" + fmt(Calc.num(t.fees) || 0, 2) + '</td><td class="l note">' + esc(t.note || "") + '</td><td class="l note">' + esc(t.source || "") +
        "</td><td>" + (my ? '<button class="btn danger" data-action="tx-del" data-i="' + x.i + '">Delete</button>' : "") + "</td></tr>";
    }).join("");
    $("page-transactions").innerHTML = '<div class="stack">' + form + '<div class="panel">' + phead("Transactions (" + state.pf.transactions.length + ")", srcPf(), null, '<input id="tx-filter" data-action="tx-filter" placeholder="Filter ticker or type" value="' + esc(state.txFilter) + '">') +
      (rows ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th class="l">Ticker</th><th class="l">Type</th><th>Qty</th><th>Price</th><th class="l">Ccy</th><th>Fees</th><th class="l">Note</th><th class="l">Source</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="empty">' + (state.pf.transactions.length ? "No transactions match the filter." : "No transactions yet.") + "</div>") + "</div></div>";
  }
  function addTransaction() {
    const v = function (id) { return $(id).value; };
    const cells = [v("tx-date"), v("tx-ticker"), v("tx-type"), v("tx-qty"), v("tx-price"), v("tx-ccy"), v("tx-fees")];
    const mapping = {}; Calc.IMPORT_FIELDS.forEach(function (f, i) { mapping[f] = i; });
    const res = Calc.validateImport([cells], mapping, state.my.transactions, state.today).rows[0];
    if (res.status === "error") { $("tx-msg").textContent = "Not added: " + res.errors.join("; "); return; }
    if (res.status === "duplicate" && !window.confirm("An identical transaction already exists. Add it anyway?")) return;
    res.tx.note = v("tx-note"); res.tx.source = "manual";
    state.my = Calc.applyImport(state.my, [Object.assign({}, res, { status: "ok" })], true).portfolio;
    saveMy(); recalc(); toast("Transaction added.");
  }

  /* ===== SECTION: IMPORT / EXPORT PAGE ===== */
  function renderImport() {
    const imp = state.imp;
    let html = '<div class="grid"><div class="panel s8">' + phead("CSV import → My Portfolio", "your CSV file", null, '<button class="btn" data-action="template">CSV template</button>') +
      '<div class="row-actions"><input type="file" id="csv-file" accept=".csv,text/csv,text/plain" data-action="csv-file"><span class="note">or paste below</span></div>' +
      '<textarea id="csv-text" placeholder="date,ticker,type,qty,price,currency,fees">' + esc(imp ? imp.text : "") + '</textarea><div class="row-actions"><button class="btn" data-action="csv-preview">Preview</button>' +
      '<span class="note">Columns: date, ticker, type (BUY/SELL/DIV/FEE), qty, price, currency, fees. Dates YYYY-MM-DD or DD/MM/YYYY.</span></div>';
    if (imp && imp.headers) {
      html += "<h4 class=\"label\" style=\"margin-top:12px\">1. Column mapping</h4><div class=\"form-grid\">" + Calc.IMPORT_FIELDS.map(function (f) {
        return '<label class="field"><span class="label">' + f + '</span><select data-action="map" data-f="' + f + '"><option value="-1">(none)</option>' +
          imp.headers.map(function (h, i) { return '<option value="' + i + '"' + (imp.mapping[f] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</div>";
      const c = imp.preview.counts;
      html += '<h4 class="label" style="margin-top:12px">2. Preview</h4><div class="note mono">' + c.ok + " ready · " + c.duplicate + " duplicate · " + c.error + " error</div>" +
        simpleTable(["Line", "Date", "Ticker", "Type", "Qty", "Price", "Ccy", "Fees", "Status", "Detail"], imp.preview.rows.map(function (r) {
          const g = function (f) { return imp.mapping[f] >= 0 ? esc(r.cells[imp.mapping[f]] || "") : ""; };
          return [r.line, g("date"), g("ticker"), g("type"), g("qty"), g("price"), g("currency"), g("fees"), badge(r.status === "ok" ? "OK" : r.status.toUpperCase()),
            '<span class="' + (r.status === "error" ? "err" : "note") + '">' + esc(r.status === "error" ? r.errors.join("; ") : r.status === "duplicate" ? "same as " + r.dupOf + " – skipped" : r.tx.symbol) + "</span>"];
        })) +
        '<div class="row-actions"><label><input type="checkbox" id="imp-dups" data-action="imp-dups"' + (imp.includeDups ? " checked" : "") + '> Import duplicates too</label>' +
        '<button class="btn primary" data-action="imp-confirm"' + (c.ok + (imp.includeDups ? c.duplicate : 0) ? "" : " disabled") + ">3. Import " + (c.ok + (imp.includeDups ? c.duplicate : 0)) + " row(s) into My Portfolio</button></div>";
    }
    if (imp && imp.result) html += '<div class="row-actions mono" id="imp-result">' + esc(imp.result) + "</div>";
    html += '</div><div class="s4 stack"><div class="panel">' + phead("Export – " + (state.mode === "demo" ? "Demo" : "My Portfolio"), srcPf()) +
      '<div class="row-actions"><button class="btn" data-action="exp-holdings">Holdings CSV</button><button class="btn" data-action="exp-tx">Transactions CSV</button></div></div>' +
      '<div class="panel">' + phead("Backup – My Portfolio", "this browser") + '<div class="row-actions"><button class="btn" data-action="exp-json">JSON backup</button>' +
      '<label class="btn">Restore JSON<input type="file" id="json-file" accept=".json,application/json" data-action="json-file" hidden></label></div>' +
      '<p class="note">My Portfolio has ' + state.my.holdings.length + " holdings and " + state.my.transactions.length + " transactions, saved only in this browser.</p></div></div></div>";
    $("page-import").innerHTML = html;
  }
  function previewCSV(text) {
    const rows = Calc.parseCSV(text);
    if (rows.length < 2) { state.imp = { text: text, result: "Nothing to preview: need a header row and at least one data row." }; return renderImport(); }
    state.imp = { text: text, headers: rows[0], data: rows.slice(1), mapping: Calc.guessMapping(rows[0]), includeDups: false };
    revalidate();
  }
  function revalidate() { const imp = state.imp; imp.preview = Calc.validateImport(imp.data, imp.mapping, state.my.transactions, state.today); imp.result = ""; renderImport(); }
  function confirmImport() {
    const imp = state.imp, res = Calc.applyImport(state.my, imp.preview.rows, imp.includeDups);
    state.my = res.portfolio; saveMy();
    const msg = res.imported + " imported, " + res.skipped + " duplicate" + (res.skipped === 1 ? "" : "s") + " skipped, " + imp.preview.counts.error + " error" + (imp.preview.counts.error === 1 ? "" : "s") + " (not imported)" +
      (res.created.length ? ". New holdings (Unclassified, no price): " + res.created.join(", ") : "") + ".";
    state.imp = { text: "", result: msg };
    if (state.mode !== "my") { state.mode = "my"; save(STORAGE_KEYS.mode, "my"); }
    recalc(); toast(msg);
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function restoreJSON(text) {
    let data; try { data = JSON.parse(text); } catch (e) { return toast("That file isn't valid JSON.", true); }
    const pf = cleanPortfolio(data && data.myPortfolio ? data.myPortfolio : data);
    if (!pf) return toast("No holdings/transactions found in that file.", true);
    if (!window.confirm("Replace My Portfolio with " + pf.holdings.length + " holdings and " + pf.transactions.length + " transactions from the backup" + (data.settings ? " and restore its settings" : "") + "?")) return;
    state.my = pf; saveMy();
    if (data.settings) { state.settings = cleanSettings(data.settings); save(STORAGE_KEYS.settings, state.settings); }
    state.mode = "my"; save(STORAGE_KEYS.mode, "my"); recalc(); toast("My Portfolio restored.");
  }

  /* ===== SECTION: RULES & SETTINGS PAGE ===== */
  const SETTING_FIELDS = [
    ["usd_hkd_rate", "USD/HKD rate", "0.0001"], ["max_weight_pct", "Flag: max weight %", "0.1"], ["max_drawdown_pct", "Flag: max drop below avg cost %", "0.1"],
    ["watch_weight_pct", "Watch: weight %", "0.1"], ["watch_drawdown_pct", "Watch: drop below avg cost %", "0.1"]
  ];
  function renderSettings() {
    const s = state.settings, demo = state.mode === "demo";
    $("page-settings").innerHTML = '<div class="grid"><div class="panel s6">' + phead("Rules &amp; FX", "this browser", "FX as of " + fdate(s.rate_as_of), '<span class="note">Changes recalculate instantly</span>') + '<div class="form-grid">' +
      SETTING_FIELDS.map(function (f) { return '<label class="field"><span class="label">' + f[1] + '</span><input class="num" type="number" min="0" step="' + f[2] + '" data-action="setting" data-k="' + f[0] + '" value="' + s[f[0]] + '"></label>'; }).join("") +
      '<label class="field"><span class="label">Rate as of</span><input type="date" data-action="setting" data-k="rate_as_of" value="' + esc(s.rate_as_of) + '"></label></div>' +
      '<p class="note">Flag = weight above the max, or last price more than the max % below average cost. Watch = past a watch level but not flagged. Data check 7 expects USD/HKD between 7.75 and 7.85.</p>' +
      (s.watch_weight_pct > s.max_weight_pct || s.watch_drawdown_pct > s.max_drawdown_pct ? '<p class="err">A watch level is above its flag level, so Watch can never trigger for it.</p>' : "") + "</div>" +
      '<div class="panel s6"><div class="panel-head"><span class="panel-title">Portfolio</span></div><div class="row-actions">' +
      '<button class="btn' + (demo ? " on" : "") + '" data-action="mode" data-m="demo">Demo portfolio</button><button class="btn' + (!demo ? " on" : "") + '" data-action="mode" data-m="my">My Portfolio</button></div>' +
      '<div class="row-actions"><button class="btn danger" data-action="reset-demo">Reset demo data</button><button class="btn danger" data-action="clear-my">Clear My Portfolio</button></div>' +
      '<p class="note">Reset demo data restores the original demo prices and the default rules (20 / 15 / 15 / 10, USD/HKD 7.80). Clear My Portfolio deletes your holdings and transactions from this browser. Both ask first. Download a JSON backup before clearing.</p></div></div><div id="module-settings"></div>';
    modules().forEach(function (m) { if (m.renderSettings) m.renderSettings($("module-settings")); });
  }
  function updateSetting(k, raw) {
    if (k === "rate_as_of") { if (Calc.parseDate(raw)) state.settings.rate_as_of = raw; }
    else {
      const v = Calc.num(raw);
      if (!isFinite(v) || v < 0 || (k === "usd_hkd_rate" && v === 0)) { toast("Please enter a valid number.", true); return renderSettings(); }
      state.settings[k] = v;
    }
    save(STORAGE_KEYS.settings, state.settings); recalc();
  }

  /* ===== SECTION: COMING SOON PAGES ===== */
  function soonCard(c, cls) {
    return '<div class="panel soon-card' + (cls || "") + '">' + phead(esc(c.label), null, null, '<span class="badge soon-badge">Coming soon</span>') + "<p>" + esc(c.line) + "</p>" +
      '<p class="note">' + (c.phase ? "Planned · Phase " + c.phase + " of plan v3" : "") + (c.cmd ? ' · command <span class="mono">' + esc(c.cmd) + "</span>" : "") + "</p></div>";
  }
  function renderSoon(id) {
    const c = COMING_SOON.find(function (x) { return x.id === id; }) || COMING_SOON[0];
    $("page-soon").innerHTML = soonCard(c);
  }

  /* ===== SECTION: ACTIONS ===== */
  function setPrice(symbol, raw) {
    const v = Calc.num(raw);
    if (!(isFinite(v) && v > 0)) { toast("Price must be a number above 0.", true); return renderPage(); }
    if (state.mode === "demo") { state.demoPrices[symbol] = { last_price: v, last_price_date: state.today }; save(STORAGE_KEYS.demoPrices, state.demoPrices); }
    else {
      const h = state.my.holdings.find(function (x) { return x.symbol === symbol; }); if (!h) return;
      h.last_price = v; h.last_price_date = state.today; h.price_note = "Entered manually"; saveMy();
    }
    recalc();
  }
  function setMode(m) { state.mode = m === "my" ? "my" : "demo"; save(STORAGE_KEYS.mode, state.mode); state.filter = "ALL"; state.flashPrev = {}; recalc(); }
  function toast(msg, isError) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (isError ? " error" : ""); t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function readFile(input, cb) {
    const f = input.files && input.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = function () { cb(String(r.result)); input.value = ""; }; r.onerror = function () { toast("Couldn't read that file.", true); }; r.readAsText(f);
  }

  /* ===== SECTION: EVENT WIRING (delegated) ===== */
  document.addEventListener("click", function (e) {
    const th = e.target.closest("th[data-sort]");
    if (th) { const k = th.getAttribute("data-sort"); state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === "symbol" || k === "name" ? 1 : -1) }; return renderPage(); }
    if (e.target === $("modal")) return closeModal();
    const el = e.target.closest("[data-action]"); if (!el) return;
    const a = el.getAttribute("data-action");
    if (["price", "hname", "hsector", "setting", "map", "imp-dups", "tx-filter", "csv-file", "json-file"].indexOf(a) >= 0) return;
    if (el.tagName === "A") e.preventDefault();
    if (a === "drill") drill(el.getAttribute("data-drill"));
    else if (a === "close-modal") closeModal();
    else if (a === "filter") { state.filter = el.getAttribute("data-f"); renderDashboard(); }
    else if (a === "goto-checks") { if (state.page !== "dashboard") location.hash = "#dashboard"; setTimeout(function () { const p = $("checks-panel"); if (p) p.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50); }
    else if (a === "toggle-analyst") $("analyst-panel").hidden = !$("analyst-panel").hidden;
    else if (a === "toggle-menu") $("sidebar").classList.toggle("open");
    else if (a === "dismiss-notice") { state.notices.splice(+el.getAttribute("data-i"), 1); renderBanner(); }
    else if (a === "mode") setMode(el.getAttribute("data-m"));
    else if (a === "reset-demo") {
      if (!window.confirm("Reset demo data? This restores the original demo prices, the default rules and FX rate, and the value-chain demo mapping and rules.")) return;
      modules().forEach(function (m) { if (m.onResetDemo) m.onResetDemo(); });
      state.demoPrices = {}; save(STORAGE_KEYS.demoPrices, {}); state.settings = cleanSettings(buildDemoPortfolio(state.today).settings); save(STORAGE_KEYS.settings, state.settings);
      recalc(); toast("Demo data reset.");
    } else if (a === "clear-my") {
      if (!window.confirm("Clear My Portfolio? This deletes all your holdings and transactions from this browser.")) return;
      modules().forEach(function (m) { if (m.onClearMy) m.onClearMy(); });
      state.my = { holdings: [], transactions: [] }; saveMy(); recalc(); toast("My Portfolio cleared.");
    } else if (a === "tx-add") addTransaction();
    else if (a === "tx-del") { if (window.confirm("Delete this transaction?")) { state.my.transactions.splice(+el.getAttribute("data-i"), 1); saveMy(); recalc(); } }
    else if (a === "hdel") { const s = el.getAttribute("data-sym"); state.my.holdings = state.my.holdings.filter(function (h) { return h.symbol !== s; }); saveMy(); recalc(); }
    else if (a === "csv-preview") previewCSV($("csv-text").value);
    else if (a === "imp-confirm") confirmImport();
    else if (a === "template") download("winston-terminal-template.csv", "date,ticker,type,qty,price,currency,fees\r\n2025-03-03,0700.HK,BUY,100,400.00,HKD,0\r\n", "text/csv");
    else if (a === "exp-holdings") download("winston-terminal-holdings-" + state.mode + "-" + state.today + ".csv", Calc.holdingsCSV(state.model), "text/csv");
    else if (a === "exp-tx") download("winston-terminal-transactions-" + state.mode + "-" + state.today + ".csv", Calc.transactionsCSV(state.pf.transactions), "text/csv");
    else if (a === "exp-json") download("winston-terminal-backup-" + state.today + ".json", JSON.stringify({ app: "Winston Terminal", version: 1, exported_at: new Date().toISOString(), myPortfolio: state.my, settings: state.settings }, null, 2), "application/json");
  });
  document.addEventListener("change", function (e) {
    const el = e.target, a = el.getAttribute && el.getAttribute("data-action"); if (!a) return;
    const s = el.getAttribute("data-sym");
    if (a === "price") setPrice(s, el.value);
    else if (a === "setting") updateSetting(el.getAttribute("data-k"), el.value);
    else if (a === "hname") { const h = state.my.holdings.find(function (x) { return x.symbol === s; }); if (h) { h.name = el.value.trim() || s; saveMy(); recalc(); } }
    else if (a === "hsector") { const h = state.my.holdings.find(function (x) { return x.symbol === s; }); if (h) { h.sector = el.value; saveMy(); recalc(); } }
    else if (a === "map") { state.imp.mapping[el.getAttribute("data-f")] = +el.value; revalidate(); }
    else if (a === "imp-dups") { state.imp.includeDups = el.checked; renderImport(); }
    else if (a === "csv-file") readFile(el, function (text) { previewCSV(text); });
    else if (a === "json-file") readFile(el, restoreJSON);
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "tx-filter") { state.txFilter = e.target.value; const pos = e.target.selectionStart; renderTransactions(); const f = $("tx-filter"); f.focus(); f.setSelectionRange(pos, pos); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeModal(); $("analyst-panel").hidden = true; }
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("price")) e.target.blur();
  });
  window.addEventListener("hashchange", route);
  ["mousedown", "focusin"].forEach(function (ev) {
    document.addEventListener(ev, function (e) { const p = e.target.closest && e.target.closest(".content .panel"); if (p) focusPanel(p); });
  });

  /* ===== SECTION: COMMAND API (window.WT_APP, used by cmd.js – navigation and display only, no maths) ===== */
  window.WT_APP = {
    go: function (page) { if ((location.hash || "#dashboard") === "#" + page) route(); else location.hash = "#" + page; },
    page: function () { return state.page; },
    mode: function () { return state.mode; },
    setMode: function (m) { setMode(m); },
    holdings: function () { return state.model ? state.model.rows.map(function (r) { return { symbol: r.symbol, name: r.name }; }) : []; },
    isHeld: function (s) { return !!(state.model && state.model.rows.some(function (r) { return r.symbol === s; })); },
    drill: function (key) { drill(key); },
    closeModal: closeModal,
    showChecks: function () { if (state.page !== "dashboard") location.hash = "#dashboard"; setTimeout(function () { const p = $("checks-panel"); if (p) { p.scrollIntoView({ block: "center" }); focusPanel(p); } }, 60); },
    analyst: function (open) { $("analyst-panel").hidden = !open; },
    module: function (id) { return moduleFor(id); },
    toast: toast, sym: sym, esc: esc, version: APP_VERSION
  };

  /* ===== SECTION: START ===== */
  function start() {
    loadAll();
    const cdn = $("chartjs-cdn"), chartFailed = function () { state.chart = "failed"; state.notices.push("Chart.js didn't load (offline?), so donuts are hidden. All figures and checks still work."); };
    if (typeof Chart !== "undefined") { state.chart = "ready"; Chart.defaults.color = "#8A94A6"; }
    else if (window.WT_CHART_STATE === "failed" || !cdn) chartFailed();
    else { // lazy: Chart.js arrives after first paint, then the current page redraws with charts
      cdn.addEventListener("load", function () { if (typeof Chart === "undefined") { chartFailed(); renderBanner(); } else { state.chart = "ready"; Chart.defaults.color = "#8A94A6"; } renderPage(); });
      cdn.addEventListener("error", function () { chartFailed(); renderBanner(); renderPage(); });
    }
    state.pf = state.mode === "demo" ? demoPortfolio() : state.my;
    state.model = Calc.computePortfolio(state.pf.holdings, state.pf.transactions, state.settings);
    tick(); setInterval(tick, 1000);
    const sk = $("load-skel"); if (sk) sk.parentNode.removeChild(sk);
    document.body.classList.remove("is-loading");
    renderHeader(); renderBanner(); renderFooter(); route();
  }
  start();
})();

// END OF FILE: app.js
