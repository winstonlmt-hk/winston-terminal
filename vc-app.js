// vc-app.js – Winston Terminal v4: Value Chain Explorer page (#valuechain). Rendering, storage and events only; maths in vc-calc.js.
// Registers itself in window.WT_MODULES; app.js calls render(ctx) when the route is #valuechain.
// v3 (polish foundation): source/as-of chips on panel heads, header "VC 8/8" status hook, change flash on KPIs, colour contract (amber = FLAG/WATCH focus on KPIs).
// v4: new default "Supply Chain" tab (SPLC-style focal map) rendered by vc-splc.js; the other four tabs are unchanged.
// v4 (Phase 2): command(op, arg) hook so cmd.js can open a tab, run a shock preset, centre the map or open a company drawer.

(function () {
  "use strict";

  /* ===== SECTION: STATE ===== */
  const vs = {
    ctx: null, tab: typeof VCSplc !== "undefined" ? "splc" : "map", metric: "gm_pct", drawer: null, shockId: "capex_cut", pathSym: null, ran: false,
    custom: { target: "node:cloud", type: "demand", pct: -20, pass_through: 0, crit_mult: 1 }, customErrors: [], charts: {}, notices: []
  };
  const TABS = (typeof VCSplc !== "undefined" ? [["splc", "Supply Chain"]] : []).concat([["map", "Chain Map"], ["pools", "Profit Pools"], ["exposure", "Exposure"], ["shock", "Shock Simulator"]]);
  const TEAL_SCALE = ["#103433", "#174E4B", "#1F6E69", "#279A91", "#2EC4B6"];
  const C = {}; VC_DATA.companies.forEach(function (c) { C[c.symbol] = c; });
  const NODE = {}; VC_DATA.nodes.forEach(function (n) { NODE[n.id] = n; });
  const NODES = VC_DATA.nodes.slice().sort(function (a, b) { return a.order - b.order; });
  const $ = function (id) { return document.getElementById(id); };

  /* ===== SECTION: STORAGE (winstonTerminal.v1.vcExposure.demo / .my, winstonTerminal.v1.vcSettings) ===== */
  function load(key) {
    try { const raw = window.localStorage.getItem(key); return raw === null ? undefined : JSON.parse(raw); }
    catch (e) { vs.notices.push("Saved value-chain data couldn't be read, so defaults are shown."); return undefined; }
  }
  function save(key, v) { try { window.localStorage.setItem(key, JSON.stringify(v)); } catch (e) { toast("Couldn't save in this browser.", true); } }
  function remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* storage blocked: nothing to remove */ } }
  function getSettings() {
    const s = load(VC_STORAGE_KEYS.settings), out = Object.assign({}, VC_DEFAULT_SETTINGS);
    if (s && typeof s === "object") Object.keys(out).forEach(function (k) { const v = Number(s[k]); if (isFinite(v) && v >= 0) out[k] = v; });
    return out;
  }
  function exposureKey() { return vs.ctx && vs.ctx.mode === "my" ? VC_STORAGE_KEYS.exposureMy : VC_STORAGE_KEYS.exposureDemo; }
  function defaultExposure() { return vs.ctx && vs.ctx.mode === "my" ? [] : JSON.parse(JSON.stringify(VC_DATA.holdingExposure)); }
  function getExposure() {
    const hx = load(exposureKey());
    if (hx === undefined) return defaultExposure();
    const ok = Array.isArray(hx) && hx.every(function (h) { return h && typeof h.symbol === "string" && Array.isArray(h.exposures); });
    if (!ok) { vs.notices.push("Saved value-chain mapping was damaged, so the default mapping is shown."); return defaultExposure(); }
    return hx;
  }
  function setExposure(hx) { save(exposureKey(), hx.filter(function (h) { return h.exposures.length; })); }

  /* ===== SECTION: FORMATTING (display only) ===== */
  const MINUS = "\u2212";
  function signed(x, dp, unit) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    const s = Math.abs(x).toFixed(dp), z = !/[1-9]/.test(s);
    return (z ? "" : x < 0 ? MINUS : "+") + s + (unit || "");
  }
  function toneOf(x, dp) { if (!isFinite(x)) return "zero"; const r = Number(x.toFixed(dp === undefined ? 2 : dp)); return r > 0 ? "pos" : r < 0 ? "neg" : "zero"; }
  function h() { return vs.ctx.h; }
  function esc(s) { return h().esc(s); }
  function hkd(x, dp) { return h().fmt(x, dp === undefined ? 0 : dp); }
  function hkdS(x, dp) { return h().fmtS(x, dp === undefined ? 0 : dp); }
  function illus() { return '<span class="badge vc-illus">ILLUSTRATIVE DATA</span>'; }
  function toast(m, err) { if (vs.ctx) vs.ctx.h.toast(m, err); }
  function short(name) { return name.length > 13 ? name.slice(0, 12) + "…" : name; }
  function targetLabel(t) { return t.indexOf("node:") === 0 ? (NODE[t.slice(5)] ? NODE[t.slice(5)].name : t) : t; }
  function itemText(i) { return targetLabel(i.target) + " " + i.type + " " + signed(i.pct, 0, "%"); }

  /* ===== SECTION: DERIVED DATA FOR THE ACTIVE PORTFOLIO ===== */
  function derive() {
    const ctx = vs.ctx, s = getSettings(), hx = getExposure();
    const rows = ctx.model.rows, total = ctx.model.totals.valueHKD, holdingSymbols = ctx.pf.holdings.map(function (x) { return x.symbol; });
    const d = { s: s, hx: hx, rows: rows, total: total, holdingSymbols: holdingSymbols, stats: VCCalc.nodeStats(VC_DATA),
      exp: VCCalc.portfolioExposure(VC_DATA, rows, hx, s, total), checks: VCCalc.dataChecks(VC_DATA, hx, holdingSymbols) };
    d.passed = d.checks.filter(function (c) { return c.pass; }).length;
    const shock = currentShock();
    d.shock = shock; d.shockErrors = VCCalc.validateShock(VC_DATA, shock);
    if (!d.shockErrors.length) {
      d.res = VCCalc.propagate(VC_DATA, shock, s); d.ranked = VCCalc.rankCompanies(VC_DATA, d.res);
      d.impact = VCCalc.holdingImpact(VC_DATA, rows, hx, d.res, s, total);
    }
    return d;
  }
  function currentShock() {
    if (vs.shockId !== "custom") return VC_DATA.shocks.find(function (x) { return x.id === vs.shockId; }) || VC_DATA.shocks[0];
    const c = vs.custom;
    return { id: "custom", name: "Custom shock", items: [{ target: c.target, type: c.type, pct: Number(c.pct) }], pass_through: Number(c.pass_through), crit_mult: Number(c.crit_mult) };
  }

  /* ===== SECTION: PAGE SHELL (header, tabs, banner, checks) ===== */
  function render(ctx) {
    if (ctx) vs.ctx = ctx;
    const el = vs.ctx.el, d = derive();
    let html = '<div class="panel vc-head"><span class="vc-title">VALUE CHAIN EXPLORER</span><span class="note">' + esc(VC_DATA.meta.theme) + "</span>" + illus() +
      '<a href="#" class="vc-checks-chip mono ' + (d.passed === 8 ? "ok" : "bad") + '" data-vc="goto-vc-checks">VC checks ' + d.passed + "/8 " + (d.passed === 8 ? "✓" : "✗") + "</a></div>" +
      '<div class="vc-tabs">' + TABS.map(function (t) { return '<button class="vc-tab' + (vs.tab === t[0] ? " active" : "") + '" data-vc="tab" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>";
    html += vs.notices.map(function (n) { return '<div class="banner info"><div class="banner-line">' + esc(n) + "</div></div>"; }).join("");
    html += vcBanner(d);
    if (vs.tab === "splc") html += VCSplc.html(d, vs.ctx, splcApi());
    else if (vs.tab === "map") html += tabMap(d);
    else if (vs.tab === "pools") html += tabPools(d);
    else if (vs.tab === "exposure") html += tabExposure(d);
    else html += tabShock(d);
    html += checksPanel(d) + '<p class="note">Names, tickers and node mapping are real. Every number on this page (revenue, margins, multiples, growth, AI exposure, link weights, holding exposures) is illustrative demo data, not real financials. Not investment advice.</p>';
    Object.keys(vs.charts).forEach(function (k) { vs.charts[k].destroy(); }); vs.charts = {};
    el.innerHTML = html;
    drawCharts(d);
    if (vs.drawer) renderDrawer(d);
    if (h().after) h().after(el, "vc-" + vs.ctx.mode);
  }
  function vcBanner(d) {
    const lines = d.exp.flags.concat(d.exp.watch).map(function (n) {
      return '<div class="banner-line">' + h().badge(n.status) + "<b>" + esc(n.name) + "</b><span>is " + n.pctChain.toFixed(1) + "% of AI-chain exposure (" + (n.status === "FLAG" ? "limit " + d.s.vc_node_limit_pct : "watch " + d.s.vc_node_watch_pct) + "%)</span></div>";
    });
    if (!d.hx.length) return '<div class="banner info"><div class="banner-line">No holdings mapped to the value chain yet' + (vs.ctx.mode === "my" ? " – My Portfolio starts unmapped. Map holdings on the Exposure tab." : ".") + "</div></div>";
    return lines.length ? '<div class="banner ' + (d.exp.flags.length ? "flag" : "watch") + '">' + lines.join("") + "</div>" : '<div class="banner clear">Value chain: no node above the watch level</div>';
  }
  function checksPanel(d) {
    return '<div class="panel" id="vc-checks-panel"><div class="panel-head"><span class="panel-title">VC data checks</span><span class="src-chip" title="Source">vc-calc.js</span><span class="asof">on every change</span><span class="panel-actions mono">' + d.passed + '/8</span></div>' +
      d.checks.map(function (c) { return '<div class="check">' + h().badge(c.pass ? "PASS" : "FAIL") + "<span>" + c.id + ". " + esc(c.label) + '</span><span class="d">' + esc(c.detail) + "</span></div>"; }).join("") +
      '<p class="note">Separate from the Phase 1 header checks (7/7), which are unchanged.</p></div>';
  }
  function tabHead(title, extra) {
    return '<div class="panel-head"><span class="panel-title">' + title + "</span>" + illus() + srcChips() + '<span class="panel-actions">' + (extra || "") + "</span></div>";
  }
  function srcChips() { // Map and Profit pools use VC_DATA only; Exposure and Shock also use the active portfolio
    if (vs.tab === "splc" || vs.tab === "map" || vs.tab === "pools") return '<span class="src-chip" title="Source">VC_DATA · illustrative</span><span class="asof">static demo set</span>';
    const dates = vs.ctx.pf.holdings.map(function (x) { return x.last_price_date; }).filter(Boolean).sort();
    return '<span class="src-chip" title="Source">VC_DATA + ' + (vs.ctx.mode === "demo" ? "Demo seed" : "My Portfolio") + '</span><span class="asof">prices as of ' + (dates.length ? h().fdate(dates[dates.length - 1]) : "—") + "</span>";
  }
  function status(ctx) { // header data-quality chip (app.js renderHeader); notices from a damaged mapping are shown on the page itself
    vs.ctx = ctx;
    const n0 = vs.notices.length, checks = VCCalc.dataChecks(VC_DATA, getExposure(), ctx.pf.holdings.map(function (x) { return x.symbol; }));
    const n = checks.filter(function (c) { return c.pass; }).length;
    vs.notices.length = n0;
    return { label: "VC " + n + "/8 " + (n === 8 ? "✓" : "✗"), ok: n === 8, passed: n, checks: checks };
  }

  /* ===== SECTION: CHAIN MAP (shared by Chain Map and Shock tabs) ===== */
  function chainMap(colour, sub) {
    return '<div class="vc-map">' + NODES.map(function (n) {
      const cs = VC_DATA.companies.filter(function (c) { return c.node === n.id; });
      return '<div class="vc-lane"><div class="vc-lane-head" title="' + esc(n.role) + '"><span class="mono">' + n.order + "</span> " + esc(n.name) + "</div>" +
        cs.map(function (c) {
          const col = colour(c);
          return '<div class="vc-chip" data-vc="chip" data-sym="' + esc(c.symbol) + '" style="background:' + col.bg + ";color:" + col.fg + '" title="' + esc(c.name + " · " + c.symbol) + '"><b class="mono">' + esc(h().sym(c.symbol)) + '</b><span class="vc-chip-name">' + esc(short(c.name)) + "</span>" +
            (sub ? '<span class="vc-chip-sub mono">' + sub(c) + "</span>" : "") + "</div>";
        }).join("") + "</div>";
    }).join("") + "</div>";
  }
  function tabMap(d) {
    const m = VC_METRICS.find(function (x) { return x.key === vs.metric; }), b = VCCalc.metricBuckets(VC_DATA.companies, vs.metric);
    const picker = '<label class="note">Colour by <select data-vc="metric">' + VC_METRICS.map(function (x) { return '<option value="' + x.key + '"' + (x.key === vs.metric ? " selected" : "") + ">" + x.label + "</option>"; }).join("") + "</select></label>";
    const legend = '<div class="vc-legend">' + b.ranges.map(function (r, i) {
      return '<span><i style="background:' + TEAL_SCALE[i] + '"></i>Q' + r.bucket + " " + (r.min === null ? "—" : r.min + (r.max !== r.min ? "–" + r.max : "") + m.unit) + "</span>";
    }).join("") + '<span class="note">Hover: suppliers <b class="teal">teal</b>, customers <b class="amber">amber</b>. Click a chip for details.</span></div>';
    return '<div class="panel">' + tabHead("Chain map – upstream to downstream", picker) + legend +
      chainMap(function (c) { const q = b.bySymbol[c.symbol] || 1; return { bg: TEAL_SCALE[q - 1], fg: q >= 4 ? "#0A0D10" : "#E6E6E6" }; }, function (c) { return c[vs.metric] + m.unit; }) +
      '<p class="note">' + VC_DATA.companies.length + " companies, " + VC_DATA.edges.length + " supplier→customer links (w = share of the supplier's revenue from that customer). Quintiles are rank-based across all companies.</p></div>";
  }

  /* ===== SECTION: COMPANY DRAWER ===== */
  function ensureDrawer() {
    let el = $("vc-drawer");
    if (!el) { el = document.createElement("aside"); el.id = "vc-drawer"; el.className = "vc-drawer"; el.hidden = true; document.body.appendChild(el); }
    return el;
  }
  function renderDrawer(d) {
    const el = ensureDrawer(), L = VCCalc.companyLinks(VC_DATA, vs.drawer, d.hx, d.holdingSymbols);
    if (!L || vs.ctx.el.offsetParent === null) { el.hidden = true; return; }
    const c = L.company, n = NODE[c.node];
    const link = function (x) { return '<a href="#" data-vc="open" data-sym="' + esc(x.symbol) + '" class="mono">' + esc(h().sym(x.symbol)) + "</a> " + esc(x.name) + ' <span class="muted mono">w ' + x.w + "</span>"; };
    const list = function (arr, f) { return arr.length ? "<ul class=\"vc-list\">" + arr.map(function (x) { return "<li>" + f(x) + "</li>"; }).join("") + "</ul>" : '<p class="note">None modelled.</p>'; };
    let html = '<div class="panel-head"><span class="panel-title mono">' + esc(c.symbol) + '</span><span class="src-chip" title="Source">VC_DATA · illustrative</span><button class="icon-btn" data-vc="close-drawer" aria-label="Close">×</button></div>' +
      "<div><b>" + esc(c.name) + '</b> <span class="note">' + esc(n.name) + " · " + esc(c.country) + "</span></div><div style=\"margin:6px 0\">" + illus() + "</div>" +
      "<h4>Metrics (illustrative)</h4>" +
      [["Revenue", c.rev_usd_bn + " USD bn"], ["Gross margin", c.gm_pct + "%"], ["EV/EBITDA", c.ev_ebitda + "x"], ["P/E", c.pe + "x"], ["Revenue growth", c.rev_growth_pct + "%"], ["AI exposure", c.ai_exposure_pct + "%"]]
        .map(function (kv) { return '<div class="kv"><span>' + kv[0] + ' <span class="note">illus.</span></span><span class="mono">' + kv[1] + "</span></div>"; }).join("") +
      "<h4>Suppliers (" + L.suppliers.length + ")</h4>" + list(L.suppliers, link) + "<h4>Customers (" + L.customers.length + ")</h4>" + list(L.customers, link) +
      "<h4>Demo holdings exposed</h4>" +
      (L.direct.length + L.sameNode.length + L.oneLink.length ? "" : '<p class="note">No mapped holding is exposed to this company.</p>') +
      (L.direct.length ? '<div class="note">Direct</div>' + list(L.direct, function (x) { return '<span class="mono">' + esc(h().sym(x.symbol)) + "</span> · " + x.pct + "% in " + esc(n.name); }) : "") +
      (L.sameNode.length ? '<div class="note">Same node</div>' + list(L.sameNode, function (x) { return '<span class="mono">' + esc(h().sym(x.symbol)) + "</span> · " + x.pct + "% in " + esc(n.name); }) : "") +
      (L.oneLink.length ? '<div class="note">One link away</div>' + list(L.oneLink, function (x) { return '<span class="mono">' + esc(h().sym(x.symbol)) + "</span> via " + x.via.map(function (v) { return esc(v.symbol) + " (" + v.rel + ")"; }).join(", "); }) : "");
    if (d.res && d.res[c.symbol] && d.res[c.symbol].hit) {
      const r = d.res[c.symbol];
      html += "<h4>Current shock: " + esc(d.shock.name) + "</h4>" + '<div class="kv"><span>ΔRev</span><span class="mono ' + toneOf(r.d_rev) + '">' + signed(r.d_rev, 2, "%") + '</span></div><div class="kv"><span>ΔGP</span><span class="mono ' + toneOf(r.d_gp_pct) + '">' + signed(r.d_gp_pct, 2, "%") + "</span></div>" +
        '<button class="btn" data-vc="show-paths" data-sym="' + esc(c.symbol) + '">Show paths</button><p class="note">' + esc(VC_DISCLAIMER) + "</p>";
    }
    el.innerHTML = html; el.hidden = false;
  }

  /* ===== SECTION: PROFIT POOLS ===== */
  function tabPools(d) {
    const st = d.stats, N = function (id) { return st.nodes.find(function (x) { return x.id === id; }); };
    const top2 = st.nodes.slice().sort(function (a, b) { return b.gpShare - a.gpShare; }).slice(0, 2);
    const odm = N("odm");
    const headline = esc(top2[0].name) + " and " + esc(top2[1].name) + " hold " + (top2[0].gpShare + top2[1].gpShare).toFixed(1) + "% of the chain's gross profit; server ODMs have " + odm.revShare.toFixed(1) + "% of the AI revenue but " + odm.gpShare.toFixed(1) + "% of the profit.";
    const mekko = '<div class="vc-mekko">' + st.nodes.map(function (n, i) {
      const tip = n.name + ": AI revenue USD " + n.aiRev.toFixed(1) + "bn (" + n.revShare.toFixed(1) + "% share) · GM " + n.gm.toFixed(1) + "% · GP USD " + n.gp.toFixed(1) + "bn (" + n.gpShare.toFixed(1) + "% share)";
      return '<div class="vc-col" style="flex:' + n.revShare + ' 1 0" title="' + esc(tip) + '"><div class="vc-bar" style="height:' + n.gm + "%;background:" + CHART_COLORS[i % CHART_COLORS.length] + '">' +
        (n.revShare >= 5 ? '<span class="vc-bar-label">' + esc(n.name) + "<br>GM " + n.gm.toFixed(1) + "%</span>" : "") + "</div></div>";
    }).join("") + '</div><div class="vc-legend">' + st.nodes.map(function (n, i) { return '<span><i style="background:' + CHART_COLORS[i % CHART_COLORS.length] + '"></i>' + esc(n.name) + " " + n.revShare.toFixed(1) + "%</span>"; }).join("") + "</div>";
    const rows = st.nodes.map(function (n) {
      return '<tr><td class="l">' + esc(n.name) + "</td><td>" + n.n + "</td><td>" + n.aiRev.toFixed(1) + "</td><td>" + n.revShare.toFixed(1) + "%</td><td>" + n.gm.toFixed(1) + "%</td><td>" + n.gp.toFixed(1) + "</td><td>" + n.gpShare.toFixed(1) + "%</td><td>" + n.growth.toFixed(1) + "%</td><td>" + n.evEbitda + "x</td><td>" + n.pe + "x</td></tr>";
    }).join("");
    return '<div class="panel">' + tabHead("Profit pools – where the gross profit sits") + '<p class="vc-headline">' + headline + "</p>" + mekko +
      '<p class="note">Width = share of AI-chain revenue · height = gross margin · area = gross profit. Nodes under 2% get a 4px minimum width; hover for numbers. AI revenue = revenue × AI exposure.</p></div>' +
      '<div class="grid"><div class="panel s12">' + tabHead("Node table") + '<div class="table-wrap"><table><thead><tr><th class="l">Node</th><th>Cos</th><th>AI rev USD bn</th><th>Rev share</th><th>GM</th><th>GP USD bn</th><th>GP share</th><th>Wtd growth</th><th>Med EV/EBITDA</th><th>Med P/E</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr class="total"><td class="l">TOTAL</td><td>' + VC_DATA.companies.length + "</td><td>" + st.totalAiRev.toFixed(1) + "</td><td>100.0%</td><td>" + (st.totalGp / st.totalAiRev * 100).toFixed(1) + "%</td><td>" + st.totalGp.toFixed(1) + "</td><td>100.0%</td><td></td><td></td><td></td></tr></tfoot></table></div></div>" +
      '<div class="panel s12">' + tabHead("Revenue share vs GP share") + '<div class="chart-box vc-chart-tall"><canvas id="vc-chart-pools"></canvas></div><p class="note">Amber = AI revenue share, teal = gross profit share.</p></div></div>';
  }

  /* ===== SECTION: EXPOSURE ===== */
  function settingsHtml(s) {
    const f = [["vc_node_limit_pct", "Node limit % of chain (FLAG)", "0.1"], ["vc_node_watch_pct", "Node watch % of chain", "0.1"], ["vc_max_hops", "Shock max hops (1–5)", "1"], ["vc_equity_elasticity", "Equity elasticity", "0.1"]];
    return '<div class="form-grid">' + f.map(function (x) { return '<label class="field"><span class="label">' + x[1] + '</span><input class="num" type="number" min="0" step="' + x[2] + '" data-vc="setting" data-k="' + x[0] + '" value="' + s[x[0]] + '"></label>'; }).join("") + "</div>";
  }
  function tabExposure(d) {
    const e = d.exp, big = e.nodes[0];
    const kpi = function (l, b, s, cls, fk) { return '<div class="panel s3"><div class="label">' + l + '</div><div class="vc-big mono ' + (cls || "") + '"' + (fk || "") + ">" + b + '</div><div class="note mono">' + s + "</div></div>"; };
    let html = '<div class="panel">' + tabHead("Portfolio exposure by value-chain node", '<span class="note">' + (vs.ctx.mode === "demo" ? "Demo portfolio" : "My Portfolio") + "</span>") + '<div class="grid">' +
      kpi("AI-chain exposure HKD", hkd(e.chain), e.chainPct.toFixed(1) + "% of " + hkd(e.total) + " portfolio", "", ' data-fk="chain" data-fv="' + e.chain + '"') +
      kpi("Largest node", big ? esc(big.name) : "—", big ? big.pctChain.toFixed(1) + "% of chain · " + big.status : "No mapped holdings", big && big.status !== "OK" ? "amber" : "") +
      kpi("Mapped holdings", e.holdings.length + " / " + d.rows.length, "rest is outside the chain") +
      kpi("Limits", d.s.vc_node_limit_pct + "% / " + d.s.vc_node_watch_pct + "%", "FLAG / WATCH on % of chain") + "</div>";
    html += e.nodes.length ? '<div class="table-wrap"><table><thead><tr><th class="l">Node</th><th>HKD</th><th>% of portfolio</th><th>% of chain</th><th class="l">Status</th></tr></thead><tbody>' +
      e.nodes.map(function (n) { return '<tr><td class="l">' + esc(n.name) + "</td><td>" + hkd(n.hkd) + "</td><td>" + n.pctPortfolio.toFixed(1) + "%</td><td>" + n.pctChain.toFixed(1) + '%</td><td class="l">' + h().badge(n.status) + "</td></tr>"; }).join("") +
      '</tbody><tfoot><tr class="total"><td class="l">AI CHAIN</td><td>' + hkd(e.chain) + "</td><td>" + e.chainPct.toFixed(1) + "%</td><td>100.0%</td><td></td></tr></tfoot></table></div>" : '<div class="empty">No holdings mapped yet. Add exposures below.</div>';
    html += "</div>";
    html += '<div class="grid"><div class="panel s8">' + tabHead("% of portfolio by node") + '<div class="chart-box vc-chart-tall"><canvas id="vc-chart-nodes"></canvas></div></div>' +
      '<div class="panel s4">' + tabHead("In chain vs outside") + '<div class="chart-box vc-chart-tall"><canvas id="vc-chart-inout"></canvas></div><p class="note mono">In chain ' + hkd(e.chain) + " · outside " + hkd(e.outside) + "</p></div></div>";
    html += '<div class="grid"><div class="panel s8">' + tabHead("Holding → node mapping (editable)", '<button class="btn" data-vc="hx-reset">' + (vs.ctx.mode === "demo" ? "Restore demo mapping" : "Clear mapping") + "</button>") + mappingTable(d) + "</div>" +
      '<div class="panel s4">' + tabHead("VC rules") + settingsHtml(d.s) + '<p class="note">Also on Rules &amp; Settings. Limits apply to each node\'s share of AI-chain exposure.</p></div></div>';
    return html;
  }
  function mappingTable(d) {
    const map = {}; d.hx.forEach(function (x) { map[x.symbol] = x; });
    const nodeSel = function (sym, i, v) { return '<select data-vc="hx-node" data-sym="' + esc(sym) + '" data-i="' + i + '">' + NODES.map(function (n) { return '<option value="' + n.id + '"' + (n.id === v ? " selected" : "") + ">" + esc(n.name) + "</option>"; }).join("") + "</select>"; };
    const coSel = function (sym, i, node, v) {
      return '<select data-vc="hx-company" data-sym="' + esc(sym) + '" data-i="' + i + '"><option value="">(node average)</option>' + VC_DATA.companies.filter(function (c) { return c.node === node; })
        .map(function (c) { return '<option value="' + esc(c.symbol) + '"' + (c.symbol === v ? " selected" : "") + ">" + esc(c.symbol) + "</option>"; }).join("") + "</select>";
    };
    const rows = d.rows.map(function (r) {
      const ex = map[r.symbol] ? map[r.symbol].exposures : [];
      const sum = ex.reduce(function (a, e) { return a + (Number(e.pct) || 0); }, 0);
      const lines = ex.map(function (e, i) {
        return '<div class="vc-hx-line">' + nodeSel(r.symbol, i, e.node) + '<input class="num" type="number" step="any" data-vc="hx-pct" data-sym="' + esc(r.symbol) + '" data-i="' + i + '" value="' + e.pct + '">%' + coSel(r.symbol, i, e.node, e.company) +
          '<button class="icon-btn" data-vc="hx-del" data-sym="' + esc(r.symbol) + '" data-i="' + i + '" aria-label="Remove">×</button></div>';
      }).join("");
      return '<tr><td class="tk">' + esc(h().sym(r.symbol)) + "</td><td>" + hkd(r.valueHKD) + '</td><td class="l">' + (lines || '<span class="note">Outside chain</span>') +
        '</td><td class="' + (sum > 100 ? "amber" : "") + '">' + sum + '%</td><td><button class="btn" data-vc="hx-add" data-sym="' + esc(r.symbol) + '">+ node</button></td></tr>';
    }).join("");
    const orphans = d.hx.filter(function (x) { return !d.rows.some(function (r) { return r.symbol === x.symbol; }); });
    return (rows ? '<div class="table-wrap"><table><thead><tr><th class="l">Holding</th><th>Value HKD</th><th class="l">Node · % · company</th><th>Σ</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<div class="empty">No positions in this portfolio yet.</div>') +
      (orphans.length ? '<p class="err">Mapped but not in this portfolio: ' + orphans.map(function (o) { return esc(o.symbol) + ' <a href="#" data-vc="hx-drop" data-sym="' + esc(o.symbol) + '">remove</a>'; }).join(", ") + "</p>" : "") +
      '<p class="note">Mapping a holding to a company uses that company\'s shock result; "node average" uses the node\'s AI-revenue-weighted average. Edits save in this browser (' + esc(exposureKey()) + ").</p>";
  }
  function editExposure(fn) {
    const hx = getExposure(); fn(hx); setExposure(hx); render();
  }
  function findH(hx, sym, create) {
    let x = hx.find(function (y) { return y.symbol === sym; });
    if (!x && create) { x = { symbol: sym, exposures: [] }; hx.push(x); }
    return x;
  }

  /* ===== SECTION: SHOCK SIMULATOR ===== */
  function tabShock(d) {
    const c = vs.custom, isC = vs.shockId === "custom";
    const opts = VC_DATA.shocks.map(function (s) { return '<option value="' + s.id + '"' + (s.id === vs.shockId ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + '<option value="custom"' + (isC ? " selected" : "") + ">Custom shock…</option>";
    const targets = NODES.map(function (n) { return '<option value="node:' + n.id + '"' + ("node:" + n.id === c.target ? " selected" : "") + ">Node: " + esc(n.name) + "</option>"; }).join("") +
      VC_DATA.companies.map(function (co) { return '<option value="' + esc(co.symbol) + '"' + (co.symbol === c.target ? " selected" : "") + ">" + esc(co.symbol + " " + co.name) + "</option>"; }).join("");
    let html = '<div class="panel">' + tabHead("Shock simulator", '<span class="vc-disclaimer">Illustrative linear model. Not a forecast.</span>') +
      '<div class="form-grid"><label class="field"><span class="label">Scenario</span><select data-vc="shock-preset">' + opts + "</select></label>" +
      (isC ? '<label class="field"><span class="label">Target</span><select data-vc="custom" data-k="target">' + targets + "</select></label>" +
        '<label class="field"><span class="label">Type</span><select data-vc="custom" data-k="type">' + VC_SHOCK_TYPES.map(function (t) { return "<option" + (t === c.type ? " selected" : "") + ">" + t + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span class="label">Pct (−50 to +50)</span><input class="num" type="number" min="-50" max="50" step="any" data-vc="custom" data-k="pct" value="' + c.pct + '"></label>' +
        '<label class="field"><span class="label">Pass-through (0–1)</span><input class="num" type="number" min="0" max="1" step="0.1" data-vc="custom" data-k="pass_through" value="' + c.pass_through + '"></label>' +
        '<label class="field"><span class="label">Criticality ×(1–5)</span><input class="num" type="number" min="1" max="5" step="0.5" data-vc="custom" data-k="crit_mult" value="' + c.crit_mult + '"></label>' : "") +
      '</div><div class="row-actions"><button class="btn primary" data-vc="run">Run</button><span class="note">' + esc(d.shock.items.map(itemText).join(" · ")) + " · pass-through " + d.shock.pass_through + " · crit ×" + d.shock.crit_mult +
      " · max hops " + d.s.vc_max_hops + " · elasticity " + d.s.vc_equity_elasticity + "</span>" + (d.shockErrors.length ? '<span class="err">' + esc(d.shockErrors.join("; ")) + "</span>" : "") + "</div></div>";
    if (!d.res) return html + '<div class="panel empty">Fix the inputs above, then click Run.</div>';
    if (!vs.ran) return html + '<div class="panel empty">Pick a scenario (or build a custom shock) and click Run.</div>';
    const im = d.impact, L = im.largest;
    const kpi = function (l, b, s, cls, fk) { return '<div class="panel s3"><div class="label">' + l + '</div><div class="vc-big mono ' + (cls || "") + '"' + (fk || "") + ">" + b + '</div><div class="note mono">' + s + "</div></div>"; };
    html += '<div class="grid">' + kpi("Portfolio impact HKD", hkdS(im.total), signed(im.totalPct, 2, "%") + " of portfolio", toneOf(im.total, 0), ' data-fk="impact" data-fv="' + im.total + '"') +
      kpi("Companies hit", d.ranked.length + " / " + VC_DATA.companies.length, "with a non-zero change") +
      kpi("Largest holding hit", L ? esc(h().sym(L.symbol)) : "—", L ? hkdS(L.hkd) + " HKD (" + signed(L.impactPct, 2, "%") + ")" : "No mapped holding moves", L ? toneOf(L.hkd, 0) : "") +
      kpi("Scenario", esc(d.shock.name), "deterministic · linear") + "</div>";
    const sel = vs.pathSym && d.res[vs.pathSym] && d.res[vs.pathSym].hit ? vs.pathSym : (d.ranked[0] ? d.ranked[0].symbol : null);
    html += '<div class="grid"><div class="panel s6">' + tabHead("Companies, ranked by ΔGP %") + '<div class="table-wrap vc-scroll"><table><thead><tr><th class="l">Ticker</th><th class="l">Name</th><th class="l">Node</th><th>ΔRev %</th><th>ΔGM pp</th><th>ΔGP %</th><th></th></tr></thead><tbody>' +
      (d.ranked.map(function (r) {
        return '<tr class="click' + (r.symbol === sel ? " vc-selrow" : "") + '" data-vc="pick" data-sym="' + esc(r.symbol) + '"><td class="tk">' + esc(h().sym(r.symbol)) + '</td><td class="l name">' + esc(r.name) + '</td><td class="l note">' + esc(NODE[r.node].name) +
          '</td><td class="' + toneOf(r.d_rev) + '">' + signed(r.d_rev, 2) + '</td><td class="' + toneOf(r.d_gm_pp) + '">' + signed(r.d_gm_pp, 2) + '</td><td class="' + toneOf(r.d_gp_pct) + '">' + signed(r.d_gp_pct, 2) + '</td><td class="' + toneOf(r.d_gp_pct) + ' noarrow">' + (r.d_gp_pct > 0 ? "▲" : r.d_gp_pct < 0 ? "▼" : "") + "</td></tr>";
      }).join("") || '<tr><td colspan="7" class="empty">No company moves.</td></tr>') + "</tbody></table></div></div>" +
      '<div class="panel s6">' + tabHead("Holdings impact") + (im.rows.length ? '<div class="table-wrap vc-scroll"><table><thead><tr><th class="l">Holding</th><th>Value HKD</th><th>Exposure</th><th>Impact %</th><th>Impact HKD</th></tr></thead><tbody>' +
        im.rows.map(function (r) { return '<tr><td class="tk">' + esc(h().sym(r.symbol)) + "</td><td>" + hkd(r.valueHKD) + "</td><td>" + r.exposurePct + '%</td><td class="' + toneOf(r.impactPct) + '">' + signed(r.impactPct, 2, "%") + '</td><td class="' + toneOf(r.hkd, 0) + '">' + hkdS(r.hkd) + "</td></tr>"; }).join("") +
        '</tbody><tfoot><tr class="total"><td class="tk">TOTAL</td><td>' + hkd(d.total) + '</td><td></td><td class="' + toneOf(im.totalPct) + '">' + signed(im.totalPct, 2, "%") + '</td><td class="' + toneOf(im.total, 0) + '">' + hkdS(im.total) + "</td></tr></tfoot></table></div>"
        : '<div class="empty">No holdings mapped, so the portfolio impact is zero. Map holdings on the Exposure tab.</div>') +
      '<p class="note">Impact % = elasticity × Σ(exposure × ΔGP % of the mapped company, or the node\'s AI-revenue-weighted average). Impact HKD = value × impact %.</p></div></div>';
    html += '<div class="panel">' + tabHead("Chain map – ΔGP % under this shock", '<span class="note">green = up · red = down</span>') + chainMap(function (co) {
      const x = d.res[co.symbol].d_gp_pct, a = 0.15 + 0.65 * Math.min(Math.abs(x) / 10, 1);
      return Math.abs(x) < 0.005 ? { bg: "#161C24", fg: "#8A94A6" } : { bg: x > 0 ? "rgba(0,193,118," + a + ")" : "rgba(255,77,79," + a + ")", fg: "#E6E6E6" };
    }, function (co) { return signed(d.res[co.symbol].d_gp_pct, 1, "%"); }) + "</div>";
    html += howPanel(d, sel);
    return html;
  }
  function pathText(p) {
    const o = p.origin, head = o.symbol + " " + o.type + " " + signed(o.pct, 0, "%");
    return head + p.steps.map(function (s) { return " → " + s.symbol + " (w " + s.w + (s.k !== undefined ? ", k " + s.k.toFixed(4) : "") + (s.m !== undefined && s.m !== 1 ? ", m " + s.m : "") + ")"; }).join("");
  }
  function howPanel(d, sel) {
    const r = sel ? d.res[sel] : null, top = sel ? VCCalc.topPaths(d.res, sel, 10) : [];
    const options = d.ranked.map(function (x) { return '<option value="' + esc(x.symbol) + '"' + (x.symbol === sel ? " selected" : "") + ">" + esc(x.symbol + " " + x.name) + "</option>"; }).join("");
    return '<div class="panel" id="vc-how">' + tabHead("How this is calculated", sel ? '<select data-vc="pick-select">' + options + "</select>" : "") +
      '<p class="vc-disclaimer">' + esc(VC_DISCLAIMER) + "</p>" +
      '<ol class="steps"><li>k(s→c) = w × rev_s ÷ rev_c (the customer\'s spend with the supplier as a share of its revenue); a = AI exposure ÷ 100. All Δ are % of the company\'s own revenue.</li>' +
      "<li>Volume x: target ΔRev = x·a, ΔGP = ΔRev × GM; each supplier gets ΔRev = w × buyer's ΔRev, repeated upstream.</li>" +
      "<li>Demand d: target unchanged (it is the buyer's spend); suppliers get ΔRev = w × d, then upstream as volume.</li>" +
      "<li>Price p: target ΔRev = ΔGP = p·a; each customer's cost rises h = p·k: ΔRev += pass-through·h, ΔGP −= (1 − pass-through)·h; the passed-on part repeats downstream.</li>" +
      "<li>Supply q: target ΔRev = −q·a; customers lose crit ×·q·k at hop 1, then 1:1 further down; lost volume moves GP at the customer's margin.</li>" +
      "<li>ΔGP % = ΔGP ÷ GM; new GM = (GM + ΔGP) ÷ (1 + ΔRev/100); ΔGM pp = new GM − GM. Every path is summed, up to " + d.s.vc_max_hops + " hops; links have no loops.</li></ol>" +
      (r ? "<h4 class=\"label\">Top " + top.length + " of " + r.paths.length + " paths for " + esc(sel) + "</h4><ol class=\"steps\">" + top.map(function (p) {
        return "<li>" + esc(pathText(p)) + ' = ΔRev <span class="' + toneOf(p.d_rev) + '">' + signed(p.d_rev, 2, "%") + '</span> · ΔGP <span class="' + toneOf(p.d_gp_pct) + '">' + signed(p.d_gp_pct, 2, "%") + "</span></li>";
      }).join("") + '</ol><p class="mono">Sum of all ' + r.paths.length + " paths: ΔRev " + signed(r.d_rev, 2, "%") + " · ΔGP " + signed(r.d_gp_pct, 2, "%") + " · ΔGM " + signed(r.d_gm_pp, 2, "pp") + "</p>" : '<p class="note">No company moves under this shock.</p>') + "</div>";
  }

  /* ===== SECTION: CHARTS ===== */
  function drawCharts(d) {
    if (typeof Chart === "undefined") {
      const loading = vs.ctx.chartState === "loading"; // v3: Chart.js loads async; app.js re-renders when it arrives
      document.querySelectorAll("#page-valuechain canvas").forEach(function (cv) { cv.parentNode.innerHTML = loading ? '<div class="skel chart-skel" title="Loading chart"></div>' : '<div class="chart-fallback state error">Chart unavailable – Chart.js didn\'t load (offline?). The tables show the exact figures.</div>'; });
      return;
    }
    const base = { responsive: true, maintainAspectRatio: false, animation: false };
    const tip = { bodyFont: { family: "JetBrains Mono" }, backgroundColor: "#0A0D10", borderColor: "#1F2630", borderWidth: 1 };
    const axes = function () { return { x: { grid: { color: "#1F2630" }, ticks: { font: { family: "JetBrains Mono", size: 10 }, callback: function (v) { return v + "%"; } } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } }; };
    const pools = $("vc-chart-pools");
    if (pools) vs.charts.pools = new Chart(pools, { type: "bar", data: { labels: d.stats.nodes.map(function (n) { return n.name; }),
      datasets: [{ label: "AI revenue share", data: d.stats.nodes.map(function (n) { return n.revShare; }), backgroundColor: "#FFB000" }, { label: "GP share", data: d.stats.nodes.map(function (n) { return n.gpShare; }), backgroundColor: "#2EC4B6" }] },
      options: Object.assign({}, base, { indexAxis: "y", scales: axes(), plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: Object.assign({ callbacks: { label: function (c) { return " " + c.dataset.label + ": " + c.raw.toFixed(1) + "%"; } } }, tip) } }) });
    const nodes = $("vc-chart-nodes");
    if (nodes) {
      const vals = NODES.map(function (n) { const x = d.exp.nodes.find(function (y) { return y.node === n.id; }); return x ? x.pctPortfolio : 0; });
      vs.charts.nodes = new Chart(nodes, { type: "bar", data: { labels: NODES.map(function (n) { return n.name; }), datasets: [{ label: "% of portfolio", data: vals, backgroundColor: "#2EC4B6" }] },
        options: Object.assign({}, base, { indexAxis: "y", scales: axes(), plugins: { legend: { display: false }, tooltip: Object.assign({ callbacks: { label: function (c) { return " " + c.raw.toFixed(1) + "% of portfolio"; } } }, tip) } }) });
    }
    const io = $("vc-chart-inout");
    if (io) {
      if (!(d.exp.total > 0)) { io.parentNode.innerHTML = '<div class="chart-fallback">No priced positions.</div>'; return; }
      vs.charts.inout = new Chart(io, { type: "doughnut", data: { labels: ["In AI chain", "Outside chain"], datasets: [{ data: [d.exp.chain, d.exp.outside], backgroundColor: ["#FFB000", "#8A94A6"], borderColor: "#11161C", borderWidth: 2 }] },
        options: Object.assign({}, base, { cutout: "58%", plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: Object.assign({ callbacks: { label: function (c) { return " " + c.label + ": HKD " + hkd(c.raw, 2) + " (" + (c.raw / d.exp.total * 100).toFixed(1) + "%)"; } } }, tip) } }),
        plugins: [{ id: "vcCentre", afterDatasetsDraw: function (ch) {
          const m = ch.getDatasetMeta(0).data[0]; if (!m) return; const x = ch.ctx; x.save(); x.textAlign = "center"; x.textBaseline = "middle";
          x.fillStyle = "#E6E6E6"; x.font = "500 13px 'JetBrains Mono', monospace"; x.fillText(d.exp.chainPct.toFixed(1) + "%", m.x, m.y - 6);
          x.fillStyle = "#8A94A6"; x.font = "10px Inter, sans-serif"; x.fillText("in chain", m.x, m.y + 9); x.restore();
        } }] });
    }
  }

  /* ===== SECTION: HOVER HIGHLIGHT (suppliers teal, customers amber) ===== */
  function clearHover() { document.querySelectorAll(".vc-chip.vc-sup, .vc-chip.vc-cus, .vc-chip.vc-self").forEach(function (x) { x.classList.remove("vc-sup", "vc-cus", "vc-self"); }); }
  function hover(chip) {
    clearHover(); const sym = chip.getAttribute("data-sym"), map = chip.closest(".vc-map"); chip.classList.add("vc-self");
    VC_DATA.edges.forEach(function (e) {
      const other = e.to === sym ? e.from : e.from === sym ? e.to : null; if (!other) return;
      const el = map.querySelector('.vc-chip[data-sym="' + other + '"]'); if (el) el.classList.add(e.to === sym ? "vc-sup" : "vc-cus");
    });
  }

  /* ===== SECTION: SETTINGS (shared by the Exposure tab and Rules & Settings) ===== */
  function updateSetting(k, raw) {
    const s = getSettings(), v = Number(raw);
    const ok = isFinite(v) && v >= 0 && (k !== "vc_max_hops" || (v >= 1 && v <= 5 && Math.round(v) === v)) && (k !== "vc_equity_elasticity" || v <= 5);
    if (!ok) { toast(k === "vc_max_hops" ? "Max hops must be a whole number from 1 to 5." : "Please enter a valid number.", true); }
    else { s[k] = v; save(VC_STORAGE_KEYS.settings, s); }
    if (vs.ctx && vs.ctx.el.offsetParent !== null) render();
    const box = $("vc-settings-box"); if (box) box.innerHTML = settingsHtml(getSettings());
  }
  function renderSettings(el) {
    el.innerHTML = '<div class="panel" style="margin-top:8px"><div class="panel-head"><span class="panel-title">Value chain rules</span>' + '<span class="badge vc-illus">ILLUSTRATIVE DATA</span></div><div id="vc-settings-box">' + settingsHtml(getSettings()) +
      '</div><p class="note">Node limits apply to each node\'s share of AI-chain exposure. Reset demo data also restores these defaults (40 / 30 / 3 / 1.0) and the demo holding→node mapping; Clear My Portfolio clears its mapping.</p></div>';
  }

  /* ===== SECTION: EVENT WIRING (data-vc attributes; app.js ignores these) ===== */
  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-vc]"); if (!el) return;
    const a = el.getAttribute("data-vc"), sym = el.getAttribute("data-sym"), i = +el.getAttribute("data-i");
    if (["metric", "setting", "hx-node", "hx-pct", "hx-company", "shock-preset", "custom", "pick-select"].indexOf(a) >= 0) return;
    if (el.tagName === "A") e.preventDefault();
    if (a === "tab") { vs.tab = el.getAttribute("data-tab"); render(); }
    else if (a === "chip" || a === "open") { vs.drawer = sym; renderDrawer(derive()); }
    else if (a === "close-drawer") { vs.drawer = null; ensureDrawer().hidden = true; }
    else if (a === "goto-vc-checks") { const p = $("vc-checks-panel"); if (p) p.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (a === "run") { vs.ran = true; render(); }
    else if (a === "pick") { vs.pathSym = sym; render(); const p = $("vc-how"); if (p) p.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (a === "show-paths") { vs.pathSym = sym; vs.tab = "shock"; render(); const p = $("vc-how"); if (p) p.scrollIntoView({ block: "start" }); }
    else if (a === "hx-add") editExposure(function (hx) {
      const x = findH(hx, sym, true), used = x.exposures.map(function (y) { return y.node; });
      const n = NODES.find(function (nd) { return used.indexOf(nd.id) < 0; }) || NODES[0]; x.exposures.push({ node: n.id, pct: 10, company: null });
    });
    else if (a === "hx-del") editExposure(function (hx) { const x = findH(hx, sym); if (x) x.exposures.splice(i, 1); });
    else if (a === "hx-drop") editExposure(function (hx) { const x = findH(hx, sym); if (x) x.exposures = []; });
    else if (a === "hx-reset") {
      if (!window.confirm(vs.ctx.mode === "demo" ? "Restore the demo holding→node mapping?" : "Clear the My Portfolio value-chain mapping?")) return;
      remove(exposureKey()); render(); toast("Mapping reset.");
    }
  });
  document.addEventListener("change", function (e) {
    const el = e.target, a = el.getAttribute && el.getAttribute("data-vc"); if (!a) return;
    const sym = el.getAttribute("data-sym"), i = +el.getAttribute("data-i");
    if (a === "metric") { vs.metric = el.value; render(); }
    else if (a === "setting") updateSetting(el.getAttribute("data-k"), el.value);
    else if (a === "shock-preset") { vs.shockId = el.value; vs.pathSym = null; vs.ran = false; render(); }
    else if (a === "custom") { const k = el.getAttribute("data-k"); vs.custom[k] = k === "target" || k === "type" ? el.value : el.value === "" ? NaN : Number(el.value); vs.ran = false; render(); }
    else if (a === "pick-select") { vs.pathSym = el.value; render(); }
    else if (a === "hx-node") editExposure(function (hx) { const ex = findH(hx, sym).exposures[i]; ex.node = el.value; if (ex.company && C[ex.company].node !== ex.node) ex.company = null; });
    else if (a === "hx-pct") editExposure(function (hx) { findH(hx, sym).exposures[i].pct = el.value === "" ? 0 : Number(el.value); });
    else if (a === "hx-company") editExposure(function (hx) { findH(hx, sym).exposures[i].company = el.value || null; });
  });
  document.addEventListener("mouseover", function (e) { const chip = e.target.closest && e.target.closest(".vc-chip"); if (chip) hover(chip); });
  document.addEventListener("mouseout", function (e) { const chip = e.target.closest && e.target.closest(".vc-chip"); if (chip && !(e.relatedTarget && chip.contains(e.relatedTarget))) clearHover(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("vc-drawer")) { vs.drawer = null; $("vc-drawer").hidden = true; } });
  window.addEventListener("hashchange", function () { if (location.hash !== "#valuechain" && $("vc-drawer")) $("vc-drawer").hidden = true; });

  /* ===== SECTION: SUPPLY CHAIN TAB HOOK (vc-splc.js) ===== */
  function splcApi() {
    return { esc: esc, fmt: h().fmt, fmtS: h().fmtS, sym: h().sym, badge: h().badge, signed: signed, toneOf: toneOf, illus: illus, tabHead: tabHead };
  }
  if (typeof VCSplc !== "undefined") VCSplc.setRerender(function () { if (vs.ctx && vs.tab === "splc") render(); });

  /* ===== SECTION: MODULE REGISTRATION (used by app.js) ===== */
  window.WT_MODULES = window.WT_MODULES || [];
  window.WT_MODULES.push({
    id: "valuechain", render: render, renderSettings: renderSettings, status: status,
    onResetDemo: function () { remove(VC_STORAGE_KEYS.exposureDemo); remove(VC_STORAGE_KEYS.settings); vs.notices = []; },
    onClearMy: function () { remove(VC_STORAGE_KEYS.exposureMy); },
    command: function (op, arg) { // state only; cmd.js then routes to #valuechain, which renders
      const okTab = TABS.some(function (t) { return t[0] === arg; }), okShock = VC_DATA.shocks.some(function (x) { return x.id === arg; });
      if (op === "tab" && okTab) vs.tab = arg;
      else if (op === "shock" && okShock) { vs.tab = "shock"; vs.shockId = arg; vs.pathSym = null; vs.ran = true; }
      else if (op === "paths" && C[arg]) { vs.tab = "shock"; vs.ran = true; vs.pathSym = arg; }
      else if (op === "focus" && C[arg] && typeof VCSplc !== "undefined") { vs.tab = "splc"; VCSplc.setFocal(arg); }
      else if (op === "overlay" && typeof VCSplc !== "undefined") { vs.tab = "splc"; VCSplc.state.overlay = okShock ? arg : "none"; }
      else if (op === "drawer" && C[arg]) vs.drawer = arg;
      else if (op === "close-drawer") { vs.drawer = null; if ($("vc-drawer")) $("vc-drawer").hidden = true; }
      else return false;
      return true;
    },
    state: function () { return { tab: vs.tab, shockId: vs.shockId, ran: vs.ran }; },
    isCompany: function (s) { return !!C[s]; }
  });
})();

// END OF FILE: vc-app.js
