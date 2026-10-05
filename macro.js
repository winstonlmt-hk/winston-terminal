// macro.js – Winston Terminal v5 (Phase 3): HK Macro & Peg page (#macro) and Data Sources page (#sources).
// Reads window.WT_FEEDS (data/feeds.js, written by GitHub Actions) and window.WT_FEED_REGISTRY (feeds-registry.js).
// All maths via Calc (pegPosition, spreadBp, alignSpread, zScore, feedFreshness, seriesChange). Display only here.
// Patterns from the borrowing guide, reimplemented: freshness badges, intelligence-gaps chip, number-to-source links
// (every figure carries data-ev → evidence inspector with source, as-of, fetched time, snapshot id, licence, derivation).
// Registers two modules in window.WT_MODULES and exposes window.WT_FEEDS_UI for app.js (header data chip, dashboard panel, footer).

(function () {
  "use strict";

  /* ===== SECTION: DATA ACCESS ===== */
  function feeds() { return window.WT_FEEDS && window.WT_FEEDS.sources ? window.WT_FEEDS : null; }
  function reg() { return window.WT_FEED_REGISTRY || []; }
  function regOf(id) { return reg().find(function (r) { return r.id === id; }) || { id: id, name: id, tier: "?", cadence_h: 24, lag_days: 4, attribution: id }; }
  function src(id) { const f = feeds(); return f ? f.sources[id] || null : null; }
  function data(id) { const s = src(id); return s && s.data ? s.data : null; }
  function fresh(id, now) { const r = regOf(id); return Calc.feedFreshness(src(id), now || Date.now(), r.cadence_h, r.lag_days); }
  const FS_LABEL = { fresh: "FRESH", stale: "STALE", very_stale: "VERY STALE", no_data: "NO DATA", error: "ERROR", disabled: "OFF" };

  /* ===== SECTION: SMALL VIEW HELPERS ===== */
  let H = null; // ctx.h from app.js (fmt, esc, fdate, phead …)
  let EV = {};  // evidence registry for the current render: key → {label, value, unit, source, as_of, derivation, record}
  function esc(s) { return H ? H.esc(s) : String(s); }
  function fmt(x, dp) { return H ? H.fmt(x, dp) : String(x); }
  function fmtS(x, dp) { return H ? H.fmtS(x, dp) : String(x); }
  function fdate(iso) { return H ? H.fdate(iso) : iso; }
  function fx(x, dp) { return fmt(x, dp); } // derivation text uses the same number format as the page (U+2212 minus)
  function hkt(iso) { const s = Calc.hktStamp(iso); return s ? s + " HKT" : "—"; }
  function badge(id, now) {
    const f = fresh(id, now), s = src(id), r = regOf(id);
    const tip = r.name + " · " + FS_LABEL[f.state] + (s && s.last_ok_at ? " · fetched " + hkt(s.last_ok_at) : "") + (s && s.as_of ? " · as of " + s.as_of : "") + (s && s.status === "error" ? " · last fetch failed: " + (s.error || "") : "");
    return '<span class="fresh-badge fs-' + f.state + (f.failing ? " fs-failing" : "") + '" title="' + esc(tip) + '">' + FS_LABEL[f.state] + (f.failing && s.data ? " · RETRY" : "") + "</span>";
  }
  function srcChip(ids, asOf) { // source + as-of chips on a panel head
    const names = ids.map(function (id) { return shortName(id); }).join(" · ");
    return '<a class="src-chip src-link" href="#sources" title="Open Data Sources">' + esc(names) + "</a>" + (asOf ? '<span class="asof">as of ' + esc(asOf) + "</span>" : "");
  }
  function shortName(id) { return { hkma_liquidity: "HKMA", hkma_er: "HKMA MSB", hkma_hibor: "HKMA MSB", nyfed_sofr: "NY Fed", nyfed_effr: "NY Fed", ust_curve: "US Treasury", fed_h10: "Fed H.10", ecb_fx: "ECB", fomc_calendar: "Federal Reserve", sec_filings: "SEC EDGAR", sec_8k_atom: "SEC EDGAR", rss_fed: "Fed", rss_sec: "SEC", rss_hkgov: "HKSAR Gov", rss_rthk: "RTHK", rss_scmp: "SCMP", gdelt: "GDELT", datagovhk: "DATA.GOV.HK", fred: "FRED" }[id] || id; }
  function ev(key, label, value, unit, sourceId, asOf, derivation, record) { // register a number for the evidence inspector
    EV[key] = { label: label, value: value, unit: unit, source: sourceId, as_of: asOf, derivation: derivation || "", record: record || null }; return ' data-ev="' + esc(key) + '"';
  }
  function num(label, key, valueHtml, sub, cls) {
    return '<div class="mk"><div class="label">' + label + '</div><div class="mk-v mono ' + (cls || "") + '"><a href="#" class="ev-link"' + key + ' title="Show source">' + valueHtml + "</a></div>" + (sub ? '<div class="sub">' + sub + "</div>" : "") + "</div>";
  }
  function empty(id, what) {
    const s = src(id), f = fresh(id);
    return '<div class="state ' + (f.state === "error" ? "error" : "") + '">' + esc(what) + ": " + (f.state === "disabled" ? "off (optional source not configured)." : !feeds() ? "no feed snapshot loaded (data/feeds.js missing)." : s && s.error ? "last fetch failed – " + esc(s.error) : "no data yet.") + "</div>";
  }
  function spark(values, opts) { // tiny inline SVG line; values chronological
    opts = opts || {}; const v = values.filter(function (x) { return isFinite(x); }); if (v.length < 2) return "";
    const w = opts.w || 160, h = opts.h || 36, lo = opts.lo !== undefined ? Math.min(opts.lo, Math.min.apply(null, v)) : Math.min.apply(null, v), hi = opts.hi !== undefined ? Math.max(opts.hi, Math.max.apply(null, v)) : Math.max.apply(null, v), span = hi - lo || 1;
    const pts = v.map(function (x, i) { return (i / (v.length - 1) * (w - 4) + 2).toFixed(1) + "," + (h - 2 - (x - lo) / span * (h - 4)).toFixed(1); }).join(" ");
    const zero = opts.zero && lo < 0 && hi > 0 ? '<line x1="0" x2="' + w + '" y1="' + (h - 2 - (0 - lo) / span * (h - 4)).toFixed(1) + '" y2="' + (h - 2 - (0 - lo) / span * (h - 4)).toFixed(1) + '" class="sp-zero"/>' : "";
    return '<svg class="spark' + (opts.cls ? " " + opts.cls : "") + '" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(opts.label || "trend") + '">' + zero + '<polyline points="' + pts + '"/></svg>';
  }
  function chron(seriesDesc, key) { return (seriesDesc || []).slice().reverse().map(function (r) { return Number(r[key]); }); }
  function daysTo(iso, today) { return Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5); }

  /* ===== SECTION: USD/HKD CANDIDATES (Fed H.10 direct, ECB derived cross, HKMA bulletin) ===== */
  function usdhkd() {
    const h10 = data("fed_h10"), ecb = data("ecb_fx"), er = data("hkma_er");
    const c = [];
    if (h10) c.push({ id: "fed_h10", date: h10.latest.date, value: h10.latest.usd_hkd, label: "Fed H.10 noon NY", series: h10.series, key: "usd_hkd", derived: "" });
    if (ecb) c.push({ id: "ecb_fx", date: ecb.latest.date, value: ecb.latest.usd_hkd_cross, label: "ECB cross (derived)", series: ecb.series, key: "usd_hkd_cross",
      derived: "USD/HKD = HKD per EUR " + ecb.latest.hkd_per_eur + " ÷ USD per EUR " + ecb.latest.usd_per_eur + " = " + (ecb.latest.hkd_per_eur / ecb.latest.usd_per_eur).toFixed(5) });
    if (er) c.push({ id: "hkma_er", date: er.latest.date, value: er.latest.usd_hkd, label: "HKMA bulletin", series: er.series, key: "usd_hkd", derived: "" });
    return { list: c, best: Calc.pickLatest(c) };
  }

  /* ===== SECTION: PUBLIC HELPERS FOR app.js (header chip, dashboard panel, footer) ===== */
  function dataChip(now) {
    const f = feeds(); if (!f) return { label: "Data –", cls: "bad", title: "No public feed snapshot loaded (data/feeds.js missing)" };
    const t = now || Date.now(), age = (t - Date.parse(f.generated_at)) / 3.6e6, gaps = gapList(t);
    return { label: "Data " + hkt(f.generated_at), cls: age <= 30 ? (gaps.length ? "warn" : "ok") : age <= 78 ? "warn" : "bad",
      title: "Public feed snapshot " + f.snapshot_id + " built " + hkt(f.generated_at) + " by " + f.runner + ". " + (gaps.length ? gaps.length + " intelligence gap(s): " + gaps.map(function (g) { return shortName(g.id) + " " + FS_LABEL[g.state].toLowerCase(); }).join(", ") : "All public sources fresh") + ". Click for Data Sources." };
  }
  function gapList(now) {
    return reg().filter(function (r) { return r.public && !r.needs_key; }).map(function (r) { return { id: r.id, state: fresh(r.id, now).state }; }).filter(function (g) { return g.state !== "fresh"; });
  }
  function marketHealth(h) { // dashboard side panel (open data only; index levels are vendor data → Live mode only)
    H = h; const u = usdhkd().best, liq = data("hkma_liquidity"), sofr = data("nyfed_sofr"), ust = data("ust_curve");
    const row = function (name, key, val, asOf) { return '<div class="kv"><span>' + name + '</span><span class="mono">' + (val === null ? '<span class="muted">—</span>' : '<a href="#" class="ev-link"' + key + ">" + val + "</a>") + ' <span class="muted">' + (asOf ? esc(String(asOf).slice(5).replace("-", "/")) : "") + "</span></span></div>"; };
    let html = row("USD/HKD", u ? ev("mh-usdhkd", "USD/HKD", u.value, "HKD per USD", u.id, u.date, u.derived) : "", u ? fmt(u.value, 4) : null, u && u.date) +
      row("HIBOR 1M", liq ? ev("mh-hibor1m", "HIBOR 1M fixing", liq.latest.hibor_1m, "% p.a.", "hkma_liquidity", liq.latest.date) : "", liq ? fmt(liq.latest.hibor_1m, 2) + "%" : null, liq && liq.latest.date) +
      row("SOFR", sofr ? ev("mh-sofr", "SOFR", sofr.latest.rate, "% p.a.", "nyfed_sofr", sofr.latest.date) : "", sofr ? fmt(sofr.latest.rate, 2) + "%" : null, sofr && sofr.latest.date) +
      row("US 10Y", ust ? ev("mh-10y", "US Treasury 10Y par yield", ust.latest["10Y"], "%", "ust_curve", ust.latest.date) : "", ust ? fmt(ust.latest["10Y"], 2) + "%" : null, ust && ust.latest.date);
    html += '<div class="kv"><span>HSI · S&amp;P 500</span><span class="muted mono" title="Index levels are vendor data – shown only in the owner\'s Live mode">Live mode only</span></div>';
    return html;
  }
  function attribution() {
    const f = feeds(), fred = src("fred");
    return "Public data: HKMA · NY Fed · US Treasury · Federal Reserve · ECB statistics · SEC EDGAR · GDELT · DATA.GOV.HK – credited on <a href=\"#sources\">Data Sources</a>." +
      (fred && fred.status === "ok" ? " " + esc(regOf("fred").attribution) : "") + (f ? "" : " (no feed snapshot loaded)");
  }

  /* ===== SECTION: HK MACRO & PEG PAGE ===== */
  function renderMacro(ctx) {
    H = ctx.h; EV = {};
    const now = Date.now(), f = feeds(), gaps = gapList(now);
    let html = '<div class="macro-top panel"><span class="panel-title">HK Macro &amp; Peg</span><span class="note">Openly licensed public data, fetched by GitHub Actions and committed to the repo. No vendor prices on this page.</span>' +
      '<span class="macro-meta mono">' + (f ? "Snapshot " + esc(f.snapshot_id) + " · built " + hkt(f.generated_at) : "No snapshot loaded") + "</span>" +
      '<a href="#sources" class="gap-chip ' + (gaps.length ? "has-gaps" : "no-gaps") + '" id="gap-chip" title="' + esc(gaps.map(function (g) { return shortName(g.id) + ": " + FS_LABEL[g.state]; }).join(" · ") || "All public sources fresh") + '">' +
      (gaps.length ? gaps.length + " intelligence gap" + (gaps.length === 1 ? "" : "s") : "No intelligence gaps") + "</a></div>";
    html += '<div class="grid">' + pegPanel() + aggPanel() + "</div>";
    html += '<div class="grid">' + spreadPanel() + curvePanel() + "</div>";
    html += '<div class="grid">' + themePanel(ctx.today) + eventsPanel(ctx.today) + "</div>";
    html += '<div class="grid">' + headlinesPanel() + "</div>";
    ctx.el.innerHTML = html;
    ctx.h.after(ctx.el, "macro");
  }
  function pegPanel() {
    const liq = data("hkma_liquidity"), u = usdhkd();
    const strong = liq ? liq.latest.cu_strong : Calc.PEG.strong, weak = liq ? liq.latest.cu_weak : Calc.PEG.weak;
    let body;
    if (!u.best) body = empty("fed_h10", "USD/HKD");
    else {
      const p = Calc.pegPosition(u.best.value, strong, weak), b = u.best;
      const pos = function (v) { return Math.max(0, Math.min(100, (v - 7.74) / (7.86 - 7.74) * 100)).toFixed(2); };
      const markers = u.list.map(function (c, i) {
        return '<span class="peg-mark m' + i + (c === b ? " best" : "") + '" style="left:' + pos(c.value) + '%" title="' + esc(c.label + " " + c.value + " · " + c.date) + '"></span>';
      }).join("");
      const zoneTxt = { "near-weak": "Near the weak-side CU", "near-strong": "Near the strong-side CU", inside: "Inside the band", "outside-weak": "Outside the band (weak side)", "outside-strong": "Outside the band (strong side)" }[p.zone];
      body = '<div class="peg-kpis">' +
        num("USD/HKD · " + esc(b.label), ev("peg-rate", "USD/HKD", b.value, "HKD per USD", b.id, b.date, b.derived, b.series && b.series[0]), fmt(b.value, 4), "as of " + fdate(b.date), "") +
        num("Position in band", ev("peg-pos", "Position in the 7.75–7.85 band", p.pctOfBand, "% of band from the strong side", b.id, b.date, "(" + b.value + " − " + strong + ") ÷ (" + weak + " − " + strong + ") × 100 = " + fx(p.pctOfBand, 1) + "%"), fmt(p.pctOfBand, 1) + "%", esc(zoneTxt), p.zone === "near-weak" || /outside/.test(p.zone) ? "amber" : "") +
        num("To weak-side CU " + fmt(weak, 2), ev("peg-pips", "Distance to the weak-side Convertible Undertaking", p.pipsToWeak, "pips (0.0001)", b.id, b.date, "(" + weak + " − " + b.value + ") × 10,000 = " + fx(p.pipsToWeak, 0) + " pips"), fmt(p.pipsToWeak, 0) + " pips", "to strong side " + fmt(p.pipsToStrong, 0) + " pips") +
        "</div>" +
        '<div class="peg-band" role="img" aria-label="USD/HKD ' + b.value + " in the " + strong + "–" + weak + ' band"><div class="peg-zone" style="left:' + pos(strong) + "%;right:" + (100 - pos(weak)) + '%"></div>' +
        '<span class="peg-tick" style="left:' + pos(strong) + '%"><b>' + fmt(strong, 2) + '</b> strong-side CU</span><span class="peg-tick mid" style="left:' + pos(7.8) + '%"><b>7.80</b></span><span class="peg-tick" style="left:' + pos(weak) + '%"><b>' + fmt(weak, 2) + "</b> weak-side CU</span>" + markers + "</div>" +
        '<div class="peg-legend">' + u.list.map(function (c, i) { return '<span><i class="peg-dot m' + i + '"></i>' + esc(c.label) + ' <a href="#" class="ev-link mono"' + ev("peg-c-" + c.id, "USD/HKD – " + c.label, c.value, "HKD per USD", c.id, c.date, c.derived) + ">" + fmt(c.value, 4) + "</a> " + '<span class="muted">' + esc(c.date) + "</span></span>"; }).join("") + "</div>" +
        '<div class="peg-spark"><span class="label">30-day path (' + esc(b.label) + ")</span>" + spark(chron(b.series, b.key), { w: 260, h: 40, lo: 7.80, hi: 7.85, label: "USD/HKD 30 days" }) + "</div>" +
        '<p class="note">The HKMA buys HK$ at the weak-side CU (7.85) and sells at the strong side (7.75). Weak-side trades drain the Aggregate Balance, which tends to lift HIBOR.</p>';
    }
    return '<div class="panel s8" id="peg-panel">' + H.phead("USD/HKD vs the 7.75–7.85 band", null, null, srcChip(["fed_h10", "ecb_fx", "hkma_liquidity"]) + badge(u.best ? u.best.id : "fed_h10")) + body + "</div>";
  }
  function aggPanel() {
    const liq = data("hkma_liquidity"); let body;
    if (!liq) body = empty("hkma_liquidity", "Aggregate Balance");
    else {
      const l = liq.latest, n20 = Math.max(1, Math.min(20, liq.series.length - 1)), c1 = Calc.seriesChange(liq.series, "agg_balance", 1), c5 = Calc.seriesChange(liq.series, "agg_balance", 5), c20 = Calc.seriesChange(liq.series, "agg_balance", n20);
      body = num("Aggregate Balance (closing)", ev("agg", "Aggregate Balance (closing)", l.agg_balance, "HKD million", "hkma_liquidity", l.date, "", l), "HK$" + fmt(l.agg_balance / 1000, 1) + "bn", "HK$ " + fmt(l.agg_balance, 0) + "m · as of " + fdate(l.date)) +
        '<div class="kv"><span>Change 1 day</span><span class="mono ' + H.tone(c1, 0) + '">' + (c1 === null ? "—" : fmtS(c1, 0) + "m") + '</span></div><div class="kv"><span>Change 5 days</span><span class="mono ' + H.tone(c5, 0) + '">' + (c5 === null ? "—" : fmtS(c5, 0) + "m") + "</span></div>" +
        (n20 > 5 ? '<div class="kv"><span>Change ' + n20 + ' days</span><span class="mono ' + H.tone(c20, 0) + '">' + (c20 === null ? "—" : fmtS(c20, 0) + "m") + "</span></div>" : "") +
        (liq.series.length > 1 ? '<div class="peg-spark">' + spark(chron(liq.series, "agg_balance"), { w: 220, h: 40, label: "Aggregate Balance 30 days" }) + "</div>" : '<p class="note">Only the latest day is in this snapshot; the 30-day history fills in on the next GitHub Actions run.</p>') +
        '<div class="kv"><span>Base rate</span><a href="#" class="ev-link mono"' + ev("base", "Base Rate (discount window)", l.base_rate, "% p.a.", "hkma_liquidity", l.date) + ">" + fmt(l.base_rate, 2) + '%</a></div><div class="kv"><span>HK$ TWI</span><a href="#" class="ev-link mono"' + ev("twi", "Trade-weighted HK$ index", l.twi, "index", "hkma_liquidity", l.date) + ">" + fmt(l.twi, 1) + "</a></div>";
    }
    return '<div class="panel s4" id="agg-panel">' + H.phead("Aggregate Balance", null, null, srcChip(["hkma_liquidity"]) + badge("hkma_liquidity")) + body + "</div>";
  }
  function spreadPanel() {
    const liq = data("hkma_liquidity"), sofr = data("nyfed_sofr"), effr = data("nyfed_effr"); let body;
    if (!liq || !sofr) body = empty(!liq ? "hkma_liquidity" : "nyfed_sofr", "HIBOR vs SOFR");
    else {
      const l = liq.latest, s = sofr.latest, on = Calc.spreadBp(l.hibor_on, s.rate), m1 = Calc.spreadBp(l.hibor_1m, s.rate);
      const hist = Calc.alignSpread(liq.series, "hibor_1m", sofr.series, "rate");
      body = '<div class="peg-kpis">' +
        num("HIBOR O/N", ev("hibor-on", "HIBOR overnight", l.hibor_on, "% p.a.", "hkma_liquidity", l.date), fmt(l.hibor_on, 2) + "%", fdate(l.date)) +
        num("HIBOR 1M fixing", ev("hibor-1m", "HIBOR 1-month fixing", l.hibor_1m, "% p.a.", "hkma_liquidity", l.date), fmt(l.hibor_1m, 3) + "%", fdate(l.date)) +
        num("SOFR", ev("sofr", "SOFR", s.rate, "% p.a.", "nyfed_sofr", s.date, "", s), fmt(s.rate, 2) + "%", fdate(s.date)) +
        num("EFFR", effr ? ev("effr", "Effective fed funds rate", effr.latest.rate, "% p.a.", "nyfed_effr", effr.latest.date, "Target range " + effr.latest.target_from + "–" + effr.latest.target_to + "%") : "", effr ? fmt(effr.latest.rate, 2) + "%" : "—", effr ? "target " + fmt(effr.latest.target_from, 2) + "–" + fmt(effr.latest.target_to, 2) + "%" : "") +
        "</div><div class=\"peg-kpis\">" +
        num("HIBOR 1M − SOFR", ev("spr-1m", "HIBOR 1M − SOFR", m1, "bp", "hkma_liquidity", l.date, "(" + l.hibor_1m + "% − " + s.rate + "%) × 100 = " + fx(m1, 1) + " bp · HIBOR " + l.date + ", SOFR " + s.date), fmtS(m1, 0) + " bp", "dates: HIBOR " + esc(l.date.slice(5)) + " · SOFR " + esc(s.date.slice(5)), H.tone(m1, 0)) +
        num("HIBOR O/N − SOFR", ev("spr-on", "HIBOR overnight − SOFR", on, "bp", "hkma_liquidity", l.date, "(" + l.hibor_on + "% − " + s.rate + "%) × 100 = " + fx(on, 1) + " bp"), fmtS(on, 0) + " bp", "overnight vs overnight", H.tone(on, 0)) +
        '<div class="mk"><div class="label">1M − SOFR, matched dates (' + hist.length + ')</div>' + spark(hist.map(function (x) { return x.bp; }), { w: 200, h: 40, zero: true, label: "HIBOR 1M minus SOFR, basis points" }) +
        '<div class="sub">' + (hist.length ? esc(hist[0].date.slice(5)) + " → " + esc(hist[hist.length - 1].date.slice(5)) + " · range " + fmt(Math.min.apply(null, hist.map(function (x) { return x.bp; })), 0) + " to " + fmt(Math.max.apply(null, hist.map(function (x) { return x.bp; })), 0) + " bp" : "no overlapping dates") + "</div></div></div>" +
        '<p class="note">A negative spread rewards borrowing HK$ to hold US$ (the carry trade), which pushes USD/HKD toward 7.85. HKMA and NY Fed publish on different calendars, so dates are shown.</p>';
    }
    return '<div class="panel s6" id="spread-panel">' + H.phead("HIBOR vs SOFR", null, null, srcChip(["hkma_liquidity", "nyfed_sofr"]) + badge("hkma_liquidity") + badge("nyfed_sofr")) + body + "</div>";
  }
  function curvePanel() {
    const ust = data("ust_curve"); let body;
    if (!ust) body = empty("ust_curve", "US Treasury curve");
    else {
      const l = ust.latest, p = ust.prev || {}, t = ust.tenors.filter(function (k) { return isFinite(l[k]); });
      const s210 = Calc.spreadBp(l["10Y"], l["2Y"]), s3m10 = Calc.spreadBp(l["10Y"], l["3M"]);
      body = '<div class="peg-kpis">' + num("10Y", ev("ust-10y", "US Treasury 10Y par yield", l["10Y"], "%", "ust_curve", l.date), fmt(l["10Y"], 2) + "%", fdate(l.date)) +
        num("2s10s", ev("ust-2s10s", "2s10s slope", s210, "bp", "ust_curve", l.date, "(10Y " + l["10Y"] + "% − 2Y " + l["2Y"] + "%) × 100 = " + fx(s210, 0) + " bp"), fmtS(s210, 0) + " bp", "10Y − 2Y", H.tone(s210, 0)) +
        num("3M–10Y", ev("ust-3m10y", "3M–10Y slope", s3m10, "bp", "ust_curve", l.date, "(10Y " + l["10Y"] + "% − 3M " + l["3M"] + "%) × 100 = " + fx(s3m10, 0) + " bp"), fmtS(s3m10, 0) + " bp", "10Y − 3M", H.tone(s3m10, 0)) + "</div>" +
        '<div class="curve">' + spark(t.map(function (k) { return l[k]; }), { w: 420, h: 70, label: "Par yield curve " + l.date, cls: "curve-svg" }) + "</div>" +
        '<div class="table-wrap"><table class="curve-t"><thead><tr><th class="l">Tenor</th>' + t.map(function (k) { return "<th>" + k + "</th>"; }).join("") + "</tr></thead><tbody>" +
        '<tr><td class="tk">' + esc(l.date.slice(5)) + "</td>" + t.map(function (k) { return "<td>" + fmt(l[k], 2) + "</td>"; }).join("") + "</tr>" +
        (p.date ? '<tr><td class="tk">Δ bp</td>' + t.map(function (k) { const d = Calc.spreadBp(l[k], p[k]); return '<td class="' + H.tone(d, 0) + '">' + (d === null ? "—" : fmtS(d, 0)) + "</td>"; }).join("") + "</tr>" : "") + "</tbody></table></div>";
    }
    return '<div class="panel s6" id="curve-panel">' + H.phead("US Treasury par curve", null, null, srcChip(["ust_curve"]) + badge("ust_curve")) + body + "</div>";
  }
  function themePanel() {
    const g = data("gdelt"); let body;
    if (!g) body = empty("gdelt", "Theme radar");
    else {
      body = '<div class="table-wrap"><table class="theme-t"><thead><tr><th class="l">Theme</th><th class="l">30 days</th><th>Latest</th><th>Avg</th><th>z</th><th class="l"></th></tr></thead><tbody>' +
        g.themes.map(function (t) {
          if (!t.series || t.series.length < 3) return '<tr><td class="l">' + esc(t.label) + '</td><td class="l muted" colspan="5">no data this run</td></tr>';
          const counts = t.series.map(function (d) { return d.count; }), z = Calc.zScore(counts), last = t.series[t.series.length - 1];
          return '<tr><td class="l">' + esc(t.label) + '</td><td class="l">' + spark(counts, { w: 110, h: 22, label: t.label }) + "</td><td>" + fmt(z.latest, 0) + "</td><td>" + fmt(z.mean, 0) + '</td><td><a href="#" class="ev-link"' +
            ev("z-" + t.id, "GDELT z-score – " + t.label, z.z, "SD vs prior " + (counts.length - 1) + " days", "gdelt", last.date, "z = (" + z.latest + " − mean " + fx(z.mean, 1) + ") ÷ SD " + fx(z.sd, 1) + " = " + fx(z.z, 2) + " · query: " + t.query) + ">" + fmtS(z.z, 1) + '</a></td><td class="l">' + (z.z >= 2 ? '<span class="badge b-flag">SPIKE</span>' : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      const arts = g.themes.filter(function (t) { return t.articles && t.articles.length; });
      if (arts.length) body += '<div class="label" style="margin-top:8px">Top links (busiest themes)</div><ul class="hl">' + arts.map(function (t) { return t.articles.slice(0, 2).map(function (a) { return '<li><span class="hl-src">' + esc(t.label) + '</span><a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">' + esc(a.title) + '</a> <span class="muted">' + esc(a.domain) + "</span></li>"; }).join(""); }).join("") + "</ul>";
      body += '<p class="note">z = latest daily article count vs the earlier days\' mean and SD. Spike = z ≥ 2 (plan v3 Idea Lab trigger).</p>';
    }
    return '<div class="panel s6" id="theme-panel">' + H.phead("Theme radar", null, null, srcChip(["gdelt"]) + badge("gdelt")) + body + "</div>";
  }
  function eventsPanel(today) {
    const fomc = data("fomc_calendar"), sec = data("sec_filings"), atom = data("sec_8k_atom"); let body = "";
    if (fomc) {
      const n = Calc.nextMeeting(fomc.meetings, today), rest = fomc.meetings.filter(function (m) { return m.end >= today; }).slice(1, 4);
      body += '<div class="kv"><span>Next FOMC</span><span class="mono">' + (n ? '<a href="#" class="ev-link"' + ev("fomc", "Next FOMC meeting", n.label, "", "fomc_calendar", fomc.meetings.length ? n.start : null, "Parsed from the Federal Reserve FOMC calendar page" + (n.sep ? " · with Summary of Economic Projections" : "")) + ">" + fdate(n.start) + (n.end !== n.start ? "–" + n.end.slice(8) : "") + "</a> · in " + daysTo(n.start, today) + " days" + (n.sep ? " · SEP" : "") : "—") + "</span></div>" +
        (rest.length ? '<div class="kv"><span>Then</span><span class="mono muted">' + rest.map(function (m) { return esc(m.label); }).join(" · ") + "</span></div>" : "");
    } else body += empty("fomc_calendar", "FOMC calendar");
    if (sec) {
      body += '<div class="label" style="margin-top:8px">Latest SEC filings – demo US names</div><div class="table-wrap"><table><thead><tr><th class="l">Ticker</th><th class="l">Form</th><th>Filed</th><th class="l">Link</th></tr></thead><tbody>' +
        sec.companies.map(function (c) { const x = c.filings[0]; return x ? '<tr><td class="tk">' + esc(c.symbol.replace(/\.US$/, "")) + '</td><td class="l">' + esc(x.form) + (x.items ? ' <span class="muted">' + esc(x.items) + "</span>" : "") + "</td><td>" + esc(x.filed) + '</td><td class="l"><a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">EDGAR ↗</a></td></tr>' : ""; }).join("") + "</tbody></table></div>";
    } else body += empty("sec_filings", "SEC filings");
    if (atom) body += '<div class="label" style="margin-top:8px">Latest 8-Ks, all filers</div><ul class="hl">' + atom.entries.slice(0, 5).map(function (e) { return '<li><span class="hl-t mono">' + esc(hkt(e.time).replace(" HKT", "")) + '</span><a href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">' + esc(e.company) + "</a> " + '<span class="muted">' + esc(e.form) + "</span></li>"; }).join("") + "</ul>";
    return '<div class="panel s6" id="events-panel">' + H.phead("Events &amp; filings", null, null, srcChip(["fomc_calendar", "sec_filings"]) + badge("fomc_calendar") + badge("sec_filings")) + body + "</div>";
  }
  function headlinesPanel() {
    const ids = ["rss_hkgov", "rss_rthk", "rss_scmp", "rss_fed", "rss_sec"];
    const cols = ids.map(function (id) {
      const d = data(id), r = regOf(id);
      return '<div class="hl-col"><div class="hl-head"><b>' + esc(shortName(id)) + '</b><span class="tier t' + r.tier + '" title="Tier ' + r.tier + '">T' + r.tier + "</span>" + (r.state_affiliated ? '<span class="tier sa" title="State-affiliated media">STATE-AFFIL.</span>' : "") + badge(id) + "</div>" +
        (d ? '<ul class="hl">' + d.items.slice(0, 5).map(function (i) { return '<li><span class="hl-t mono">' + esc(i.time ? hkt(i.time).replace(" HKT", "") : "") + '</span><a href="' + esc(i.url) + '" target="_blank" rel="noopener noreferrer">' + esc(i.title) + "</a></li>"; }).join("") + "</ul>" : empty(id, "Headlines")) + "</div>";
    }).join("");
    return '<div class="panel s12" id="headlines-panel">' + H.phead("Headlines", null, null, '<span class="note">Headline, time and link only – articles open on the publisher\'s site</span>') + '<div class="hl-grid">' + cols + "</div></div>";
  }

  /* ===== SECTION: EVIDENCE INSPECTOR (number → source) ===== */
  function openEvidence(key) {
    const e = EV[key]; if (!e || !window.WT_APP) return false;
    const r = regOf(e.source), s = src(e.source), f = feeds(), fr = fresh(e.source);
    const rows = [["Value", '<b class="mono">' + esc(typeof e.value === "number" ? String(+e.value.toFixed(6)).replace("-", "\u2212") : e.value) + "</b> " + esc(e.unit || "")], ["Source", esc(r.name) + ' <span class="tier t' + r.tier + '">T' + r.tier + "</span>"],
      ["As of", esc(e.as_of || "—")], ["Fetched", s ? esc(hkt(s.last_ok_at || s.fetched_at)) + (s.status === "error" ? ' <span class="err">(latest attempt failed: ' + esc(s.error) + ")</span>" : "") : "—"],
      ["Freshness", badge(e.source)], ["Snapshot", f ? '<span class="mono">' + esc(f.snapshot_id) + "</span>" : "—"],
      ["Dataset", s && s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer" class="mono ev-url">' + esc(s.url) + "</a>" : "—"],
      ["Licence", esc(r.licence || "") + (r.licence_url ? ' · <a href="' + esc(r.licence_url) + '" target="_blank" rel="noopener noreferrer">terms ↗</a>' : "")], ["Attribution", esc(r.attribution || "")]];
    if (s && s.seed_note) rows.push(["Note", '<span class="note">' + esc(s.seed_note) + "</span>"]);
    if (e.derivation) rows.splice(1, 0, ["Derivation", '<span class="mono">' + esc(e.derivation) + "</span>"]);
    const html = '<table class="ev-t">' + rows.map(function (x) { return '<tr><th class="l">' + x[0] + '</th><td class="l">' + x[1] + "</td></tr>"; }).join("") + "</table>" +
      (e.record ? '<details class="ev-raw"><summary>Raw record</summary><pre class="mono">' + esc(JSON.stringify(e.record, null, 1)) + "</pre></details>" : "") +
      '<p class="note">Every public figure links back to its open-data source. Freshness: ' + esc(FS_LABEL[fr.state]) + (fr.fetchAgeH !== null && isFinite(fr.fetchAgeH) ? " · fetched " + fmt(fr.fetchAgeH, 1) + " h ago" : "") + ".</p>";
    window.WT_APP.modal("Evidence · " + esc(e.label), html, '<span class="src-chip">' + esc(shortName(e.source)) + '</span><span class="asof">as of ' + esc(e.as_of || "—") + "</span>");
    return true;
  }
  document.addEventListener("click", function (e) {
    const a = e.target.closest && e.target.closest("[data-ev]"); if (!a) return;
    e.preventDefault(); e.stopPropagation(); openEvidence(a.getAttribute("data-ev"));
  }, true);

  /* ===== SECTION: DATA SOURCES PAGE ===== */
  function renderSources(ctx) {
    H = ctx.h; EV = {};
    const f = feeds(), now = Date.now(), health = f && f.health;
    const hmap = {}; if (health && health.results) health.results.forEach(function (x) { hmap[x.id] = x; });
    const rows = reg().map(function (r) {
      const s = src(r.id), h = hmap[r.id];
      return '<tr data-src="' + esc(r.id) + '"><td class="l"><span class="tier t' + r.tier + '">T' + r.tier + "</span>" + (r.state_affiliated ? ' <span class="tier sa" title="State-affiliated media">SA</span>' : "") + '</td><td class="l"><a href="' + esc(r.home) + '" target="_blank" rel="noopener noreferrer">' + esc(r.name) + '</a><div class="note">' + esc(r.used_in) + '</div></td><td class="l note">' + esc(r.licence) + (r.licence_url ? ' <a href="' + esc(r.licence_url) + '" target="_blank" rel="noopener noreferrer">↗</a>' : "") + '<div class="attr">' + esc(r.attribution) + '</div></td><td class="l note">' + esc(r.display) + "</td>" +
        '<td class="l">' + (r.public ? badge(r.id, now) : '<span class="fresh-badge fs-disabled" title="Vendor data – never in the public snapshot">LIVE ONLY</span>') + '</td><td class="mono">' + (s && s.as_of ? esc(s.as_of) : "—") + '</td><td class="mono">' + (s && s.last_ok_at ? esc(hkt(s.last_ok_at)) : "—") + "</td>" +
        '<td class="l mono">' + (h ? '<span class="' + (h.ok ? "pos" : "neg") + '">' + (h.ok ? "OK" : "FAIL") + "</span> " + esc(h.status || "") + " · " + esc(h.ms) + " ms" : '<span class="muted">' + (r.public ? "not checked" : "Worker") + "</span>") + "</td></tr>";
    }).join("");
    const dg = data("datagovhk");
    ctx.el.innerHTML = '<div class="panel" id="sources-panel">' + H.phead("Data Sources – tiered feed registry", null, null, '<span class="note mono">' + (f ? "Snapshot " + esc(f.snapshot_id) + " · built " + esc(hkt(f.generated_at)) + " · " + esc(f.runner) : "No snapshot loaded") + "</span>") +
      '<div class="table-wrap"><table class="src-t"><thead><tr><th class="l">Tier</th><th class="l">Source · used for</th><th class="l">Licence · attribution</th><th class="l">Display rule</th><th class="l">Freshness</th><th>As of</th><th>Fetched</th><th class="l">Weekly health</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="note">Tier 1 = official statistics or regulator · Tier 2 = established publisher (headlines only) · Tier 3 = aggregated / derived signal · Tier 4 = vendor data, owner\'s Live mode only. SA = state-affiliated media. ' +
      "Weekly health = credential-free check by .github/workflows/source-health.yml" + (health && health.checked_at ? " (last run " + esc(hkt(health.checked_at)) + ")" : "") + ". Licence notes marked [U] are unconfirmed – recheck before relying on them.</p></div>" +
      '<div class="grid"><div class="panel s6">' + H.phead("What is real, what is demo", null, null) +
      '<div class="table-wrap"><table><tbody><tr><td class="l">Portfolio, prices, P&amp;L</td><td class="l">Demo seed – illustrative, not real holdings</td></tr><tr><td class="l">Value-chain figures</td><td class="l">Illustrative mapping – not a forecast</td></tr>' +
      '<tr><td class="l">HK Macro &amp; Peg, headlines, filings, themes</td><td class="l">Real public data, snapshot above, refreshed by GitHub Actions</td></tr><tr><td class="l">HK / US live prices</td><td class="l">Owner-only Live mode via a private Worker (vendor terms forbid public display)</td></tr></tbody></table></div></div>' +
      '<div class="panel s6">' + H.phead("Related HK open datasets", null, null, srcChip(["datagovhk"]) + badge("datagovhk")) +
      (dg ? '<ul class="hl">' + dg.datasets.slice(0, 8).map(function (d) { return '<li><a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.title) + '</a> <span class="muted">' + esc(d.org) + "</span></li>"; }).join("") + "</ul>" : empty("datagovhk", "DATA.GOV.HK")) + "</div></div>";
    ctx.h.after(ctx.el, "sources");
  }

  /* ===== SECTION: REGISTER ===== */
  window.WT_FEEDS_UI = { dataChip: dataChip, marketHealth: marketHealth, attribution: attribution, gaps: gapList, usdhkd: usdhkd, evidence: openEvidence, evKeys: function () { return Object.keys(EV); } };
  window.WT_MODULES = window.WT_MODULES || [];
  window.WT_MODULES.push({ id: "macro", render: renderMacro });
  window.WT_MODULES.push({ id: "sources", render: renderSources });
})();

// END OF FILE: macro.js
