// vc-calc.js – Winston Terminal v4: Value Chain Explorer maths as pure functions (no DOM, no clock, no storage)
// Deterministic and linear. Full precision inside; round only for display. Illustrative model, not a forecast.
// v4: supply-chain (SPLC-style) focal map, link $ flows, shock impact per link, flow-sanity warnings, geo split.

const VCCalc = (function () {
  "use strict";

  /* ===== SECTION: HELPERS ===== */
  const EPS = 1e-9;
  function bySymbol(vc) { const m = {}; vc.companies.forEach(function (c) { m[c.symbol] = c; }); return m; }
  function aiRev(c) { return c.rev_usd_bn * c.ai_exposure_pct / 100; }
  function median(values) {
    const v = values.slice().sort(function (a, b) { return a - b; }), m = v.length >> 1;
    return v.length === 0 ? null : v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  function nodeOrder(vc) { const o = {}; vc.nodes.forEach(function (n) { o[n.id] = n.order; }); return o; }
  function targetsOf(vc, target) {
    const t = String(target || "");
    if (t.indexOf("node:") === 0) return vc.companies.filter(function (c) { return c.node === t.slice(5); }).map(function (c) { return c.symbol; });
    return vc.companies.some(function (c) { return c.symbol === t; }) ? [t] : [];
  }

  /* ===== SECTION: PROFIT POOLS (vcNodeStats) ===== */
  // AI rev = rev × ai_exposure; GP = AI rev × gm; node GM = ΣGP ÷ ΣAI rev; growth weighted by AI rev; medians of EV/EBITDA and P/E.
  function nodeStats(vc) {
    const nodes = vc.nodes.slice().sort(function (a, b) { return a.order - b.order; }).map(function (n) {
      const cs = vc.companies.filter(function (c) { return c.node === n.id; });
      const ar = cs.reduce(function (a, c) { return a + aiRev(c); }, 0);
      const gp = cs.reduce(function (a, c) { return a + aiRev(c) * c.gm_pct / 100; }, 0);
      const g = cs.reduce(function (a, c) { return a + aiRev(c) * c.rev_growth_pct; }, 0);
      return { id: n.id, name: n.name, order: n.order, role: n.role, n: cs.length, aiRev: ar, gp: gp,
        gm: ar > 0 ? gp / ar * 100 : null, growth: ar > 0 ? g / ar : null,
        evEbitda: median(cs.map(function (c) { return c.ev_ebitda; })), pe: median(cs.map(function (c) { return c.pe; })) };
    });
    const tR = nodes.reduce(function (a, x) { return a + x.aiRev; }, 0), tG = nodes.reduce(function (a, x) { return a + x.gp; }, 0);
    nodes.forEach(function (x) { x.revShare = tR > 0 ? x.aiRev / tR * 100 : 0; x.gpShare = tG > 0 ? x.gp / tG * 100 : 0; });
    return { nodes: nodes, totalAiRev: tR, totalGp: tG };
  }

  /* ===== SECTION: METRIC QUINTILES (vcMetricBuckets) ===== */
  // Rank-based quintile 1–5 (1 = lowest). Equal values share the bucket of the first one.
  function metricBuckets(companies, metric) {
    const s = companies.filter(function (c) { return isFinite(c[metric]); })
      .sort(function (a, b) { return a[metric] - b[metric] || (a.symbol < b.symbol ? -1 : 1); });
    const out = {}, n = s.length, ranges = [1, 2, 3, 4, 5].map(function (b) { return { bucket: b, min: null, max: null }; });
    let lastVal = null, lastBucket = 1;
    s.forEach(function (c, i) {
      const b = c[metric] === lastVal ? lastBucket : Math.floor(i * 5 / n) + 1;
      out[c.symbol] = b; lastVal = c[metric]; lastBucket = b;
      const r = ranges[b - 1]; r.min = r.min === null ? c[metric] : Math.min(r.min, c[metric]); r.max = r.max === null ? c[metric] : Math.max(r.max, c[metric]);
    });
    return { bySymbol: out, ranges: ranges };
  }

  /* ===== SECTION: PORTFOLIO EXPOSURE (vcPortfolioExposure) ===== */
  // node HKD = Σ holding value HKD × pct; % of portfolio = node HKD ÷ total value; % of chain = node HKD ÷ Σ node HKD.
  function portfolioExposure(vc, rows, hx, settings, totalValue) {
    const values = {}; rows.forEach(function (r) { values[r.symbol] = r.valueHKD; });
    const total = isFinite(totalValue) ? totalValue : rows.reduce(function (a, r) { return a + r.valueHKD; }, 0);
    const byNode = {}, holdings = [];
    hx.forEach(function (h) {
      const v = values[h.symbol]; if (v === undefined || v === null) return;
      let pctSum = 0;
      h.exposures.forEach(function (e) { const p = Number(e.pct) || 0; pctSum += p; byNode[e.node] = (byNode[e.node] || 0) + v * p / 100; });
      holdings.push({ symbol: h.symbol, valueHKD: v, exposurePct: pctSum, hkd: v * pctSum / 100 });
    });
    const chain = Object.keys(byNode).reduce(function (a, k) { return a + byNode[k]; }, 0);
    const order = nodeOrder(vc), names = {}; vc.nodes.forEach(function (n) { names[n.id] = n.name; });
    const nodes = Object.keys(byNode).map(function (id) {
      const hkd = byNode[id], pctChain = chain > 0 ? hkd / chain * 100 : 0;
      return { node: id, name: names[id] || id, order: order[id] || 99, hkd: hkd, pctPortfolio: total > 0 ? hkd / total * 100 : 0, pctChain: pctChain,
        status: pctChain > settings.vc_node_limit_pct ? "FLAG" : pctChain > settings.vc_node_watch_pct ? "WATCH" : "OK",
        limit: pctChain > settings.vc_node_limit_pct ? settings.vc_node_limit_pct : settings.vc_node_watch_pct };
    }).sort(function (a, b) { return b.hkd - a.hkd; });
    return { total: total, chain: chain, chainPct: total > 0 ? chain / total * 100 : 0, outside: total - chain, nodes: nodes, holdings: holdings,
      flags: nodes.filter(function (n) { return n.status === "FLAG"; }), watch: nodes.filter(function (n) { return n.status === "WATCH"; }) };
  }

  /* ===== SECTION: COMPANY LINKS (vcCompanyLinks) ===== */
  // Suppliers, customers, and exposed holdings: direct (holding is / maps to this company), same node, one link away.
  function companyLinks(vc, symbol, hx, holdingSymbols) {
    const C = bySymbol(vc), c = C[symbol]; if (!c) return null;
    const suppliers = vc.edges.filter(function (e) { return e.to === symbol; }).map(function (e) { return { symbol: e.from, name: C[e.from].name, w: e.w }; });
    const customers = vc.edges.filter(function (e) { return e.from === symbol; }).map(function (e) { return { symbol: e.to, name: C[e.to].name, w: e.w }; });
    const neighbours = {}; suppliers.forEach(function (x) { neighbours[x.symbol] = "supplier"; }); customers.forEach(function (x) { neighbours[x.symbol] = "customer"; });
    const held = holdingSymbols ? function (s) { return holdingSymbols.indexOf(s) >= 0; } : function () { return true; };
    const direct = [], sameNode = [], oneLink = [];
    hx.filter(function (h) { return held(h.symbol); }).forEach(function (h) {
      const mapped = h.exposures.filter(function (e) { return e.company; }).map(function (e) { return e.company; });
      const nodePct = h.exposures.filter(function (e) { return e.node === c.node; }).reduce(function (a, e) { return a + (Number(e.pct) || 0); }, 0);
      if (h.symbol === symbol || mapped.indexOf(symbol) >= 0) direct.push({ symbol: h.symbol, pct: nodePct });
      else if (nodePct > 0) sameNode.push({ symbol: h.symbol, pct: nodePct });
      else { const via = mapped.filter(function (m) { return neighbours[m]; }).map(function (m) { return { symbol: m, rel: neighbours[m] }; }); if (via.length) oneLink.push({ symbol: h.symbol, via: via }); }
    });
    return { company: c, suppliers: suppliers, customers: customers, direct: direct, sameNode: sameNode, oneLink: oneLink };
  }

  /* ===== SECTION: SHOCK PROPAGATION (vcPropagate) ===== */
  // All Δ in % of the company's own revenue. k(s→c) = w × rev_s ÷ rev_c; a = ai_exposure ÷ 100.
  // volume x: ΔRev = x·a, ΔGP = ΔRev × gm, upstream supplier ΔRev = w × buyer ΔRev.  demand d: upstream ΔRev = w × d.
  // price p: ΔRev = ΔGP = p·a; downstream h = p × k, ΔRev += pt·h, ΔGP −= (1−pt)·h, pt·h passes on.
  // supply q: ΔRev = −q·a; customers lose crit_mult·q·k at hop 1, then 1:1; GP moves at the customer's margin.
  function propagate(vc, shock, settings) {
    const C = bySymbol(vc), res = {};
    vc.companies.forEach(function (c) { res[c.symbol] = { symbol: c.symbol, d_rev: 0, d_gp: 0, paths: [] }; });
    const add = function (sym, dRev, dGp, steps, origin) { const r = res[sym]; r.d_rev += dRev; r.d_gp += dGp; r.paths.push({ origin: origin, steps: steps, d_rev: dRev, d_gp: dGp }); };
    const sup = function (s) { return vc.edges.filter(function (e) { return e.to === s; }); };
    const cus = function (s) { return vc.edges.filter(function (e) { return e.from === s; }); };
    const pt = Number(shock.pass_through) || 0, m = Number(shock.crit_mult) || 1, H = Number(settings.vc_max_hops);
    function upDemand(sym, d, hop, steps, origin) {
      if (hop >= H) return;
      sup(sym).forEach(function (e) {
        const v = e.w * d, s2 = steps.concat([{ symbol: e.from, w: e.w }]);
        add(e.from, v, v * C[e.from].gm_pct / 100, s2, origin); upDemand(e.from, v, hop + 1, s2, origin);
      });
    }
    function downPrice(sym, p, hop, steps, origin) {
      if (hop >= H) return;
      cus(sym).forEach(function (e) {
        const k = e.w * C[sym].rev_usd_bn / C[e.to].rev_usd_bn, h = p * k, s2 = steps.concat([{ symbol: e.to, w: e.w, k: k }]);
        add(e.to, pt * h, -(1 - pt) * h, s2, origin); if (pt > 0) downPrice(e.to, pt * h, hop + 1, s2, origin);
      });
    }
    function downSupply(sym, q, hop, steps, origin) {
      if (hop >= H) return;
      const mm = hop === 0 ? m : 1;
      cus(sym).forEach(function (e) {
        const k = e.w * C[sym].rev_usd_bn / C[e.to].rev_usd_bn, lost = mm * q * k, s2 = steps.concat([{ symbol: e.to, w: e.w, k: k, m: mm }]);
        add(e.to, -lost, -lost * C[e.to].gm_pct / 100, s2, origin); downSupply(e.to, lost, hop + 1, s2, origin);
      });
    }
    (shock.items || []).forEach(function (it) {
      targetsOf(vc, it.target).forEach(function (t) {
        const c = C[t], a = c.ai_exposure_pct / 100, pct = Number(it.pct) || 0;
        const origin = { symbol: t, type: it.type, pct: pct }, own = [];
        if (it.type === "volume") { const x = pct * a; add(t, x, x * c.gm_pct / 100, own, origin); upDemand(t, x, 0, own, origin); }
        else if (it.type === "demand") upDemand(t, pct, 0, own, origin);
        else if (it.type === "price") { const x = pct * a; add(t, x, x, own, origin); downPrice(t, pct, 0, own, origin); }
        else if (it.type === "supply") { const x = pct * a; add(t, -x, -x * c.gm_pct / 100, own, origin); downSupply(t, pct, 0, own, origin); }
      });
    });
    Object.keys(res).forEach(function (s) {
      const r = res[s], gm = C[s].gm_pct;
      r.d_gp_pct = gm > 0 ? r.d_gp / gm * 100 : 0;
      r.new_gm = 1 + r.d_rev / 100 > EPS ? (gm + r.d_gp) / (1 + r.d_rev / 100) : null;
      r.d_gm_pp = r.new_gm === null ? null : r.new_gm - gm;
      r.hit = Math.abs(r.d_gp_pct) > EPS || Math.abs(r.d_rev) > EPS;
      r.paths.forEach(function (p) { p.d_gp_pct = gm > 0 ? p.d_gp / gm * 100 : 0; });
    });
    return res;
  }
  // Companies hit, ranked by |ΔGP %| (ties by symbol).
  function rankCompanies(vc, res) {
    const C = bySymbol(vc);
    return Object.keys(res).map(function (s) { return res[s]; }).filter(function (r) { return r.hit; })
      .sort(function (a, b) { return Math.abs(b.d_gp_pct) - Math.abs(a.d_gp_pct) || (a.symbol < b.symbol ? -1 : 1); })
      .map(function (r) { return Object.assign({ name: C[r.symbol].name, node: C[r.symbol].node }, r); });
  }
  // Top n paths for one company by |ΔGP % contribution|.
  function topPaths(res, symbol, n) {
    const r = res[symbol]; if (!r) return [];
    return r.paths.slice().sort(function (a, b) { return Math.abs(b.d_gp_pct) - Math.abs(a.d_gp_pct) || Math.abs(b.d_rev) - Math.abs(a.d_rev); }).slice(0, n || 10);
  }

  /* ===== SECTION: HOLDING IMPACT (vcHoldingImpact) ===== */
  // impact %_h = elasticity × Σ pct_e × ΔGP%(mapped company, else node average weighted by AI rev); HKD_h = value × impact %.
  function nodeAvgGpPct(vc, res, node) {
    const cs = vc.companies.filter(function (c) { return c.node === node; });
    const tw = cs.reduce(function (a, c) { return a + aiRev(c); }, 0);
    return tw > 0 ? cs.reduce(function (a, c) { return a + res[c.symbol].d_gp_pct * aiRev(c); }, 0) / tw : 0;
  }
  function holdingImpact(vc, rows, hx, res, settings, totalValue) {
    const values = {}; rows.forEach(function (r) { values[r.symbol] = r.valueHKD; });
    const el = Number(settings.vc_equity_elasticity);
    const out = hx.filter(function (h) { return values[h.symbol] !== undefined; }).map(function (h) {
      const parts = h.exposures.map(function (e) {
        const g = e.company && res[e.company] ? res[e.company].d_gp_pct : nodeAvgGpPct(vc, res, e.node);
        return { node: e.node, company: e.company || null, pct: Number(e.pct) || 0, gpPct: g, contrib: (Number(e.pct) || 0) / 100 * g * el };
      });
      const pct = parts.reduce(function (a, p) { return a + p.contrib; }, 0);
      return { symbol: h.symbol, valueHKD: values[h.symbol], exposurePct: parts.reduce(function (a, p) { return a + p.pct; }, 0), parts: parts, impactPct: pct, hkd: values[h.symbol] * pct / 100 };
    });
    const total = out.reduce(function (a, r) { return a + r.hkd; }, 0);
    const tv = isFinite(totalValue) ? totalValue : rows.reduce(function (a, r) { return a + r.valueHKD; }, 0);
    let largest = null; out.forEach(function (r) { if (Math.abs(r.hkd) > EPS && (!largest || Math.abs(r.hkd) > Math.abs(largest.hkd))) largest = r; });
    return { rows: out.sort(function (a, b) { return Math.abs(b.hkd) - Math.abs(a.hkd); }), total: total, totalPct: tv > 0 ? total / tv * 100 : 0, largest: largest };
  }

  /* ===== SECTION: SUPPLY-CHAIN FOCAL MAP (SPLC-style, v4) ===== */
  // Link flow (USD bn) = w × supplier revenue. % of supplier revenue = w × 100.
  // % of customer cost = flow ÷ customer COGS, COGS = rev × (1 − gm). Hyperscalers buy servers as CAPEX, which VC_DATA
  // does not hold, so their % of cost is null (bucket "CAPEX"); everyone else is bucket "COGS".
  function linkInfo(C, e) {
    const s = C[e.from], c = C[e.to], usd = e.w * s.rev_usd_bn, capex = c.node === "cloud", cogs = c.rev_usd_bn * (1 - c.gm_pct / 100);
    return { from: e.from, to: e.to, w: e.w, usd: usd, pctSupRev: e.w * 100, bucket: capex ? "CAPEX" : "COGS", pctCusCost: capex || cogs <= EPS ? null : usd / cogs * 100 };
  }
  // hops 1: direct suppliers (left) and customers (right). hops 2 adds suppliers of suppliers and customers of customers
  // (each company appears once, at its nearest tier; the focal company never repeats).
  function focalMap(vc, symbol, hops) {
    const C = bySymbol(vc); if (!C[symbol]) return null;
    const sup1 = vc.edges.filter(function (e) { return e.to === symbol; }).map(function (e) { return linkInfo(C, e); });
    const cus1 = vc.edges.filter(function (e) { return e.from === symbol; }).map(function (e) { return linkInfo(C, e); });
    const seen = {}; seen[symbol] = 1; sup1.forEach(function (l) { seen[l.from] = 1; }); cus1.forEach(function (l) { seen[l.to] = 1; });
    let sup2 = [], cus2 = [];
    if (Number(hops) >= 2) {
      const t1s = sup1.map(function (l) { return l.from; }), t1c = cus1.map(function (l) { return l.to; });
      sup2 = vc.edges.filter(function (e) { return t1s.indexOf(e.to) >= 0 && !seen[e.from]; }).map(function (e) { return linkInfo(C, e); });
      cus2 = vc.edges.filter(function (e) { return t1c.indexOf(e.from) >= 0 && !seen[e.to] && sup2.every(function (l) { return l.from !== e.to; }); }).map(function (e) { return linkInfo(C, e); });
    }
    const byUsd = function (a, b) { return b.usd - a.usd || (a.from + a.to < b.from + b.to ? -1 : 1); };
    [sup1, cus1, sup2, cus2].forEach(function (a) { a.sort(byUsd); });
    const sum = function (a) { return a.reduce(function (t, l) { return t + l.usd; }, 0); };
    const geo = function (a, key) { const g = {}; a.forEach(function (l) { const k = C[l[key]].country; g[k] = (g[k] || 0) + l.usd; }); const tot = sum(a);
      return Object.keys(g).map(function (k) { return { country: k, usd: g[k], pct: tot > 0 ? g[k] / tot * 100 : 0 }; }).sort(function (a2, b2) { return b2.usd - a2.usd || (a2.country < b2.country ? -1 : 1); }); };
    const f = C[symbol], cogs = f.rev_usd_bn * (1 - f.gm_pct / 100);
    return { focal: f, suppliers: sup1, customers: cus1, suppliers2: sup2, customers2: cus2,
      buysUsd: sum(sup1), sellsUsd: sum(cus1), cogsUsd: cogs, buysPctCogs: cogs > EPS ? sum(sup1) / cogs * 100 : null, sellsPctRev: f.rev_usd_bn > 0 ? sum(cus1) / f.rev_usd_bn * 100 : 0,
      geoSuppliers: geo(sup1, "from"), geoCustomers: geo(cus1, "to") };
  }
  // Shock impact carried by each link: Σ over propagation paths that cross the link of the end company's ΔRev in USD bn
  // (ΔRev % × its revenue ÷ 100). Key "FROM>TO" (supplier>customer). Re-uses the paths propagate() already summed.
  function edgeImpact(vc, res) {
    const C = bySymbol(vc), has = {}, out = {};
    vc.edges.forEach(function (e) { has[e.from + ">" + e.to] = 1; });
    Object.keys(res).forEach(function (sym) {
      res[sym].paths.forEach(function (p) {
        const chain = [p.origin.symbol].concat(p.steps.map(function (x) { return x.symbol; })), usd = p.d_rev * C[sym].rev_usd_bn / 100;
        for (let i = 1; i < chain.length; i++) {
          const a = chain[i - 1], b = chain[i], k = has[a + ">" + b] ? a + ">" + b : has[b + ">" + a] ? b + ">" + a : null;
          if (k) out[k] = (out[k] || 0) + usd;
        }
      });
    });
    return out;
  }
  // Flow sanity (warnings, not checks): W1 modelled sales to chain customers > the supplier's AI revenue (rev × AI exposure);
  // W2 modelled purchases > the buyer's AI COGS (rev × (1 − gm) × AI exposure). Hyperscalers excluded: their purchases are capex.
  function flowChecks(vc) {
    const C = bySymbol(vc), out = [];
    vc.companies.forEach(function (c) {
      const sells = vc.edges.filter(function (e) { return e.from === c.symbol; }).reduce(function (t, e) { return t + e.w * c.rev_usd_bn; }, 0);
      if (sells > aiRev(c) + EPS) out.push({ code: "W1", symbol: c.symbol, value: sells, limit: aiRev(c), text: "modelled sales to chain customers exceed its AI revenue" });
    });
    vc.companies.forEach(function (c) {
      if (c.node === "cloud") return;
      const buys = vc.edges.filter(function (e) { return e.to === c.symbol; }).reduce(function (t, e) { return t + e.w * C[e.from].rev_usd_bn; }, 0), cogs = c.rev_usd_bn * (1 - c.gm_pct / 100) * c.ai_exposure_pct / 100;
      if (buys > cogs + EPS) out.push({ code: "W2", symbol: c.symbol, value: buys, limit: cogs, text: "modelled purchases exceed its AI COGS" });
    });
    return out;
  }

  /* ===== SECTION: SHOCK VALIDATION ===== */
  function validateShock(vc, shock) {
    const errors = [], nodeIds = vc.nodes.map(function (n) { return n.id; });
    (shock.items || []).forEach(function (i) {
      const t = String(i.target || "");
      const ok = t.indexOf("node:") === 0 ? nodeIds.indexOf(t.slice(5)) >= 0 : vc.companies.some(function (c) { return c.symbol === t; });
      if (!ok) errors.push("unknown target " + t);
      if (VC_SHOCK_TYPES.indexOf(i.type) < 0) errors.push("bad type " + i.type);
      if (!isFinite(i.pct) || Math.abs(i.pct) > 50) errors.push("pct must be within ±50");
    });
    if (!(shock.items || []).length) errors.push("no shock items");
    if (!(shock.pass_through >= 0 && shock.pass_through <= 1)) errors.push("pass-through must be 0–1");
    if (!(shock.crit_mult >= 1 && shock.crit_mult <= 5)) errors.push("criticality multiplier must be 1–5");
    return errors;
  }

  /* ===== SECTION: VC DATA CHECKS (8) ===== */
  function dataChecks(vc, hx, holdingSymbols) {
    const nodeIds = vc.nodes.map(function (n) { return n.id; }), syms = vc.companies.map(function (c) { return c.symbol; }), C = bySymbol(vc);
    const has = function (s) { return C[s] !== undefined; }, out = [];
    const M = ["rev_usd_bn", "gm_pct", "ev_ebitda", "pe", "rev_growth_pct", "ai_exposure_pct"];
    // 1
    const badNode = vc.companies.filter(function (c) { return nodeIds.indexOf(c.node) < 0; }).map(function (c) { return c.symbol; });
    const emptyNode = vc.nodes.filter(function (n) { return !vc.companies.some(function (c) { return c.node === n.id; }); }).map(function (n) { return n.id; });
    out.push({ id: 1, label: "Every company's node exists; every node has a company", pass: !badNode.length && !emptyNode.length,
      detail: badNode.length || emptyNode.length ? "Bad: " + badNode.concat(emptyNode).join(", ") : vc.nodes.length + " nodes, " + vc.companies.length + " companies" });
    // 2
    const dup = syms.filter(function (s, i) { return syms.indexOf(s) !== i; }), badSym = syms.filter(function (s) { return !VC_SYMBOL_RE.test(s); });
    out.push({ id: 2, label: "Symbols unique and EODHD-style", pass: !dup.length && !badSym.length,
      detail: dup.length || badSym.length ? "Problem: " + dup.concat(badSym).join(", ") : syms.length + " unique symbols" });
    // 3
    const badMetric = vc.companies.filter(function (c) {
      return !M.every(function (k) { return typeof c[k] === "number" && isFinite(c[k]); }) || !(c.rev_usd_bn > 0) || c.gm_pct < 0 || c.gm_pct > 100 || !(c.ai_exposure_pct > 0) || c.ai_exposure_pct > 100;
    }).map(function (c) { return c.symbol; });
    out.push({ id: 3, label: "No metric missing; rev > 0; GM and AI exposure within 0–100", pass: !badMetric.length, detail: badMetric.length ? "Problem: " + badMetric.join(", ") : "6 metrics × " + vc.companies.length + " companies" });
    // 4
    const pairs = vc.edges.map(function (e) { return e.from + ">" + e.to; });
    const badEdge = vc.edges.filter(function (e, i) { return !has(e.from) || !has(e.to) || e.from === e.to || pairs.indexOf(pairs[i]) !== i; }).map(function (e) { return e.from + "→" + e.to; });
    out.push({ id: 4, label: "Edge endpoints exist; no self or duplicate links", pass: !badEdge.length, detail: badEdge.length ? "Problem: " + badEdge.join(", ") : vc.edges.length + " edges" });
    // 5
    const wSum = {}; vc.edges.forEach(function (e) { wSum[e.from] = (wSum[e.from] || 0) + e.w; });
    const badW = vc.edges.filter(function (e) { return !(e.w > 0 && e.w <= 1); }).map(function (e) { return e.from + "→" + e.to; })
      .concat(Object.keys(wSum).filter(function (s) { return wSum[s] > 1 + EPS; }).map(function (s) { return s + " Σw " + wSum[s].toFixed(2); }));
    const maxW = Object.keys(wSum).reduce(function (a, s) { return Math.max(a, wSum[s]); }, 0);
    out.push({ id: 5, label: "0 < w ≤ 1; each supplier's Σw ≤ 1", pass: !badW.length, detail: badW.length ? "Problem: " + badW.join(", ") : "Max supplier Σw " + maxW.toFixed(2) });
    // 6 (depth-first search for a cycle)
    const st = {}; let loopAt = null;
    const dfs = function (s) {
      if (st[s] === 1) return false; if (st[s] === 2) return true; st[s] = 1;
      const nx = vc.edges.filter(function (e) { return e.from === s; }).map(function (e) { return e.to; });
      for (let i = 0; i < nx.length; i++) if (!dfs(nx[i])) { loopAt = loopAt || s; return false; }
      st[s] = 2; return true;
    };
    const acyclic = syms.every(dfs);
    out.push({ id: 6, label: "Links have no loops", pass: acyclic, detail: acyclic ? "Propagation always ends" : "Loop through " + loopAt });
    // 7
    const badH = [];
    hx.forEach(function (h) {
      const sum = h.exposures.reduce(function (a, e) { return a + Number(e.pct); }, 0);
      if (holdingSymbols.indexOf(h.symbol) < 0) badH.push(h.symbol + " not a holding");
      if (!(sum <= 100 + EPS)) badH.push(h.symbol + " Σ " + sum + "%");
      h.exposures.forEach(function (e) {
        if (nodeIds.indexOf(e.node) < 0) badH.push(h.symbol + " bad node " + e.node);
        if (!(Number(e.pct) > 0)) badH.push(h.symbol + " pct must be > 0");
        if (e.company && (!has(e.company) || C[e.company].node !== e.node)) badH.push(h.symbol + " company " + e.company + " not in " + e.node);
      });
    });
    out.push({ id: 7, label: "Holding exposures sum ≤ 100%; nodes and companies valid; symbol is a holding", pass: !badH.length,
      detail: badH.length ? badH.join("; ") : hx.length + " holdings mapped" });
    // 8
    const badShock = [];
    vc.shocks.forEach(function (s) { s.items.forEach(function (i) {
      const t = String(i.target), ok = t.indexOf("node:") === 0 ? nodeIds.indexOf(t.slice(5)) >= 0 : has(t);
      if (!ok || !(Math.abs(i.pct) <= 50)) badShock.push(s.id + ":" + t);
    }); });
    const shareSum = nodeStats(vc).nodes.reduce(function (a, x) { return a + x.revShare; }, 0);
    out.push({ id: 8, label: "Shock targets exist, |pct| ≤ 50; node revenue shares sum to 100%", pass: !badShock.length && Math.abs(shareSum - 100) <= 0.1,
      detail: (badShock.length ? "Problem: " + badShock.join(", ") + " · " : vc.shocks.length + " presets OK · ") + "shares " + shareSum.toFixed(2) + "%" });
    return out;
  }

  /* ===== SECTION: PUBLIC API ===== */
  return {
    aiRev: aiRev, median: median, targetsOf: targetsOf, nodeStats: nodeStats, metricBuckets: metricBuckets,
    portfolioExposure: portfolioExposure, companyLinks: companyLinks, propagate: propagate, rankCompanies: rankCompanies,
    topPaths: topPaths, nodeAvgGpPct: nodeAvgGpPct, holdingImpact: holdingImpact, validateShock: validateShock, dataChecks: dataChecks,
    focalMap: focalMap, edgeImpact: edgeImpact, flowChecks: flowChecks
  };
})();

// END OF FILE: vc-calc.js
