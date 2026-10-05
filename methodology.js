// methodology.js – Winston Terminal v5: Methodology page (#methodology). Rendering only; no maths, no storage.
// v4: flow-sanity line reports the live warning count (0 after the 5 Oct 2026 rebalance).
// v5: public open-data feeds (data/feeds.js), header data chip, owner-only Live mode, updated limits/privacy lines.
// Explains data sources, formulas, rules, checks, limits and privacy. Live values (thresholds, check results) come from ctx.
// Registers itself in window.WT_MODULES; app.js calls render(ctx) when the route is #methodology.

(function () {
  "use strict";

  /* ===== SECTION: SMALL HELPERS ===== */
  function sec(title, src, body) { return '<div class="panel meth-sec">' + H.phead(title, src) + body + "</div>"; }
  function list(items) { return "<ul>" + items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>"; }
  function code(s) { return '<code class="mono">' + s + "</code>"; }
  function checkRows(checks) {
    return checks.map(function (c) { return '<div class="check">' + H.badge(c.pass ? "PASS" : "FAIL") + "<span>" + c.id + ". " + H.esc(c.label) + '</span><span class="d">' + H.esc(c.detail || "") + "</span></div>"; }).join("");
  }
  let H = null;

  /* ===== SECTION: PAGE ===== */
  function render(ctx) {
    H = ctx.h;
    const s = ctx.settings, m = ctx.model, dq = ctx.dq || {}, vc = dq.vc, demo = ctx.mode === "demo";
    let html = '<div class="panel meth-head"><span class="vc-title">METHODOLOGY</span><span class="note">How every number on this terminal is produced</span>' +
      '<span class="dq-chip mono ' + (m.checksPassed === 7 ? "ok" : "bad") + '">Checks ' + m.checksPassed + "/7 " + (m.checksPassed === 7 ? "✓" : "✗") + "</span>" +
      (vc ? '<span class="dq-chip mono ' + (vc.ok ? "ok" : "bad") + '">' + H.esc(vc.label) + "</span>" : "") +
      (dq.fresh ? '<span class="dq-chip mono ' + dq.fresh.cls + '">' + H.esc(dq.fresh.label) + "</span>" : "") + "</div>";
    html += '<div class="grid meth-grid"><div class="s6 stack">';

    html += sec("1. What this is", null, "<p>A personal HK/US portfolio cockpit that runs entirely in your browser. Two modes:</p>" + list([
      "<b>Demo portfolio</b> – a fixed seed of made-up holdings and prices (" + code("data.js") + "). Price edits stay in this browser until Reset demo data.",
      "<b>My Portfolio</b> – your own transactions, saved only in this browser's localStorage under keys starting " + code("winstonTerminal.v1.") + "."]) +
      '<p class="note">Showing now: ' + (demo ? "Demo portfolio (illustrative prices)." : "My Portfolio.") + " Personal research tool. Not investment advice.</p>");

    html += sec("2. Data sources and as-of", "source chips", list([
      "Every panel header shows a <b>source chip</b> (Demo seed, My Portfolio, calc.js, VC_DATA) and an <b>as-of</b> stamp: the latest price date, or the HKT time of the last recalculation.",
      "Portfolio prices are typed in or imported from CSV (or, for the owner only, fetched in <b>Live mode</b> through a private Cloudflare Worker – never shown to visitors, never saved).",
      "Macro and news come from <b>openly licensed public feeds</b> (HKMA, NY Fed, US Treasury, Federal Reserve, ECB, SEC EDGAR, GDELT, headlines), fetched by GitHub Actions into " + code("data/feeds.js") + ". Every figure links to its source, as-of date, fetch time and snapshot id – see <a href=\"#sources\">Data Sources</a>.",
      "USD/HKD uses one manual rate (" + H.fmt(s.usd_hkd_rate, 4) + ", as of " + H.fdate(s.rate_as_of) + ") set on Rules &amp; Settings.",
      "Header chip <b>Data DD Mon HH:MM HKT</b> = when the public feed snapshot was built (green ≤ 30 h, amber with gaps or ≤ 78 h, red older). My Portfolio appends its price status (<b>Fresh</b> = every price dated today HKT, <b>Stale</b> = oldest price date).",
      "Feed freshness badges: FRESH · STALE · VERY STALE · NO DATA · ERROR · OFF, from the fetch age against each source's cadence and the as-of date against its normal publication lag (" + code("Calc.feedFreshness") + ")."]) +
      '<p class="note">What is real and what is demo:</p><div class="table-wrap"><table class="meth-table"><thead><tr><th>Item</th><th>Status</th></tr></thead><tbody>' +
      [["Holdings, quantities, prices (Demo portfolio)", "Demo – made up, illustrative"],
       ["Company names, tickers, value-chain node mapping", "Real"],
       ["Value-chain numbers (revenue, margins, link weights, exposures)", "Demo – illustrative, not real financials"],
       ["USD/HKD rate", "Manual input (" + H.fmt(s.usd_hkd_rate, 4) + ")"],
       ["All calculations and data checks", "Real code: calc.js / vc-calc.js, recalculated on every change"],
       ["HK Macro &amp; Peg, headlines, filings, theme radar", "Real public data (snapshot in data/feeds.js, credited on Data Sources)"],
       ["Live prices (EODHD HK, Finnhub US)", "Real, owner-only behind a passphrase; vendor terms forbid public display"]]
        .map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table></div>");

    html += sec("3. Formulas (calc.js, average-cost method)", "calc.js", list([
      code("BUY") + ": qty += q; cost += q × price + fees",
      code("SELL") + ": realised += q × (price − avg cost) − fees; cost −= q × avg cost; qty −= q",
      code("DIV") + ": income += q × dividend per share − fees · " + code("FEE") + ": income −= q × price + fees",
      "Avg cost = cost ÷ qty · Value local = qty × last price · Value HKD = value local × FX (HKD 1, USD " + H.fmt(s.usd_hkd_rate, 4) + ")",
      "Unrealised = value − cost (and % of cost) · Weight = value HKD ÷ total value HKD × 100",
      "Full precision inside; numbers are rounded only for display or export."]));

    html += sec("4. Rules (live thresholds)", "Rules &amp; Settings", list([
      '<span class="badge b-flag">FLAG</span> weight above ' + s.max_weight_pct + "%, or last price more than " + s.max_drawdown_pct + "% below average cost",
      '<span class="badge b-watch">WATCH</span> weight above ' + s.watch_weight_pct + "%, or more than " + s.watch_drawdown_pct + "% below average cost (and not flagged)",
      "Colour contract: green / red = up / down only · amber = focus and WATCH · red chip = FLAG · teal = neutral metric. ▲ / ▼ always sit beside the colour."]));
    html += "</div><div class=\"s6 stack\">";

    html += sec("5. Data checks", "calc.js · vc-calc.js", '<p class="note">Phase 1 checks (header ' + m.checksPassed + "/7) – recalculated on every change:</p>" + checkRows(m.checks) +
      (vc && vc.checks ? '<p class="note">Value Chain checks (header ' + H.esc(vc.label) + "):</p>" + checkRows(vc.checks) : ""));

    html += sec("6. Value Chain model", "VC_DATA · illustrative", "<p>" + (typeof VC_DISCLAIMER === "string" ? H.esc(VC_DISCLAIMER) : "Illustrative linear model. Not a forecast.") + "</p>" + list([
      "Company names, tickers and node mapping are real; every number (revenue, margins, multiples, link weights, exposures) is illustrative demo data.",
      "A shock moves revenue and margin at the target, then passes to suppliers and customers along modelled links (weight × pass-through, up to the max hops).",
      "Portfolio impact = elasticity × Σ(exposure × ΔGP %) per holding, × holding value. Deterministic: the same inputs always give the same result.",
      "Supply Chain view (Bloomberg SPLC-style): link flow = w × supplier revenue; % of supplier revenue = w; % of customer cost = flow ÷ customer COGS (hyperscalers buy servers as capex, so no %). Shock colours reuse the same propagation paths.",
      "Flow sanity warnings (not checks): W1 modelled sales above AI revenue; W2 modelled purchases above AI COGS. The v4 demo weights were rebalanced on 5 Oct 2026 (six link weights trimmed, Quanta AI exposure 60% → 78%) so every flow fits: " +
        (typeof VCCalc !== "undefined" && VCCalc.flowChecks ? (function (n) { return n ? n + " warning" + (n === 1 ? "" : "s") + " now." : "0 warnings now."; })(VCCalc.flowChecks(VC_DATA).length) : "see the Supply Chain tab.")]));

    html += sec("7. Limitations", null, list([
      "Public pages have no live prices (vendor licences); no corporate actions (splits, rights, scrip dividends) and no intraday history.",
      "HKMA's monthly bulletin series lag about a month; Fed H.10 is weekly; the ECB USD/HKD is a derived cross. Each is shown with its own as-of date.",
      "One USD/HKD rate for every date; no historical FX.",
      "Value Chain effects are a lower bound (only modelled links) and are not forecasts."]));

    html += sec("8. Privacy and disclaimer", null, list([
      "No accounts, cookies or trackers, and no API key in the page or the repo. Portfolio data never leaves this browser unless you export it.",
      "Outside calls: Chart.js 4.4.4 (jsDelivr CDN) and Google Fonts. Public feeds are pre-fetched by GitHub Actions, so visitors' browsers call no data API. Live mode (owner only) calls only the owner's Worker.",
      "Personal research tool. Not investment advice. Demo figures are illustrative, not real holdings or financials."]));

    html += sec("9. Version", null, '<p class="mono">Winston Terminal ' + H.esc(ctx.version || "") + " · build " + H.fdate(ctx.build) + " · Chart.js 4.4.4 · Inter + JetBrains Mono</p>");
    html += "</div></div>";
    ctx.el.innerHTML = html;
    if (H.after) H.after(ctx.el, "meth");
  }

  /* ===== SECTION: MODULE REGISTRATION (used by app.js) ===== */
  window.WT_MODULES = window.WT_MODULES || [];
  window.WT_MODULES.push({ id: "methodology", render: render });
})();

// END OF FILE: methodology.js
