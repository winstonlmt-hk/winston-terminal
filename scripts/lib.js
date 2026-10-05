// scripts/lib.js – Winston Terminal v5 (Phase 3): shared helpers for the fetch and health-check scripts.
// Node 20+, no dependencies (global fetch). Never handles vendor keys: those live only in the Cloudflare Worker.
// Patterns (reimplemented from the borrowing guide): retry with backoff, last-good snapshot retained on failure,
// snapshot_id per run, one bundle file data/feeds.js that the page loads with a plain <script src> (works on file://).

"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ===== SECTION: PATHS ===== */
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC_DIR = path.join(DATA_DIR, "public");
function ensureDirs() { fs.mkdirSync(PUBLIC_DIR, { recursive: true }); }

/* ===== SECTION: HTTP (timeout + retry with exponential backoff) ===== */
const BROWSERISH_UA = "Mozilla/5.0 (compatible; WinstonTerminal/5.0; +https://winstonlmt-hk.github.io/winston-terminal/)";
const RETRY_STATUS = [403, 405, 408, 425, 429, 500, 502, 503, 504]; // HKMA's gateway intermittently answers 405/502
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function get(url, opts) {
  opts = opts || {};
  const tries = opts.retries === undefined ? 4 : opts.retries, timeout = opts.timeout || 30000;
  let last = null;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, timeout), t0 = Date.now();
    try {
      const res = await fetch(url, { headers: Object.assign({ "User-Agent": BROWSERISH_UA, "Accept": "*/*" }, opts.headers || {}), redirect: "follow", signal: ctl.signal });
      const body = await res.text(); clearTimeout(t);
      const out = { ok: res.ok, status: res.status, body: body, ms: Date.now() - t0, finalUrl: res.url, type: res.headers.get("content-type") || "" };
      if (res.ok) return out;
      last = out;
      if (RETRY_STATUS.indexOf(res.status) < 0) return out;
    } catch (e) {
      clearTimeout(t); last = { ok: false, status: 0, body: "", ms: Date.now() - t0, error: e.name === "AbortError" ? "timeout after " + timeout + " ms" : String(e.message || e) };
    }
    if (i < tries - 1) await sleep((opts.backoff || 2000) * Math.pow(2, i));
  }
  return last;
}
function httpError(r) {
  if (r.error) return r.error;
  const b = String(r.body || "").trim();
  return "HTTP " + r.status + (!b ? "" : /^</.test(b) ? " – HTML error page" + (/data-spm|aliyun|traceid/i.test(b) ? " (gateway firewall block, usually temporary)" : "") : " – " + b.replace(/\s+/g, " ").slice(0, 120));
}

/* ===== SECTION: TEXT / XML HELPERS (tiny, tolerant – enough for RSS, Atom and the Treasury XML) ===== */
function decode(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }).replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
function tag(block, name) { const m = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i").exec(block); return m ? decode(m[1]) : ""; }
function blocks(xml, name) { const out = [], re = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "gi"); let m; while ((m = re.exec(xml))) out.push(m[1]); return out; }
function isoOrNull(s) { const d = new Date(s); return isNaN(d) ? null : d.toISOString(); }
function parseCSV(text) { // RFC-4180-ish, enough for ECB / Fed CSV
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.length > 1 || r[0]; });
}

/* ===== SECTION: SNAPSHOT FILES (data/public/<id>.json + bundle data/feeds.js) ===== */
function readSource(id) { try { return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, id + ".json"), "utf8")); } catch (e) { return null; } }
function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 1) + "\n"); }
// Keep the last good data when a fetch fails (status "error", data retained, last_ok_at unchanged).
function mergeResult(id, result, nowIso) {
  const prev = readSource(id);
  if (result.status === "ok") return Object.assign({ id: id, fetched_at: nowIso, last_ok_at: nowIso }, result);
  if (result.status === "disabled") return Object.assign({ id: id, fetched_at: nowIso, last_ok_at: prev && prev.last_ok_at || null }, result);
  const kept = prev && prev.data ? { data: prev.data, as_of: prev.as_of, last_ok_at: prev.last_ok_at, url: prev.url } : { data: null, as_of: null, last_ok_at: null };
  return Object.assign({ id: id, fetched_at: nowIso }, kept, { status: "error", error: result.error, http: result.http || null, attempted_url: result.url || null });
}
function shortHash(obj) { return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 10); }
function buildBundle(runner) {
  ensureDirs();
  const reg = require(path.join(ROOT, "feeds-registry.js")).registry;
  const sources = {};
  reg.filter(function (r) { return r.public; }).forEach(function (r) { const s = readSource(r.id); if (s) sources[r.id] = s; });
  const health = readSource("health");
  const now = new Date().toISOString();
  const content = { sources: sources, health: health };
  const snapshot_id = "snap-" + now.slice(0, 16).replace(/[-:T]/g, "") + "-" + shortHash(content);
  const bundle = { schema: 1, generated_at: now, snapshot_id: snapshot_id, runner: runner || "local", sources: sources, health: health };
  const js = "// data/feeds.js – GENERATED by scripts/fetch-feeds.js (do not edit by hand). Public, openly licensed feeds only – no vendor prices, no keys.\n" +
    "// Loaded with a plain <script src> so the page works from file:// and GitHub Pages. Per-source copies: data/public/*.json.\n" +
    "window.WT_FEEDS = " + JSON.stringify(bundle) + ";\n// END OF FILE: data/feeds.js\n";
  fs.writeFileSync(path.join(DATA_DIR, "feeds.js"), js);
  return bundle;
}

/* ===== SECTION: SAFETY (a vendor key must never reach data/) ===== */
function assertNoSecrets(obj) {
  const s = JSON.stringify(obj);
  ["api_token=", "api_key=", "token=", "apikey="].forEach(function (k) {
    const i = s.indexOf(k); if (i >= 0 && !/api_token=demo|token=\{|api_key=&/.test(s.slice(i, i + 20))) throw new Error("Refusing to write a URL containing '" + k + "'");
  });
}

module.exports = { ROOT, DATA_DIR, PUBLIC_DIR, ensureDirs, get, httpError, sleep, decode, tag, blocks, isoOrNull, parseCSV, readSource, writeJSON, mergeResult, buildBundle, shortHash, assertNoSecrets };

// END OF FILE: scripts/lib.js
