// scripts/fetch-feeds.js – Winston Terminal v5 (Phase 3): fetch the public, openly licensed feeds and write data/.
// Run by GitHub Actions on a schedule (.github/workflows/feeds.yml) or by hand:  node scripts/fetch-feeds.js [id ...]
// Node 20+, no dependencies. Each fetcher is a query → extract → transform triad (pattern reimplemented, not copied).
// Output: data/public/<id>.json per source and the bundle data/feeds.js (window.WT_FEEDS) that index.html loads.
// Env (all optional): SEC_USER_AGENT (SEC asks for "Name email"), FRED_API_KEY (enables US CPI), FEEDS_RUNNER (label).
// Vendor price keys (EODHD, Finnhub) are NEVER used here – vendor data stays in the passphrase-gated Worker.

"use strict";
const path = require("path");
const L = require("./lib.js");
const REG = require(path.join(L.ROOT, "feeds-registry.js"));

/* ===== SECTION: SETTINGS ===== */
const SEC_UA = process.env.SEC_USER_AGENT || "WinstonTerminal admin@example.com"; // set the repo variable SEC_USER_AGENT to "Your Name your@email"
const HKMA = "https://api.hkma.gov.hk/public/market-data-and-statistics/";
const KEEP_DAYS = 30;
function num(x) { const v = typeof x === "number" ? x : parseFloat(String(x).replace(/,/g, "")); return isFinite(v) ? v : null; }
function byDateDesc(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }
function ok(url, as_of, data, extra) { return Object.assign({ status: "ok", url: url, as_of: as_of, data: data }, extra || {}); }
function fail(url, r) { return { status: "error", url: url, error: typeof r === "string" ? r : L.httpError(r), http: r && r.status || null }; }
async function getJSON(url, opts) { const r = await L.get(url, opts); if (!r.ok) return { r: r }; try { return { r: r, j: JSON.parse(r.body) }; } catch (e) { return { r: Object.assign({}, r, { ok: false, error: "not JSON: " + r.body.slice(0, 80) }) }; } }

