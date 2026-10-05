// worker/worker.js – Winston Terminal v5 (Phase 3): Cloudflare Worker for the owner-only Live mode.
// Holds the vendor keys as Worker SECRETS (never in the repo, never sent to the page). Paste this whole file into the
// Cloudflare dashboard editor ("Edit code") or deploy with `npx wrangler deploy` using worker/wrangler.toml.
// Endpoints:  GET /health (no auth, says what is configured – never the values)
//             POST /auth {passphrase} → {token, expires_at}   (SHA-256 of the passphrase is compared with PASSPHRASE_HASH)
//             GET /live/quotes?symbols=0700.HK,NVDA.US  with "Authorization: Bearer <token>" → unified quote list
// Secrets: EODHD_KEY (HK, free plan ~20 calls/day), FINNHUB_KEY (US, 60/min), PASSPHRASE_HASH (hex SHA-256 of the passphrase).
// Optional secret SESSION_SECRET (signs tokens; falls back to PASSPHRASE_HASH). Var ALLOWED_ORIGINS (comma list; "null" = file://).
// Vendor terms: personal use only – the response is for the owner's browser session and is never stored or republished.

/* ===== SECTION: SETTINGS ===== */
const TOKEN_TTL_S = 12 * 3600;          // Live session length
const CACHE_S = { HK: 900, US: 60 };    // EODHD free is 15-min delayed and ~20 calls/day; Finnhub free allows 60/min
const MAX_SYMBOLS = 30;
const AUTH_WINDOW_S = 600, AUTH_MAX_TRIES = 8; // per-IP passphrase attempts per isolate (best effort)
const tries = new Map();

