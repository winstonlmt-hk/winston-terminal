// scripts/health-check.js – Winston Terminal v5 (Phase 3): weekly credential-free source health check.
// Run by .github/workflows/source-health.yml (weekly) or by hand:  node scripts/health-check.js
// One light request per public source in feeds-registry.js (no keys; FRED is skipped unless FRED_API_KEY is set).
// Writes data/public/health.json and rebuilds data/feeds.js so the Data Sources page shows the result.
// Pattern from the borrowing guide (weekly credential-free health check), reimplemented.

"use strict";
const path = require("path");
const L = require("./lib.js");
const REG = require(path.join(L.ROOT, "feeds-registry.js"));
const SEC_UA = process.env.SEC_USER_AGENT || "WinstonTerminal admin@example.com";

/* ===== SECTION: PROBE URLS (smallest useful request per source) ===== */
const HKMA = "https://api.hkma.gov.hk/public/market-data-and-statistics/";
const PROBES = {
  hkma_liquidity: HKMA + "daily-monetary-statistics/daily-figures-interbank-liquidity?pagesize=1",
  hkma_er: HKMA + "monthly-statistical-bulletin/er-ir/er-eeri-daily?pagesize=1",
  hkma_hibor: HKMA + "monthly-statistical-bulletin/er-ir/hk-interbank-ir-daily?pagesize=1",
  nyfed_sofr: "https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json",
  nyfed_effr: "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json",
  ust_curve: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=" + new Date().toISOString().slice(0, 7).replace("-", ""),
  fed_h10: REG.registry.find(function (r) { return r.id === "fed_h10"; }).url.replace("lastobs=30", "lastobs=1"),
  ecb_fx: "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=csvdata",
  fomc_calendar: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  sec_filings: "https://data.sec.gov/submissions/CIK0000320193.json",
  sec_8k_atom: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=1&output=atom",
  rss_fed: "https://www.federalreserve.gov/feeds/press_all.xml",
  rss_sec: "https://www.sec.gov/news/pressreleases.rss",
  rss_hkgov: "https://www.info.gov.hk/gia/rss/general_en.xml",
  rss_rthk: "https://rthk.hk/rthk/news/rss/e_expressnews_efinance.xml",
  rss_scmp: "https://www.scmp.com/rss/92/feed/",
  gdelt: "https://api.gdeltproject.org/api/v2/doc/doc?format=json&timespan=1d&mode=timelinevolraw&query=%22Hong%20Kong%22",
  datagovhk: "https://data.gov.hk/en-data/api/3/action/package_search?rows=1&q=exchange%20rate"
};
const SEC_IDS = ["sec_filings", "sec_8k_atom", "rss_sec"];

/* ===== SECTION: RUN ===== */
async function main() {
  L.ensureDirs();
  const results = [];
  for (const r of REG.registry) {
    if (!r.public) { results.push({ id: r.id, ok: null, status: "skipped", note: "vendor source – checked by the Worker's /health only", ms: 0 }); continue; }
    if (r.needs_key && !process.env[r.needs_key]) { results.push({ id: r.id, ok: null, status: "skipped", note: r.needs_key + " not set (optional)", ms: 0 }); continue; }
    const url = PROBES[r.id]; if (!url) continue;
    if (r.id === "gdelt") await L.sleep(6000);
    if (/hkma/.test(r.id)) await L.sleep(3000);
    const res = await L.get(url, { retries: 2, backoff: 5000, timeout: 30000, headers: SEC_IDS.indexOf(r.id) >= 0 ? { "User-Agent": SEC_UA } : {} });
    results.push({ id: r.id, ok: !!res.ok, status: res.status || "network", ms: res.ms, bytes: res.body ? res.body.length : 0, note: res.ok ? "" : L.httpError(res).slice(0, 140) });
    console.log((res.ok ? "OK   " : "FAIL ") + r.id.padEnd(15) + String(res.status).padStart(4) + (res.ms + " ms").padStart(9) + (res.ok ? "" : "  " + L.httpError(res).slice(0, 100)));
  }
  const checked = results.filter(function (x) { return x.ok !== null; });
  const health = { id: "health", checked_at: new Date().toISOString(), runner: process.env.FEEDS_RUNNER || "local", ok: checked.filter(function (x) { return x.ok; }).length, total: checked.length, results: results };
  L.writeJSON(path.join(L.PUBLIC_DIR, "health.json"), health);
  const b = L.buildBundle(process.env.FEEDS_RUNNER || "local");
  console.log("health " + health.ok + "/" + health.total + " · bundle " + b.snapshot_id);
}
if (require.main === module) main();

// END OF FILE: scripts/health-check.js