/* ===== SECTION: HKMA (3 datasets) ===== */
async function hkmaRecords(ds, n) {
  const url = HKMA + ds + "?pagesize=" + n;
  await L.sleep(3000); // HKMA's gateway (a WAF) blocks bursts – space the calls out
  const x = await getJSON(url, { retries: 3, backoff: 15000 });
  if (!x.j) return { url: url, err: x.r };
  if (!x.j.header || !x.j.header.success) return { url: url, err: "HKMA error " + JSON.stringify(x.j.header || {}).slice(0, 120) };
  return { url: url, records: (x.j.result && x.j.result.records) || [] };
}
const FETCHERS = {
  hkma_liquidity: async function () {
    const q = await hkmaRecords("daily-monetary-statistics/daily-figures-interbank-liquidity", KEEP_DAYS + 10);
    if (q.err) return fail(q.url, q.err);
    const series = q.records.map(function (r) {
      return { date: r.end_of_date, agg_balance: num(r.closing_balance), opening_balance: num(r.opening_balance), hibor_on: num(r.hibor_overnight), hibor_1m: num(r.hibor_fixing_1m),
        cu_strong: num(r.cu_strongside), cu_weak: num(r.cu_weakside), base_rate: num(r.disc_win_base_rate), twi: num(r.twi), efbn_outstanding: num(r.outstanding_efbn || r.efbn_outstanding) };
    }).filter(function (r) { return r.date; }).sort(byDateDesc).slice(0, KEEP_DAYS);
    if (!series.length) return fail(q.url, "no records");
    return ok(q.url, series[0].date, { latest: series[0], series: series, unit_agg_balance: "HKD million", unit_rates: "% p.a." });
  },
  hkma_er: async function () {
    const q = await hkmaRecords("monthly-statistical-bulletin/er-ir/er-eeri-daily", 40);
    if (q.err) return fail(q.url, q.err);
    const series = q.records.map(function (r) { return { date: r.end_of_day, usd_hkd: num(r.usd), eeri: num(r.eeri) }; }).filter(function (r) { return r.date && r.usd_hkd; }).sort(byDateDesc).slice(0, KEEP_DAYS);
    if (!series.length) return fail(q.url, "no records");
    return ok(q.url, series[0].date, { latest: series[0], series: series, note: "HKD per USD, published in the HKMA Monthly Statistical Bulletin (lags about one month)" });
  },
  hkma_hibor: async function () {
    const q = await hkmaRecords("monthly-statistical-bulletin/er-ir/hk-interbank-ir-daily", 40);
    if (q.err) return fail(q.url, q.err);
    const series = q.records.map(function (r) {
      const o = { date: r.end_of_day }; Object.keys(r).forEach(function (k) { if (/^ir_/.test(k)) o[k.replace(/^ir_/, "")] = num(r[k]); }); return o;
    }).filter(function (r) { return r.date; }).sort(byDateDesc).slice(0, KEEP_DAYS);
    if (!series.length) return fail(q.url, "no records");
    return ok(q.url, series[0].date, { latest: series[0], series: series, unit: "% p.a.", note: "HIBOR fixings by tenor (Monthly Statistical Bulletin, lags about one month)" });
  },

  /* ===== SECTION: NEW YORK FED (SOFR, EFFR) ===== */
  nyfed_sofr: async function () { return nyfed("https://markets.newyorkfed.org/api/rates/secured/sofr/last/" + KEEP_DAYS + ".json"); },
  nyfed_effr: async function () { return nyfed("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/" + KEEP_DAYS + ".json"); },

  /* ===== SECTION: US TREASURY PAR YIELD CURVE (XML) ===== */
  ust_curve: async function () {
    const year = new Date().getUTCFullYear();
    let entries = [], url = "";
    for (const y of [year, year - 1]) {
      url = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=" + y;
      const r = await L.get(url, { timeout: 60000 });
      if (!r.ok) return fail(url, r);
      entries = entries.concat(L.blocks(r.body, "m:properties").map(function (b) {
        const o = { date: L.tag(b, "d:NEW_DATE").slice(0, 10) };
        [["1M", "BC_1MONTH"], ["2M", "BC_2MONTH"], ["3M", "BC_3MONTH"], ["4M", "BC_4MONTH"], ["6M", "BC_6MONTH"], ["1Y", "BC_1YEAR"], ["2Y", "BC_2YEAR"], ["3Y", "BC_3YEAR"],
          ["5Y", "BC_5YEAR"], ["7Y", "BC_7YEAR"], ["10Y", "BC_10YEAR"], ["20Y", "BC_20YEAR"], ["30Y", "BC_30YEAR"]].forEach(function (p) { o[p[0]] = num(L.tag(b, "d:" + p[1])); });
        return o;
      }));
      if (entries.length >= KEEP_DAYS) break;
    }
    entries = entries.filter(function (e) { return e.date; }).sort(byDateDesc);
    if (!entries.length) return fail(url, "no curve entries");
    const tenors = ["1M", "2M", "3M", "4M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"];
    return ok(url, entries[0].date, { tenors: tenors, latest: entries[0], prev: entries[1] || null,
      series: entries.slice(0, KEEP_DAYS).map(function (e) { return { date: e.date, "2Y": e["2Y"], "10Y": e["10Y"], "3M": e["3M"] }; }), unit: "% (par yield, bond-equivalent)" });
  },

  /* ===== SECTION: FED H.10 (USD/HKD noon buying rate) ===== */
  fed_h10: async function () {
    const url = REG.registry.find(function (r) { return r.id === "fed_h10"; }).url;
    const r = await L.get(url, { timeout: 45000 });
    if (!r.ok) return fail(url, r);
    const rows = L.parseCSV(r.body), head = rows[0] || [], col = head.indexOf("Hong Kong Dollar");
    if (col < 0) return fail(url, "HKD column not found");
    const series = rows.filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x[0]); }).map(function (x) { return { date: x[0], usd_hkd: num(x[col]) }; })
      .filter(function (x) { return x.usd_hkd; }).sort(byDateDesc);
    if (!series.length) return fail(url, "no observations");
    return ok(url, series[0].date, { latest: series[0], series: series, note: "HKD per USD, noon buying rate in New York (H.10, released weekly)" });
  },

  /* ===== SECTION: ECB REFERENCE RATES → USD/HKD cross (derived) ===== */
  ecb_fx: async function () {
    const url = REG.registry.find(function (r) { return r.id === "ecb_fx"; }).url;
    const r = await L.get(url, { timeout: 60000 });
    if (!r.ok) return fail(url, r);
    const rows = L.parseCSV(r.body), h = rows[0] || [], iK = h.indexOf("KEY"), iT = h.indexOf("TIME_PERIOD"), iV = h.indexOf("OBS_VALUE");
    if (iK < 0 || iT < 0 || iV < 0) return fail(url, "unexpected CSV header");
    const by = {};
    rows.slice(1).forEach(function (x) { const d = x[iT], ccy = /EXR\.D\.(\w+)\.EUR/.exec(x[iK]); if (!d || !ccy) return; by[d] = by[d] || { date: d }; by[d][ccy[1].toLowerCase() + "_per_eur"] = num(x[iV]); });
    const series = Object.keys(by).map(function (d) { const o = by[d]; o.usd_hkd_cross = o.hkd_per_eur && o.usd_per_eur ? Math.round(o.hkd_per_eur / o.usd_per_eur * 1e5) / 1e5 : null; return o; })
      .filter(function (o) { return o.usd_hkd_cross; }).sort(byDateDesc);
    if (!series.length) return fail(url, "no observations");
    return ok(url, series[0].date, { latest: series[0], series: series, note: "Derived: USD/HKD = (HKD per EUR) ÷ (USD per EUR), ECB 14:15 CET reference rates" });
  },

  /* ===== SECTION: FOMC CALENDAR (HTML) ===== */
  fomc_calendar: async function () {
    const url = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
    const r = await L.get(url, { timeout: 45000 });
    if (!r.ok) return fail(url, r);
    const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const meetings = [], yearRe = /(\d{4}) FOMC Meetings/g; let m; const marks = [];
    while ((m = yearRe.exec(r.body))) marks.push({ year: +m[1], at: m.index });
    marks.forEach(function (mk, i) {
      const seg = r.body.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : r.body.length);
      const re = /fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g; let x;
      while ((x = re.exec(seg))) {
        const months = x[1].trim().split("/"), dtxt = x[2].trim(), sep = /\*/.test(dtxt), days = dtxt.replace(/[^\d-]/g, "").split("-").filter(Boolean);
        if (!days.length || /notation/i.test(dtxt)) continue;
        const m1 = MON[months[0].slice(0, 3).toLowerCase()], m2 = MON[(months[1] || months[0]).slice(0, 3).toLowerCase()];
        if (!m1) continue;
        const pad = function (n) { return String(n).padStart(2, "0"); };
        const start = mk.year + "-" + pad(m1) + "-" + pad(days[0]), endDay = days[1] || days[0], end = mk.year + "-" + pad(days[1] && +days[1] < +days[0] ? m2 : m1 === m2 ? m1 : m2) + "-" + pad(endDay);
        meetings.push({ start: start, end: end, sep: sep, label: x[1].trim() + " " + dtxt.replace("*", "") });
      }
    });
    const uniq = {}; meetings.forEach(function (x) { uniq[x.start] = x; });
    const list = Object.keys(uniq).sort().map(function (k) { return uniq[k]; });
    if (!list.length) return fail(url, "no meetings parsed");
    return ok(url, new Date().toISOString().slice(0, 10), { meetings: list, note: "* = meeting with a Summary of Economic Projections" });
  },

  /* ===== SECTION: SEC EDGAR (company submissions + latest 8-K Atom) ===== */
  sec_filings: async function () {
    const FORMS = ["8-K", "10-Q", "10-K", "20-F", "6-K", "DEF 14A"], out = [], errs = [];
    for (const c of REG.ciks) {
      const url = "https://data.sec.gov/submissions/CIK" + c.cik + ".json";
      const x = await getJSON(url, { headers: { "User-Agent": SEC_UA, "Accept": "application/json" }, retries: 3 });
      await L.sleep(250); // well under SEC's 10 requests/second
      if (!x.j) { errs.push(c.symbol + ": " + L.httpError(x.r)); continue; }
      const rec = x.j.filings && x.j.filings.recent; if (!rec) { errs.push(c.symbol + ": no filings"); continue; }
      const items = [];
      for (let i = 0; i < rec.form.length && items.length < 4; i++) {
        if (FORMS.indexOf(rec.form[i]) < 0) continue;
        const acc = rec.accessionNumber[i].replace(/-/g, "");
        items.push({ form: rec.form[i], filed: rec.filingDate[i], report_date: rec.reportDate[i] || null, items: rec.items ? rec.items[i] || "" : "",
          url: "https://www.sec.gov/Archives/edgar/data/" + parseInt(c.cik, 10) + "/" + acc + "/" + rec.primaryDocument[i] });
      }
      out.push({ symbol: c.symbol, name: x.j.name || c.name, cik: c.cik, filings: items });
    }
    const url = "https://data.sec.gov/submissions/CIK##########.json";
    if (!out.length) return fail(url, errs.join("; ") || "no data");
    const latest = out.reduce(function (a, c) { return c.filings[0] && c.filings[0].filed > a ? c.filings[0].filed : a; }, "");
    return ok(url, latest, { companies: out }, errs.length ? { warnings: errs } : null);
  },
  sec_8k_atom: async function () {
    const url = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=40&output=atom";
    const r = await L.get(url, { headers: { "User-Agent": SEC_UA, "Accept": "application/atom+xml" }, retries: 3 });
    if (!r.ok) return fail(url, r);
    const entries = L.blocks(r.body, "entry").map(function (b) {
      const title = L.tag(b, "title"), link = (/<link[^>]*href="([^"]+)"/.exec(b) || [])[1] || "", m = /^(\S+)\s+-\s+(.+?)\s+\((\d{10})\)/.exec(title);
      return { form: m ? m[1] : "", company: m ? m[2] : title, cik: m ? m[3] : "", time: L.isoOrNull(L.tag(b, "updated")), url: link.replace(/&amp;/g, "&") };
    }).filter(function (e) { return e.form && /^8-K/.test(e.form); }).slice(0, 15);
    if (!entries.length) return fail(url, "no entries");
    return ok(url, (entries[0].time || "").slice(0, 10), { entries: entries });
  },

  /* ===== SECTION: RSS HEADLINES (headline + link + time only, never article text) ===== */
  rss_fed: function () { return rss("rss_fed"); },
  rss_sec: function () { return rss("rss_sec", { "User-Agent": SEC_UA }); },
  rss_hkgov: function () { return rss("rss_hkgov"); },
  rss_rthk: function () { return rss("rss_rthk"); },
  rss_scmp: function () { return rss("rss_scmp"); },

  /* ===== SECTION: GDELT DOC 2.0 (theme volume; ≥ 6 s between requests per GDELT's limit) ===== */
  gdelt: async function () {
    const base = "https://api.gdeltproject.org/api/v2/doc/doc?format=json&timespan=30d&query=";
    const themes = [], errs = [], prev = L.readSource("gdelt"), prevThemes = prev && prev.data ? prev.data.themes : [];
    let first = true;
    for (const t of REG.themes) {
      if (!first) await L.sleep(6500); first = false;
      const url = base + encodeURIComponent(t.query) + "&mode=timelinevolraw";
      const x = await getJSON(url, { retries: 3, backoff: 15000, timeout: 45000 });
      if (!x.j || !x.j.timeline || !x.j.timeline[0]) {
        const old = prevThemes.find(function (p) { return p.id === t.id && p.series && p.series.length; });
        errs.push(t.id + ": " + (x.r ? L.httpError(x.r).slice(0, 60) : "empty timeline") + (old ? " (kept previous run)" : ""));
        themes.push(old ? Object.assign({}, old, { carried_over: true }) : { id: t.id, label: t.label, query: t.query, series: [], error: true }); continue;
      }
      const series = x.j.timeline[0].data.map(function (d) { return { date: d.date.slice(0, 4) + "-" + d.date.slice(4, 6) + "-" + d.date.slice(6, 8), count: d.value, total: d.norm }; });
      themes.push({ id: t.id, label: t.label, query: t.query, series: series });
    }
    // top headline links for the three busiest themes (latest day vs average)
    const ranked = themes.filter(function (t) { return t.series.length > 7; }).map(function (t) {
      const s = t.series, last = s[s.length - 1].count, base = s.slice(0, -1).reduce(function (a, d) { return a + d.count; }, 0) / (s.length - 1);
      return { t: t, r: base ? last / base : 0 };
    }).sort(function (a, b) { return b.r - a.r; }).slice(0, 3);
    for (const x of ranked) {
      await L.sleep(6500);
      const url = base.replace("timespan=30d", "timespan=2d") + encodeURIComponent(x.t.query + " sourcelang:english") + "&mode=artlist&maxrecords=3&sort=hybridrel";
      const a = await getJSON(url, { retries: 2, backoff: 15000, timeout: 45000 });
      x.t.articles = a.j && a.j.articles ? a.j.articles.slice(0, 3).map(function (r) { return { title: L.decode(r.title), url: r.url, domain: r.domain, seen: r.seendate }; }) : [];
    }
    const okThemes = themes.filter(function (t) { return t.series.length; });
    if (!okThemes.length) return fail(base + "…", errs.join("; "));
    const asOf = okThemes[0].series[okThemes[0].series.length - 1].date;
    return ok(base + "…&mode=timelinevolraw", asOf, { themes: themes, note: "Daily count of matching articles in GDELT's monitored news (30 days)" }, errs.length ? { warnings: errs } : null);
  },

  /* ===== SECTION: DATA.GOV.HK (CKAN catalogue) ===== */
  datagovhk: async function () {
    const out = [], qs = ["exchange rate", "interest rate", "monetary"];
    let url = "";
    for (const q of qs) {
      url = "https://data.gov.hk/en-data/api/3/action/package_search?rows=5&q=" + encodeURIComponent(q);
      const x = await getJSON(url, { retries: 3 });
      if (!x.j || !x.j.success) return fail(url, x.r || "CKAN error");
      x.j.result.results.forEach(function (p) {
        if (out.some(function (o) { return o.name === p.name; })) return;
        out.push({ name: p.name, title: p.title, org: (p.organization && p.organization.title) || "", url: "https://data.gov.hk/en-data/dataset/" + p.name, modified: (p.metadata_modified || "").slice(0, 10) });
      });
    }
    return ok("https://data.gov.hk/en-data/api/3/action/package_search", new Date().toISOString().slice(0, 10), { datasets: out });
  },

  /* ===== SECTION: FRED (optional – only with the FRED_API_KEY secret; the key is never written out) ===== */
  fred: async function () {
    const key = process.env.FRED_API_KEY, pub = "https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&file_type=json&sort_order=desc&limit=14";
    if (!key) return { status: "disabled", url: pub, as_of: null, data: null, error: "FRED_API_KEY not set (optional)" };
    const x = await getJSON(pub + "&api_key=" + encodeURIComponent(key));
    if (!x.j) return fail(pub, Object.assign({}, x.r, { body: "" }));
    const obs = (x.j.observations || []).map(function (o) { return { date: o.date, value: num(o.value) }; }).filter(function (o) { return o.value; });
    if (obs.length < 13) return fail(pub, "too few observations");
    return ok(pub, obs[0].date, { series_id: "CPIAUCSL", latest: obs[0], yoy_pct: Math.round((obs[0].value / obs[12].value - 1) * 1000) / 10, series: obs });
  }
};

