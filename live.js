// live.js – Winston Terminal v5 (Phase 3): owner-only Live mode client (Demo/Live pill, passphrase, Worker calls).
// Demo is the default and is what every visitor sees. Live asks for a passphrase, gets a 12-hour signed token from the
// Cloudflare Worker (worker/worker.js) and fetches vendor quotes (EODHD HK, Finnhub US). Vendor keys never reach the page:
// the browser only ever sends the passphrase (once) and the token. Quotes are applied in memory only via Calc.applyLiveQuotes
// (app.js) – never saved to localStorage, never written to data/. No Worker URL → a clear "Live not configured" state.

(function () {
  "use strict";

  /* ===== SECTION: SETTINGS + STORAGE ===== */
  const KEY_URL = "winstonTerminal.v1.liveWorkerUrl", KEY_TOKEN = "winstonTerminal.v1.liveToken"; // token in sessionStorage only
  const S = { live: null, busy: false, health: null };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.WT_APP ? window.WT_APP.esc(s) : String(s); }
  function workerUrl() {
    let u = ""; try { u = window.localStorage.getItem(KEY_URL) || ""; } catch (e) { /* storage blocked */ }
    if (!u && window.WT_CONFIG && window.WT_CONFIG.liveWorkerUrl) u = window.WT_CONFIG.liveWorkerUrl;
    return String(u || "").trim().replace(/\/+$/, "");
  }
  function validUrl(u) { return /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w\-./]*)?$/i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(u); } // http only for `wrangler dev` on this PC
  function getToken() { try { const t = JSON.parse(window.sessionStorage.getItem(KEY_TOKEN) || "null"); return t && Date.parse(t.expires_at) > Date.now() + 60000 ? t : null; } catch (e) { return null; } }
  function setToken(t) { try { if (t) window.sessionStorage.setItem(KEY_TOKEN, JSON.stringify(t)); else window.sessionStorage.removeItem(KEY_TOKEN); } catch (e) { /* ignore */ } }
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", minute: "2-digit", hour12: false });

  /* ===== SECTION: WORKER CALLS ===== */
  async function call(path, opts) {
    const u = workerUrl(), ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 15000);
    try {
      const res = await fetch(u + path, Object.assign({ mode: "cors", cache: "no-store", credentials: "omit", signal: ctl.signal }, opts || {}));
      let body = null; try { body = await res.json(); } catch (e) { /* not JSON */ }
      return { status: res.status, body: body || {} };
    } catch (e) { return { status: 0, body: { message: "Worker unreachable – check the Worker URL, your connection, or ALLOWED_ORIGINS on the Worker." } }; }
    finally { clearTimeout(t); }
  }
  async function auth(pass) { return call("/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase: pass }) }); }
  async function quotes(tok) {
    const syms = (window.WT_APP ? window.WT_APP.holdings() : []).map(function (h) { return h.symbol; });
    return call("/live/quotes?symbols=" + encodeURIComponent(syms.join(",")), { headers: { "Authorization": "Bearer " + tok.token } });
  }

  /* ===== SECTION: PILL + MODAL ===== */
  function renderPill() {
    const p = $("live-pill"); if (!p) return;
    const on = !!S.live;
    p.className = "live-pill mono " + (on ? "on" : workerUrl() ? "off" : "unconf");
    p.textContent = on ? "● LIVE " + hhmm.format(new Date(S.live.generated_at || Date.now())) : "○ DEMO DATA";
    p.title = on ? "Live mode (owner only) – vendor prices in memory. Click to refresh or exit." : workerUrl() ? "Demo data. Click to go Live (passphrase)." : "Demo data. Live mode is not configured.";
    p.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function modal(title, html) { if (window.WT_APP) window.WT_APP.modal(title, html, '<span class="src-chip">' + (S.live ? "Live · owner only" : "Live mode") + "</span>"); }
  function openLive() {
    if (S.live) return modal("Live mode – on", '<p>Vendor prices from ' + esc(liveSources()) + " are applied to " + S.live.applied.length + " of " + (S.live.applied.length + S.live.missing.length) + " holdings, in memory only. Nothing is saved or published.</p>" +
      (S.live.errors.length ? '<p class="note">Not covered: ' + S.live.errors.map(function (e) { return esc(e.symbol) + " (" + esc(e.error) + ")"; }).join(", ") + "</p>" : "") +
      '<div class="row-actions"><button class="btn primary" data-live="refresh">Refresh prices</button><button class="btn danger" data-live="exit">Exit Live (back to demo prices)</button></div>' +
      '<p class="note">EODHD free allows about 20 calls a day, so prices refresh only when you click (the Worker also caches HK quotes for 15 minutes).</p>');
    if (!workerUrl()) return notConfigured();
    const tok = getToken();
    modal("Go Live (owner only)", '<p>Live mode swaps the illustrative prices for vendor quotes (EODHD for HK, Finnhub for US), for your own use only. Visitors always see demo data.</p>' +
      (tok ? '<p class="note">Signed in until ' + esc(hhmm.format(new Date(tok.expires_at))) + ' HKT on this tab.</p><div class="row-actions"><button class="btn primary" data-live="go">Go Live</button>' :
        '<label class="field"><span class="label">Passphrase</span><input id="live-pass" type="password" autocomplete="current-password" placeholder="Your Live passphrase"></label><div class="row-actions"><button class="btn primary" data-live="go">Unlock Live</button>') +
      '<button class="btn" data-live="health">Test Worker</button></div><div id="live-msg" class="note" aria-live="polite"></div>' +
      '<p class="note mono">Worker: ' + esc(workerUrl()) + ' · <a href="#settings" data-live="close">change on Rules &amp; Settings</a></p>');
    setTimeout(function () { const i = $("live-pass"); if (i) i.focus(); }, 30);
  }
  function notConfigured() {
    modal("Live not configured", '<div class="state" id="live-unconf"><b>Live not configured.</b> This site is showing demo data, which is all a visitor ever sees. To use Live prices yourself, deploy the free Cloudflare Worker and paste its URL below (or set <span class="mono">liveWorkerUrl</span> in config.js).</div>' +
      settingsHtml() + '<p class="note">Step-by-step: <a href="' + esc((window.WT_CONFIG && window.WT_CONFIG.setupGuideUrl) || "SETUP-PHASE3.md") + '" target="_blank" rel="noopener noreferrer">SETUP-PHASE3.md</a>.</p>');
  }
  function settingsHtml() {
    return '<div class="form-grid live-form"><label class="field"><span class="label">Worker URL</span><input id="live-url" type="url" placeholder="https://winston-terminal-live.yourname.workers.dev" value="' + esc(workerUrl()) + '"></label></div>' +
      '<div class="row-actions"><button class="btn primary" data-live="save-url">Save URL (this browser)</button><button class="btn" data-live="clear-url">Clear</button><span id="live-url-msg" class="note"></span></div>' +
      '<details class="live-hash"><summary>Make a passphrase hash (for the Worker\'s PASSPHRASE_HASH secret)</summary><div class="row-actions"><input id="hash-in" type="password" placeholder="Choose a passphrase (12+ characters)"><button class="btn" data-live="hash">Make hash</button></div>' +
      '<div class="mono hash-out" id="hash-out"></div><p class="note">Computed in this browser with SHA-256; nothing is sent or saved. Paste the hash into Cloudflare, keep the passphrase in your password manager.</p></details>';
  }
  function liveSources() { const s = {}; (S.live.quotes || []).forEach(function (q) { s[q.source] = 1; }); return Object.keys(s).join(" + ") || "the vendors"; }
  function msg(t, bad) { const m = $("live-msg"); if (m) { m.textContent = t; m.className = bad ? "err" : "note"; } }

  /* ===== SECTION: FLOW ===== */
  async function goLive() {
    if (S.busy) return; S.busy = true;
    try {
      let tok = getToken();
      if (!tok) {
        const pass = ($("live-pass") || {}).value || "";
        if (pass.length < 1) { msg("Enter your passphrase.", true); return; }
        msg("Checking passphrase…");
        const a = await auth(pass);
        if (a.status !== 200 || !a.body.token) { msg(a.status === 401 ? "Wrong passphrase." : a.status === 429 ? "Too many attempts – wait 10 minutes." : a.status === 503 ? "The Worker has no PASSPHRASE_HASH secret yet." : a.body.message || "Worker error " + a.status, true); return; }
        tok = { token: a.body.token, expires_at: a.body.expires_at }; setToken(tok);
      }
      msg("Fetching live quotes…");
      const q = await quotes(tok);
      if (q.status === 401) { setToken(null); msg("Session expired – enter the passphrase again.", true); return openLive(); }
      if (q.status !== 200) { msg(q.body.message || "Worker error " + q.status, true); return; }
      const res = window.WT_APP.setLive({ quotes: q.body.quotes || [], errors: q.body.errors || [], generated_at: q.body.generated_at });
      S.live = { quotes: q.body.quotes || [], errors: q.body.errors || [], generated_at: q.body.generated_at, applied: res.applied, missing: res.missing };
      renderPill(); window.WT_APP.closeModal();
      window.WT_APP.toast("Live: " + res.applied.length + " prices applied (owner only, not saved)." + (res.missing.length ? " " + res.missing.length + " not covered." : ""));
    } finally { S.busy = false; }
  }
  function exitLive() { S.live = null; window.WT_APP.setLive(null); renderPill(); window.WT_APP.closeModal(); window.WT_APP.toast("Back to demo prices."); }
  async function testHealth() {
    msg("Contacting the Worker…");
    const h = await call("/health");
    if (h.status !== 200) return msg(h.body.message || "Worker error " + h.status, true);
    const c = h.body.configured || {};
    msg("Worker OK · EODHD key " + (c.eodhd ? "set" : "missing") + " · Finnhub key " + (c.finnhub ? "set" : "missing") + " · passphrase " + (c.passphrase ? "set" : "missing") + ".", !(c.eodhd && c.finnhub && c.passphrase));
  }
  async function makeHash() {
    const v = ($("hash-in") || {}).value || "", out = $("hash-out");
    if (v.length < 12) { out.textContent = "Use at least 12 characters."; return; }
    if (!(window.crypto && crypto.subtle)) { out.textContent = "This browser can't hash here – open the site over https."; return; }
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
    out.textContent = Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function saveUrl() {
    const u = (($("live-url") || {}).value || "").trim().replace(/\/+$/, ""), m = $("live-url-msg");
    if (u && !validUrl(u)) { m.textContent = "Use the full https:// address of your Worker."; m.className = "err"; return; }
    try { if (u) window.localStorage.setItem(KEY_URL, u); else window.localStorage.removeItem(KEY_URL); } catch (e) { m.textContent = "Couldn't save in this browser."; return; }
    m.textContent = u ? "Saved. Click the DEMO DATA pill to go Live." : "Cleared."; m.className = "note"; renderPill();
  }

  /* ===== SECTION: SETTINGS PAGE BLOCK (module hook) ===== */
  function renderSettings(host) {
    const d = document.createElement("div"); d.className = "panel"; d.id = "live-settings";
    d.innerHTML = '<div class="panel-head"><span class="panel-title">Live mode (owner only)</span><span class="src-chip">' + (workerUrl() ? "Worker set" : "Live not configured") + "</span></div>" +
      '<p class="note">Demo data is the default for everyone. Live mode needs your own Cloudflare Worker (free) holding the EODHD and Finnhub keys as secrets. Keys never go in this page or the repo.</p>' + settingsHtml();
    host.appendChild(d);
  }

  /* ===== SECTION: EVENTS ===== */
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("#live-pill")) { e.preventDefault(); return openLive(); }
    const b = e.target.closest && e.target.closest("[data-live]"); if (!b) return;
    const a = b.getAttribute("data-live");
    if (a !== "close") e.preventDefault();
    if (a === "go") goLive(); else if (a === "refresh") goLive(); else if (a === "exit") exitLive(); else if (a === "health") testHealth();
    else if (a === "hash") makeHash(); else if (a === "save-url") saveUrl(); else if (a === "clear-url") { const i = $("live-url"); if (i) i.value = ""; saveUrl(); }
    else if (a === "close" && window.WT_APP) window.WT_APP.closeModal();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target && e.target.id === "live-pass") goLive(); });

  /* ===== SECTION: REGISTER ===== */
  window.WT_LIVE = { open: openLive, isLive: function () { return !!S.live; }, workerUrl: workerUrl, renderPill: renderPill, state: function () { return S.live; } };
  window.WT_MODULES = window.WT_MODULES || [];
  window.WT_MODULES.push({ id: "live-settings", hidden: true, renderSettings: renderSettings });
  if (document.readyState !== "loading") renderPill(); else document.addEventListener("DOMContentLoaded", renderPill);
})();

// END OF FILE: live.js
