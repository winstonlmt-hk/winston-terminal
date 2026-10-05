// vc-splc.js – Winston Terminal v4: "Supply Chain" tab of the Value Chain Explorer (Bloomberg SPLC-style focal map).
// Focal company in the centre, suppliers left, customers right; link width = illustrative $ flow; click a node to re-centre.
// Rendering and events only (plain SVG, no library). All maths comes from VCCalc (vc-calc.js). Illustrative data, not a forecast.
// vc-app.js calls VCSplc.html(d, ctx, api) inside its render() and gives VCSplc a re-render callback.
// Flow-sanity panel shows "All flows within COGS / revenue" when VCCalc.flowChecks returns nothing (after the 5 Oct rebalance).
// Phase 2: setFocal(sym) lets the command line ("NVDA VC") centre the map without a click (state only, no re-render).

const VCSplc = (function () {
  "use strict";

  /* ===== SECTION: STATE (session only, not saved) ===== */
  const st = { focal: "NVDA.US", trail: ["NVDA.US"], hops: 1, group: "rel", overlay: "none" };
  let rerender = function () {};
  const C = {}; VC_DATA.companies.forEach(function (c) { C[c.symbol] = c; });
  const NODE = {}; VC_DATA.nodes.forEach(function (n) { NODE[n.id] = n; });
  const FRAMING = {
    capex_cut: "Demand shock: hyperscalers spend 20% less on AI servers. The cut travels upstream – ODMs, chips, memory, foundry, tools.",
    export_ctrl: "Export-control shock, framed like a tariff: named US chip and China cloud volumes fall, China foundries gain; the change ripples up to their suppliers.",
    tsmc_price: "Tariff-style cost shock: TSMC wafers cost 10% more. Half is passed on; the rest squeezes customers' margins downstream.",
    hbm_short: "Supply shock: HBM output falls and prices rise; customers lose volume (criticality ×3) and pay more."
  };

  /* ===== SECTION: SMALL HELPERS (display only) ===== */
  let A = null; // api from vc-app.js: esc, fmt, sym, badge, signed, toneOf, illus, tabHead
  function bn(x) { return "$" + (x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(2)) + "bn"; }
  function pc(x) { return x === null || !isFinite(x) ? "—" : x.toFixed(1) + "%"; }
  function shortName(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function heat(v, max) { // red/green fill by impact, neutral when ~0
    if (!isFinite(v) || Math.abs(v) < 1e-9 || !(max > 0)) return null;
    const a = 0.18 + 0.62 * Math.min(1, Math.abs(v) / max);
    return v < 0 ? "rgba(255,77,79," + a.toFixed(2) + ")" : "rgba(0,193,118," + a.toFixed(2) + ")";
  }
  function heldSet(d) {
    const s = {}; d.hx.forEach(function (h) { if (d.holdingSymbols.indexOf(h.symbol) < 0) return; s[h.symbol] = 1; h.exposures.forEach(function (e) { if (e.company) s[e.company] = 1; }); });
    return s;
  }

  /* ===== SECTION: LAYOUT (columns of boxes, optional region groups) ===== */
  const ROW = 46, BOX = 38, GRP = 20, TOP = 34;
  function column(links, key, group) { // one box per company (a tier-2 company can have several links)
    const by = {}, list = [];
    links.forEach(function (l) { const k = l[key]; if (!by[k]) { by[k] = { sym: k, usd: 0, links: [] }; list.push(by[k]); } by[k].usd += l.usd; by[k].links.push(l); });
    list.sort(function (a, b) { const ca = C[a.sym].country, cb = C[b.sym].country; return group === "geo" && ca !== cb ? (ca < cb ? -1 : 1) : b.usd - a.usd || (a.sym < b.sym ? -1 : 1); });
    const items = []; let y = TOP, last = null;
    list.forEach(function (b) {
      const ctry = C[b.sym].country;
      if (group === "geo" && ctry !== last) {
        const tot = list.filter(function (x) { return C[x.sym].country === ctry; }).reduce(function (t, x) { return t + x.usd; }, 0);
        items.push({ hdr: ctry, usd: tot, y: y }); y += GRP; last = ctry;
      }
      items.push({ link: b.links[0], links: b.links, usd: b.usd, sym: b.sym, y: y }); y += ROW;
    });
    return { items: items, h: y };
  }

  /* ===== SECTION: SVG MAP ===== */
  function svg(m, d, ov) {
    const two = st.hops === 2, W = two ? 1280 : 1060;
    const X = two ? { s2: [8, 200], s1: [262, 236], f: [556, 168], c1: [784, 236], c2: [1072, 200] } : { s1: [10, 300], f: [446, 168], c1: [750, 300] };
    const cols = { s1: column(m.suppliers, "from", st.group), c1: column(m.customers, "to", st.group) };
    if (two) { cols.s2 = column(m.suppliers2, "from", st.group); cols.c2 = column(m.customers2, "to", st.group); }
    const H = Math.max(260, Object.keys(cols).reduce(function (mx, k) { return Math.max(mx, cols[k].h); }, 0) + 10);
    const all = m.suppliers.concat(m.customers, m.suppliers2, m.customers2), maxUsd = all.reduce(function (mx, l) { return Math.max(mx, l.usd); }, 0) || 1;
    const maxImp = ov ? Object.keys(ov.edge).reduce(function (mx, k) { return Math.max(mx, Math.abs(ov.edge[k])); }, 0) : 0;
    const maxGp = ov ? Object.keys(ov.res).reduce(function (mx, k) { return Math.max(mx, Math.abs(ov.res[k].d_gp_pct)); }, 0) : 0;
    const held = heldSet(d), pos = {};
    const fH = Math.max(110, Math.min(H - 2 * TOP, 220)), fY = (H - fH) / 2, fx = X.f[0], fw = X.f[1];
    pos[m.focal.symbol] = { x: fx, y: fY, w: fw, h: fH };
    Object.keys(cols).forEach(function (k) { cols[k].items.forEach(function (it) { if (it.link) pos[it.sym] = { x: X[k][0], y: it.y, w: X[k][1], h: BOX }; }); });
    // links: supplier right edge → customer left edge; endpoints spread along the focal box
    const spread = function (n, i) { return fY + 14 + (fH - 28) * (n > 1 ? i / (n - 1) : 0.5); };
    const linkPath = function (l, i, n, side) {
      const a = pos[l.from], b = pos[l.to]; if (!a || !b) return "";
      const x1 = a.x + a.w, x2 = b.x;
      const y1 = l.from === m.focal.symbol ? spread(n, i) : a.y + a.h / 2, y2 = l.to === m.focal.symbol ? spread(n, i) : b.y + b.h / 2;
      const mx = (x1 + x2) / 2, sw = 1.2 + 11 * Math.sqrt(l.usd / maxUsd);
      const key = l.from + ">" + l.to, imp = ov ? (ov.edge[key] || 0) : null;
      const col = ov ? (heat(imp, maxImp) || "rgba(138,148,166,.18)") : side.charAt(0) === "s" ? "rgba(46,196,182,.42)" : "rgba(255,176,0,.40)";
      const lx = side === "s" ? x1 + (x2 - x1) * 0.42 : x1 + (x2 - x1) * 0.58, ly = y1 + (y2 - y1) * (side === "s" ? 0.42 : 0.58);
      const tip = A.esc(A.sym(l.from) + " → " + A.sym(l.to) + ": " + bn(l.usd) + " flow · " + pc(l.pctSupRev) + " of " + A.sym(l.from) + " revenue · " +
        (l.pctCusCost === null ? "CAPEX for " + A.sym(l.to) + " (no capex figure)" : pc(l.pctCusCost) + " of " + A.sym(l.to) + " COGS") + (ov ? " · shock ΔRev through link " + A.signed(imp, 2, " USD bn") : ""));
      return '<g class="splc-link" data-k="' + A.esc(key) + '"><title>' + tip + '</title><path d="M' + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + x2 + "," + y2 +
        '" fill="none" stroke="' + col + '" stroke-width="' + sw.toFixed(1) + '"/>' +
        (side.length === 1 && (sw > 2.2 || all.length <= 14) ? '<text class="splc-lbl" x="' + lx.toFixed(0) + '" y="' + (ly - 3).toFixed(0) + '" text-anchor="middle">' + (ov && Math.abs(imp) > 1e-9 ? A.signed(imp, 2, "") : bn(l.usd)) + "</text>" : "") + "</g>";
    };
    let g = "";
    m.suppliers2.forEach(function (l, i) { g += linkPath(l, i, 1, "s2"); });
    m.suppliers.forEach(function (l, i) { g += linkPath(l, i, m.suppliers.length, "s"); });
    m.customers.forEach(function (l, i) { g += linkPath(l, i, m.customers.length, "c"); });
    m.customers2.forEach(function (l, i) { g += linkPath(l, i, 1, "c2"); });
    // column headers
    const head = function (k, t) { return X[k] ? '<text class="splc-colh" x="' + (X[k][0] + X[k][1] / 2) + '" y="16" text-anchor="middle">' + t + "</text>" : ""; };
    let n = head("s2", "TIER-2 SUPPLIERS") + head("s1", "SUPPLIERS (" + m.suppliers.length + ")") + head("f", "FOCAL COMPANY") + head("c1", "CUSTOMERS (" + m.customers.length + ")") + head("c2", "TIER-2 CUSTOMERS");
    ["s2", "c2"].forEach(function (k) { if (cols[k] && !cols[k].items.length) n += '<text class="splc-none" x="' + (X[k][0] + X[k][1] / 2) + '" y="' + (TOP + 18) + '" text-anchor="middle">none modelled</text>'; });
    // side boxes
    Object.keys(cols).forEach(function (k) {
      const sideS = k.charAt(0) === "s", w = X[k][1], x = X[k][0];
      cols[k].items.forEach(function (it) {
        if (it.hdr) { n += '<text class="splc-grp" x="' + x + '" y="' + (it.y + 13) + '">' + A.esc(it.hdr) + " · " + bn(it.usd) + "</text>"; return; }
        const l = it.link, c = C[it.sym], gp = ov ? ov.res[it.sym].d_gp_pct : null, fill = ov ? heat(gp, maxGp) : null;
        const wide = w >= 230, roomy = w >= 290 && !ov, nm = shortName(c.name, roomy ? 18 : wide ? 15 : 11);
        const partners = it.links.map(function (x) { return A.sym(sideS ? x.to : x.from); }).join(", ");
        const cost = l.pctCusCost === null ? "CAPEX" : pc(l.pctCusCost) + (roomy ? (sideS ? " of COGS" : " of its COGS") : " COGS");
        const line2 = k.charAt(1) === "2" ? bn(it.usd) + (sideS ? " → " : " ← ") + A.esc(shortName(partners, 16))
          : bn(l.usd) + " · " + pc(l.pctSupRev) + (roomy ? (sideS ? " of its rev" : " of rev") : " rev") + " · " + cost;
        n += '<g class="splc-node' + (held[it.sym] ? " held" : "") + '" data-splc="focus" data-sym="' + A.esc(it.sym) + '" tabindex="0" role="button" aria-label="Centre on ' + A.esc(c.name) + '">' +
          "<title>" + A.esc(c.name + " · " + NODE[c.node].name + " · " + c.country + " – click to centre") + "</title>" +
          '<rect x="' + x + '" y="' + it.y + '" width="' + w + '" height="' + BOX + '" rx="3"' + (fill ? ' style="fill:' + fill + '"' : "") + "/>" +
          '<text class="t1" x="' + (x + 7) + '" y="' + (it.y + 15) + '"><tspan class="tk">' + A.esc(A.sym(it.sym)) + "</tspan> " + A.esc(nm) + (wide ? ' <tspan class="ct">' + A.esc(c.country) + "</tspan>" : "") + "</text>" +
          '<text class="t2" x="' + (x + 7) + '" y="' + (it.y + 30) + '">' + (wide || !ov ? line2 : "") + (ov ? (wide ? " · " : "") + "ΔGP " + A.signed(gp, 1, "%") : "") + "</text></g>";
      });
    });
    // focal box
    const f = m.focal, fgp = ov ? ov.res[f.symbol].d_gp_pct : null, ffill = ov ? heat(fgp, maxGp) : null;
    n += '<g class="splc-focal' + (held[f.symbol] ? " held" : "") + '"><rect x="' + fx + '" y="' + fY + '" width="' + fw + '" height="' + fH + '" rx="4"' + (ffill ? ' style="fill:' + ffill + '"' : "") + "/>" +
      '<text class="f1" x="' + (fx + fw / 2) + '" y="' + (fY + fH / 2 - 22) + '" text-anchor="middle">' + A.esc(A.sym(f.symbol)) + "</text>" +
      '<text class="f2" x="' + (fx + fw / 2) + '" y="' + (fY + fH / 2 - 4) + '" text-anchor="middle">' + A.esc(shortName(f.name, 20)) + "</text>" +
      '<text class="f3" x="' + (fx + fw / 2) + '" y="' + (fY + fH / 2 + 13) + '" text-anchor="middle">' + A.esc(NODE[f.node].name) + " · " + A.esc(f.country) + "</text>" +
      '<text class="f3" x="' + (fx + fw / 2) + '" y="' + (fY + fH / 2 + 29) + '" text-anchor="middle">' + (ov ? "ΔGP " + A.signed(fgp, 2, "%") : "Rev $" + f.rev_usd_bn + "bn · GM " + f.gm_pct + "%") + "</text></g>";
    return '<div class="splc-scroll"><svg class="splc-svg' + (two ? " two" : "") + '" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Supply chain map centred on ' + A.esc(f.name) + '">' + g + n + "</svg></div>";
  }

  /* ===== SECTION: SIDE PANEL + TABLES ===== */
  function side(m, d, ov) {
    const f = m.focal, L = VCCalc.companyLinks(VC_DATA, f.symbol, d.hx, d.holdingSymbols);
    const kv = function (k, v) { return '<div class="kv"><span>' + k + '</span><span class="mono">' + v + "</span></div>"; };
    const warn = d.flow.filter(function (w) { return w.symbol === f.symbol; });
    const geo = function (arr) { return arr.map(function (g) { return '<div class="splc-geo"><span>' + A.esc(g.country) + '</span><span class="bar"><i style="width:' + Math.max(2, g.pct).toFixed(0) + '%"></i></span><span class="mono">' + g.pct.toFixed(0) + "%</span></div>"; }).join("") || '<p class="note">None modelled.</p>'; };
    const hl = function (arr, f2) { return arr.length ? "<ul class=\"vc-list\">" + arr.map(function (x) { return "<li>" + f2(x) + "</li>"; }).join("") + "</ul>" : '<p class="note">None.</p>'; };
    let html = '<div class="panel splc-side">' + A.tabHead(A.esc(A.sym(f.symbol)) + " · metrics") +
      '<div class="splc-name">' + A.esc(f.name) + ' <span class="note">' + A.esc(NODE[f.node].name) + " · " + A.esc(f.country) + "</span></div>" +
      kv("Revenue", "$" + f.rev_usd_bn + "bn") + kv("Gross margin", f.gm_pct + "%") + kv("EV/EBITDA", f.ev_ebitda + "x") + kv("P/E", f.pe + "x") + kv("Revenue growth", f.rev_growth_pct + "%") + kv("AI exposure", f.ai_exposure_pct + "%") +
      "<h4>Modelled flows</h4>" + kv("Buys from suppliers", bn(m.buysUsd) + (m.buysPctCogs === null ? "" : " · " + pc(m.buysPctCogs) + " of COGS")) + kv("Sells to customers", bn(m.sellsUsd) + " · " + pc(m.sellsPctRev) + " of rev") +
      (warn.length ? warn.map(function (w) { return '<p class="splc-warn">⚠ Flow sanity ' + w.code + ": " + A.esc(w.text) + " (" + bn(w.value) + " vs " + bn(w.limit) + ")</p>"; }).join("") : "") +
      "<h4>Where supply comes from</h4>" + geo(m.geoSuppliers) + "<h4>Where sales go</h4>" + geo(m.geoCustomers) +
      "<h4>Exposed holdings (" + (d.ctxMode === "demo" ? "Demo portfolio" : "My Portfolio") + ")</h4>" +
      '<div class="note">Direct</div>' + hl(L.direct, function (x) { return '<span class="mono">' + A.esc(A.sym(x.symbol)) + "</span>" + (x.pct ? " · " + x.pct + "% node exposure" : ""); }) +
      '<div class="note">Same node</div>' + hl(L.sameNode, function (x) { return '<span class="mono">' + A.esc(A.sym(x.symbol)) + "</span> · " + x.pct + "%"; }) +
      '<div class="note">One link away</div>' + hl(L.oneLink, function (x) { return '<span class="mono">' + A.esc(A.sym(x.symbol)) + "</span> via " + x.via.map(function (v) { return A.esc(A.sym(v.symbol)) + " (" + v.rel + ")"; }).join(", "); });
    if (ov) {
      const mine = ov.imp.rows.filter(function (r) { return Math.abs(r.hkd) > 1e-9; }).slice(0, 5);
      html += "<h4>Shock overlay</h4>" + kv("Portfolio impact HKD", '<span class="' + A.toneOf(ov.imp.total, 0) + '">' + A.fmtS(ov.imp.total, 0) + "</span>") + kv(A.esc(A.sym(f.symbol)) + " ΔGP", A.signed(ov.res[f.symbol].d_gp_pct, 2, "%")) +
        hl(mine, function (r) { return '<span class="mono">' + A.esc(A.sym(r.symbol)) + '</span> <span class="' + A.toneOf(r.hkd, 0) + '">' + A.fmtS(r.hkd, 0) + "</span> HKD"; });
    }
    return html + '<p class="note">Illustrative linear model on demo links. Not a forecast.</p></div>';
  }
  function table(m, ov) {
    const row = function (l, key, sideS) {
      const c = C[l[key]], gp = ov ? ov.res[l[key]].d_gp_pct : null;
      return '<tr class="click" data-splc="focus" data-sym="' + A.esc(l[key]) + '"><td class="tk">' + A.esc(A.sym(l[key])) + '</td><td class="l name">' + A.esc(c.name) + '</td><td class="l">' + A.esc(c.country) +
        "</td><td>" + bn(l.usd) + "</td><td>" + pc(l.pctSupRev) + "</td><td>" + (l.pctCusCost === null ? "—" : pc(l.pctCusCost)) + '</td><td class="l">' + l.bucket + "</td>" +
        (ov ? '<td class="' + A.toneOf(gp, 1) + '">' + A.signed(gp, 1, "%") + "</td>" : "") + "</tr>";
    };
    const t = function (title, links, key, sideS, h5, h6) {
      return '<div class="panel s6">' + A.tabHead(title) + '<div class="table-wrap"><table><thead><tr><th class="l">Ticker</th><th class="l">Name</th><th class="l">Ctry</th><th>Flow</th><th>' + h5 + "</th><th>" + h6 + '</th><th class="l">Cost</th>' + (ov ? "<th>ΔGP %</th>" : "") + "</tr></thead><tbody>" +
        (links.map(function (l) { return row(l, key, sideS); }).join("") || '<tr><td colspan="8" class="empty">None modelled.</td></tr>') + "</tbody></table></div></div>";
    };
    const s = A.esc(A.sym(m.focal.symbol));
    return '<div class="grid">' + t("Suppliers of " + s + " (table)", m.suppliers, "from", true, "% of supplier rev", "% of " + s + " COGS") + t("Customers of " + s + " (table)", m.customers, "to", false, "% of " + s + " rev", "% of customer COGS") + "</div>";
  }
  function sanity(d) { // warnings panel; collapses to a one-line "all clear" when every flow fits
    const n = d.flow.length;
    return '<div class="panel' + (n ? "" : " splc-clear") + '" id="splc-sanity">' + A.tabHead("Flow sanity – " + (n ? n + " warning" + (n === 1 ? "" : "s") : "all clear"), '<span class="note">warnings only · VC checks unchanged</span>') +
      (n ? '<ul class="vc-list">' + d.flow.map(function (w) {
        return '<li><span class="badge b-watch">' + w.code + '</span> <a href="#" data-splc="focus" data-sym="' + A.esc(w.symbol) + '" class="mono">' + A.esc(A.sym(w.symbol)) + "</a> " + A.esc(C[w.symbol].name) + ": " + A.esc(w.text) + " – " + bn(w.value) + " vs " + bn(w.limit) + "</li>";
      }).join("") + "</ul>" : '<p class="splc-ok"><span class="badge b-pass">PASS</span> All flows within COGS / revenue: no company buys more than its AI COGS or sells more than its AI revenue.</p>') +
      '<p class="note">W1 = modelled sales to chain customers above AI revenue (rev × AI exposure). W2 = modelled purchases above AI COGS (rev × (1 − GM) × AI exposure); hyperscalers excluded (capex). Flow = w × supplier revenue. Illustrative, not reported figures.</p></div>';
  }

  /* ===== SECTION: TAB HTML (called by vc-app.js) ===== */
  function html(d, ctx, api) {
    A = api;
    if (!C[st.focal]) { st.focal = "NVDA.US"; st.trail = ["NVDA.US"]; }
    const m = VCCalc.focalMap(VC_DATA, st.focal, st.hops);
    d.flow = VCCalc.flowChecks(VC_DATA); d.ctxMode = ctx.mode;
    let ov = null;
    const shock = VC_DATA.shocks.find(function (x) { return x.id === st.overlay; });
    if (shock) { const res = VCCalc.propagate(VC_DATA, shock, d.s); ov = { shock: shock, res: res, edge: VCCalc.edgeImpact(VC_DATA, res), imp: VCCalc.holdingImpact(VC_DATA, d.rows, d.hx, res, d.s, d.total) }; }
    const opts = VC_DATA.nodes.slice().sort(function (a, b) { return a.order - b.order; }).map(function (n) {
      return '<optgroup label="' + A.esc(n.name) + '">' + VC_DATA.companies.filter(function (c) { return c.node === n.id; }).map(function (c) { return '<option value="' + A.esc(c.symbol) + '"' + (c.symbol === st.focal ? " selected" : "") + ">" + A.esc(A.sym(c.symbol) + " " + c.name) + "</option>"; }).join("") + "</optgroup>";
    }).join("");
    const btn = function (act, val, cur, label) { return '<button class="btn' + (String(cur) === String(val) ? " on" : "") + '" data-splc="' + act + '" data-v="' + val + '">' + label + "</button>"; };
    const crumbs = st.trail.map(function (s, i) { return i === st.trail.length - 1 ? '<b class="mono">' + A.esc(A.sym(s)) + "</b>" : '<a href="#" class="mono" data-splc="crumb" data-i="' + i + '">' + A.esc(A.sym(s)) + "</a>"; }).join(' <span class="muted">›</span> ');
    let out = '<div class="panel splc-panel">' + A.tabHead("Supply chain – " + A.esc(m.focal.name), '<span class="vc-disclaimer">Illustrative data. Not a forecast.</span>') +
      '<div class="splc-controls"><label class="field"><span class="label">Focal company</span><select data-splc="pick">' + opts + "</select></label>" +
      '<div class="field"><span class="label">Tiers</span><div class="seg">' + btn("hops", 1, st.hops, "1 hop") + btn("hops", 2, st.hops, "2 hops") + "</div></div>" +
      '<div class="field"><span class="label">Group</span><div class="seg">' + btn("group", "rel", st.group, "Relationship") + btn("group", "geo", st.group, "Region") + "</div></div>" +
      '<label class="field"><span class="label">Shock overlay</span><select data-splc="overlay"><option value="none">None</option>' +
      VC_DATA.shocks.map(function (s) { return '<option value="' + s.id + '"' + (s.id === st.overlay ? " selected" : "") + ">" + A.esc(s.name) + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="splc-crumbs" aria-label="Breadcrumb"><span class="note">Path:</span> ' + crumbs + (st.trail.length > 1 ? ' <a href="#" class="note" data-splc="crumb" data-i="0">back to start</a>' : "") + "</div>" +
      (ov ? '<div class="splc-shockbar"><span class="badge b-watch">SHOCK</span> <b>' + A.esc(ov.shock.name) + "</b> – " + A.esc(FRAMING[ov.shock.id] || "") +
        ' <span class="splc-kpi">Portfolio impact HKD <b class="' + A.toneOf(ov.imp.total, 0) + '">' + A.fmtS(ov.imp.total, 0) + "</b></span></div>" : "") +
      '<div class="splc-wrap' + (st.hops === 2 ? " two" : "") + '"><div class="splc-main"><p class="note splc-swipe">Swipe the map sideways. The tables below list every link.</p>' + svg(m, d, ov) +
      '<p class="note splc-legend">' + (ov ? "Colour = shock impact: red = lower revenue / gross profit, green = higher; link label = ΔRev through the link (USD bn). Same maths as the Shock Simulator."
        : "Line width = illustrative $ flow (w × supplier revenue). Teal = suppliers, amber = customers. Teal outline = in your portfolio or mapped to a holding.") +
      " Click any company to re-centre.</p></div>" + side(m, d, ov) + "</div></div>";
    return out + table(m, ov) + sanity(d);
  }

  /* ===== SECTION: EVENTS ===== */
  function focus(sym) {
    if (!C[sym] || sym === st.focal) return;
    const i = st.trail.indexOf(sym);
    st.trail = i >= 0 ? st.trail.slice(0, i + 1) : st.trail.concat([sym]).slice(-8);
    st.focal = sym; rerender();
  }
  document.addEventListener("click", function (e) {
    const el = e.target.closest && e.target.closest("[data-splc]"); if (!el || el.tagName === "SELECT") return;
    const a = el.getAttribute("data-splc"); e.preventDefault();
    if (a === "focus") focus(el.getAttribute("data-sym"));
    else if (a === "crumb") { const i = Number(el.getAttribute("data-i")); st.trail = st.trail.slice(0, i + 1); st.focal = st.trail[i]; rerender(); }
    else if (a === "hops") { st.hops = Number(el.getAttribute("data-v")) === 2 ? 2 : 1; rerender(); }
    else if (a === "group") { st.group = el.getAttribute("data-v") === "geo" ? "geo" : "rel"; rerender(); }
  });
  document.addEventListener("change", function (e) {
    const a = e.target.getAttribute && e.target.getAttribute("data-splc");
    if (a === "pick") focus(e.target.value);
    else if (a === "overlay") { st.overlay = e.target.value; rerender(); }
  });
  document.addEventListener("keydown", function (e) {
    const el = e.target.closest && e.target.closest(".splc-node");
    if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); focus(el.getAttribute("data-sym")); }
  });

  /* ===== SECTION: PUBLIC API ===== */
  function setFocal(sym) { // like focus() but without re-rendering (the caller routes to the page)
    if (!C[sym]) return false;
    if (sym !== st.focal) { const i = st.trail.indexOf(sym); st.trail = i >= 0 ? st.trail.slice(0, i + 1) : st.trail.concat([sym]).slice(-8); st.focal = sym; }
    return true;
  }
  return { html: html, state: st, setFocal: setFocal, setRerender: function (fn) { rerender = fn; } };
})();

// END OF FILE: vc-splc.js