/* ===== SECTION: SHARED FETCHER BODIES ===== */
async function nyfed(url) {
  const x = await getJSON(url, { retries: 4 });
  if (!x.j) return fail(url, x.r);
  const series = (x.j.refRates || []).map(function (r) {
    return { date: r.effectiveDate, rate: num(r.percentRate), p1: num(r.percentPercentile1), p99: num(r.percentPercentile99), volume_bn: num(r.volumeInBillions), target_from: num(r.targetRateFrom), target_to: num(r.targetRateTo) };
  }).sort(byDateDesc);
  if (!series.length) return fail(url, "no refRates");
  return ok(url, series[0].date, { latest: series[0], series: series, unit: "% p.a." });
}
async function rss(id, headers) {
  const src = REG.registry.find(function (r) { return r.id === id; }), url = src.url;
  const r = await L.get(url, { headers: Object.assign({ "Accept": "application/rss+xml, application/xml, text/xml" }, headers || {}), retries: 3 });
  if (!r.ok) return fail(url, r);
  let items = L.blocks(r.body, "item").map(function (b) { return { title: L.tag(b, "title"), url: L.tag(b, "link") || L.tag(b, "guid"), time: L.isoOrNull(L.tag(b, "pubDate") || L.tag(b, "dc:date")) }; });
  if (!items.length) items = L.blocks(r.body, "entry").map(function (b) { return { title: L.tag(b, "title"), url: (/<link[^>]*href="([^"]+)"/.exec(b) || [])[1] || "", time: L.isoOrNull(L.tag(b, "updated")) }; });
  items = items.filter(function (i) { return i.title && /^https?:\/\//.test(i.url); }).sort(function (a, b) { return (b.time || "") < (a.time || "") ? -1 : 1; }).slice(0, 8)
    .map(function (i) { return { title: i.title.slice(0, 220), url: i.url, time: i.time }; });
  if (!items.length) return fail(url, "no items parsed");
  return ok(url, (items[0].time || new Date().toISOString()).slice(0, 10), { items: items, final_url: r.finalUrl !== url ? r.finalUrl : undefined });
}

/* ===== SECTION: RUN ===== */
async function main() {
  L.ensureDirs();
  const only = process.argv.slice(2).filter(function (a) { return !/^--/.test(a); });
  const ids = REG.registry.filter(function (r) { return r.public && FETCHERS[r.id] && (!only.length || only.indexOf(r.id) >= 0); }).map(function (r) { return r.id; });
  const summary = [];
  // GDELT runs alongside the others because it is slow (rate limit); the rest run one after another to be polite.
  const gdeltP = ids.indexOf("gdelt") >= 0 ? run("gdelt") : null;
  for (const id of ids) if (id !== "gdelt") summary.push(await run(id));
  if (gdeltP) summary.push(await gdeltP);
  const b = L.buildBundle(process.env.FEEDS_RUNNER || "local");
  summary.forEach(function (s) { console.log((s.status === "ok" ? "OK   " : s.status === "disabled" ? "OFF  " : "FAIL ") + s.id.padEnd(15) + " as_of " + String(s.as_of).padEnd(11) + (s.ms + " ms").padStart(9) + (s.error ? "  " + s.error : "") + (s.warnings ? "  warnings: " + s.warnings.join("; ") : "")); });
  console.log("bundle data/feeds.js " + b.snapshot_id + " (" + Object.keys(b.sources).length + " sources)");
  if (summary.every(function (s) { return s.status !== "ok"; })) process.exitCode = 1;
}
async function run(id) {
  const t0 = Date.now(), now = new Date().toISOString();
  let res;
  try { res = await FETCHERS[id](); } catch (e) { res = { status: "error", error: String(e && e.message || e) }; }
  const merged = L.mergeResult(id, res, now);
  merged.ms = Date.now() - t0;
  L.assertNoSecrets(merged);
  L.writeJSON(path.join(L.PUBLIC_DIR, id + ".json"), merged);
  return merged;
}
if (require.main === module) main();
module.exports = { FETCHERS: FETCHERS };

// END OF FILE: scripts/fetch-feeds.js