/* ===== SECTION: HELPERS ===== */
const enc = new TextEncoder();
function hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
async function sha256Hex(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
function b64url(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function safeEqual(a, b) { // constant-time compare of two equal-length strings
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
function signingSecret(env) { return env.SESSION_SECRET || env.PASSPHRASE_HASH || ""; }
async function makeToken(env) { const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_S; return { token: "v1." + exp + "." + (await hmac(signingSecret(env), "v1." + exp)), exp: exp }; }
async function checkToken(env, header) {
  const m = /^Bearer\s+(v1\.(\d+)\.([\w-]+))$/.exec(header || ""); if (!m || !signingSecret(env)) return false;
  if (+m[2] < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(await hmac(signingSecret(env), "v1." + m[2]), m[3]);
}
function corsHeaders(env, req) {
  const origin = req.headers.get("Origin") || "", allowed = String(env.ALLOWED_ORIGINS || "https://winstonlmt-hk.github.io,null").split(",").map(function (s) { return s.trim(); });
  const h = { "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600" };
  if (origin && allowed.indexOf(origin) >= 0) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function json(env, req, status, obj) {
  return new Response(JSON.stringify(obj), { status: status, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, corsHeaders(env, req)) });
}
function configured(env) { return { eodhd: !!env.EODHD_KEY, finnhub: !!env.FINNHUB_KEY, passphrase: !!env.PASSPHRASE_HASH }; }

/* ===== SECTION: SYMBOLS (app format → vendor format) ===== */
// App symbols look like 0700.HK, BRK-B.US, NVDA.US. EODHD uses 0700.HK; Finnhub uses NVDA and BRK.B for US listings.
function market(sym) { return /\.HK$/i.test(sym) ? "HK" : /\.US$/i.test(sym) || /^[A-Z][A-Z.\-]{0,6}$/.test(sym) ? "US" : "OTHER"; }
function finnhubSymbol(sym) { return sym.replace(/\.US$/i, "").replace("-", "."); }
function eodhdSymbol(sym) { const m = /^(\d+)\.HK$/i.exec(sym); return m ? m[1].padStart(4, "0") + ".HK" : sym; } // recheck code format with your key

/* ===== SECTION: VENDOR FETCHERS (query → extract → transform into one quote schema) ===== */
async function cachedJSON(url, ttl, cacheKey) { // Workers Cache API; the cache key URL never contains the vendor key
  const cache = caches.default, key = new Request("https://wt-cache.invalid/" + cacheKey);
  const hit = await cache.match(key); if (hit) return { body: await hit.json(), cached: true };
  const res = await fetch(url, { headers: { "Accept": "application/json", "User-Agent": "WinstonTerminal-Worker/5.0" } });
  if (!res.ok) throw new Error("vendor HTTP " + res.status);
  const body = await res.json();
  await cache.put(key, new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + ttl } }));
  return { body: body, cached: false };
}
async function eodhdQuotes(env, syms) {
  if (!syms.length) return { quotes: [], errors: [] };
  if (!env.EODHD_KEY) return { quotes: [], errors: syms.map(function (s) { return { symbol: s, error: "EODHD_KEY not set" }; }) };
  const codes = syms.map(eodhdSymbol), first = codes[0], rest = codes.slice(1).join(",");
  const url = "https://eodhd.com/api/real-time/" + encodeURIComponent(first) + "?fmt=json" + (rest ? "&s=" + encodeURIComponent(rest) : "") + "&api_token=" + encodeURIComponent(env.EODHD_KEY);
  try {
    const r = await cachedJSON(url, CACHE_S.HK, "eodhd/" + codes.slice().sort().join(","));
    const list = Array.isArray(r.body) ? r.body : [r.body], quotes = [], errors = [];
    syms.forEach(function (s, i) {
      const q = list.find(function (x) { return x && String(x.code).toUpperCase() === codes[i].toUpperCase(); });
      const price = q && Number(q.close);
      if (!q || !(price > 0)) return errors.push({ symbol: s, error: "no quote (check the EODHD code " + codes[i] + ")" });
      const t = Number(q.timestamp) * 1000;
      quotes.push({ symbol: s, price: price, prev_close: Number(q.previousClose) || null, change_pct: Number(q.change_p) || null, currency: "HKD",
        as_of: isFinite(t) && t > 0 ? new Date(t).toISOString() : null, date: isFinite(t) && t > 0 ? new Date(t + 8 * 3600e3).toISOString().slice(0, 10) : null,
        source: "EODHD", delay: "15-min delayed", cached: r.cached });
    });
    return { quotes: quotes, errors: errors };
  } catch (e) { return { quotes: [], errors: syms.map(function (s) { return { symbol: s, error: String(e.message || e) }; }) }; }
}
async function finnhubQuotes(env, syms) {
  if (!syms.length) return { quotes: [], errors: [] };
  if (!env.FINNHUB_KEY) return { quotes: [], errors: syms.map(function (s) { return { symbol: s, error: "FINNHUB_KEY not set" }; }) };
  const out = await Promise.all(syms.map(async function (s) {
    const f = finnhubSymbol(s), url = "https://finnhub.io/api/v1/quote?symbol=" + encodeURIComponent(f) + "&token=" + encodeURIComponent(env.FINNHUB_KEY);
    try {
      const r = await cachedJSON(url, CACHE_S.US, "finnhub/" + f), q = r.body;
      if (!(Number(q.c) > 0)) return { error: { symbol: s, error: "no quote for " + f } };
      const t = Number(q.t) * 1000;
      return { quote: { symbol: s, price: Number(q.c), prev_close: Number(q.pc) || null, change_pct: Number(q.dp) || null, currency: "USD",
        as_of: t > 0 ? new Date(t).toISOString() : null, date: t > 0 ? new Date(t + 8 * 3600e3).toISOString().slice(0, 10) : null, source: "Finnhub", delay: "real-time (free plan)", cached: r.cached } };
    } catch (e) { return { error: { symbol: s, error: String(e.message || e) } }; }
  }));
  return { quotes: out.filter(function (x) { return x.quote; }).map(function (x) { return x.quote; }), errors: out.filter(function (x) { return x.error; }).map(function (x) { return x.error; }) };
}

/* ===== SECTION: ROUTES ===== */
async function handle(req, env) {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env, req) });
  if (url.pathname === "/" || url.pathname === "/health") {
    return json(env, req, 200, { ok: true, service: "winston-terminal-live", version: "5.0", configured: configured(env), time: new Date().toISOString() });
  }
  if (url.pathname === "/auth" && req.method === "POST") {
    if (!env.PASSPHRASE_HASH) return json(env, req, 503, { error: "not_configured", message: "PASSPHRASE_HASH secret is not set on the Worker" });
    const ip = req.headers.get("CF-Connecting-IP") || "?", now = Date.now(), t = (tries.get(ip) || []).filter(function (x) { return now - x < AUTH_WINDOW_S * 1000; });
    if (t.length >= AUTH_MAX_TRIES) return json(env, req, 429, { error: "too_many_attempts", message: "Too many attempts – wait 10 minutes" });
    let body = {}; try { body = await req.json(); } catch (e) { /* empty body */ }
    const given = await sha256Hex(String(body.passphrase || ""));
    if (!safeEqual(given, String(env.PASSPHRASE_HASH).trim().toLowerCase())) { t.push(now); tries.set(ip, t); return json(env, req, 401, { error: "bad_passphrase", message: "Wrong passphrase" }); }
    tries.delete(ip);
    const tk = await makeToken(env);
    return json(env, req, 200, { token: tk.token, expires_at: new Date(tk.exp * 1000).toISOString(), configured: configured(env) });
  }
  if (url.pathname === "/live/quotes" && req.method === "GET") {
    if (!(await checkToken(env, req.headers.get("Authorization")))) return json(env, req, 401, { error: "unauthorised", message: "Live session expired – enter the passphrase again" });
    const syms = String(url.searchParams.get("symbols") || "").split(",").map(function (s) { return s.trim().toUpperCase(); }).filter(function (s) { return /^[A-Z0-9.\-]{1,15}$/.test(s); }).slice(0, MAX_SYMBOLS);
    if (!syms.length) return json(env, req, 400, { error: "no_symbols" });
    const hk = syms.filter(function (s) { return market(s) === "HK"; }), us = syms.filter(function (s) { return market(s) === "US"; }), other = syms.filter(function (s) { return market(s) === "OTHER"; });
    const res = await Promise.all([eodhdQuotes(env, hk), finnhubQuotes(env, us)]);
    const errors = res[0].errors.concat(res[1].errors, other.map(function (s) { return { symbol: s, error: "market not covered by the free plans" }; }));
    return json(env, req, 200, { generated_at: new Date().toISOString(), quotes: res[0].quotes.concat(res[1].quotes), errors: errors,
      notice: "Vendor prices for the owner's personal use only – not for redistribution." });
  }
  return json(env, req, 404, { error: "not_found" });
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { return json(env, req, 500, { error: "worker_error", message: "Unexpected error" }); }
  }
};

// END OF FILE: worker/worker.js
