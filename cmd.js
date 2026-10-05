// cmd.js – Winston Terminal v4 (plan v3 Phase 2): Bloomberg-style command line, Ctrl/Cmd+K palette, "?" shortcut sheet and the guided TOUR.
// Grammar (reimplemented from scratch; ideas only from Fincept Terminal's command bar and ZTerminal's "NVDA EQUITY ANL <GO>", no code copied):
//   SCREEN            type a screen mnemonic to jump (DASH, HOLD, VC, IDEA …)
//   TICKER [EXCH] [EQUITY] FN [GO]   e.g. 0700 DES · 700 HK DES · NVDA US EQUITY VC <GO> · 2330 TT VC  (exchange codes map to suffixes, HK→.HK)
//   /stock QUERY      typed asset search (opens the palette filtered to companies)
//   VERB ARG          SHOCK CAPEX · MODE DEMO · ASK …
// Navigation and display only: no maths here. Talks to app.js through window.WT_APP and to the Value Chain page through its command() hook.
// History is kept in localStorage under winstonTerminal.v1.cmdHistory (last 20 commands, nothing else).

const WTCmd = (function () {
  "use strict";
  const APP = window.WT_APP, $ = function (id) { return document.getElementById(id); };
  if (!APP) return null;
  const esc = APP.esc, HKEY = (typeof STORAGE_PREFIX !== "undefined" ? STORAGE_PREFIX : "winstonTerminal.v1.") + "cmdHistory";
  const VC = function () { return APP.module("valuechain"); };
  const COMPANIES = typeof VC_DATA !== "undefined" ? VC_DATA.companies : [];
  const SHOCKS = { CAPEX: "capex_cut", EXPORT: "export_ctrl", EXPORTS: "export_ctrl", TSMC: "tsmc_price", WAFER: "tsmc_price", HBM: "hbm_short", MEMORY: "hbm_short" };
  const EXCH = { HK: ".HK", US: ".US", UW: ".US", UN: ".US", UQ: ".US", TT: ".TW", TW: ".TW", KS: ".KO", KO: ".KO", KR: ".KO", JP: ".TSE", JT: ".TSE", NA: ".AS", AS: ".AS", CH: ".SHE", CN: ".SHE", SZ: ".SHE" };

  /* ===== SECTION: SCREENS (mnemonic, Alt+n shortcut, route) ===== */
  const SCREENS = [
    { cmd: "DASH", alias: ["PORT", "HOME", "DB"], label: "Dashboard", page: "dashboard", alt: 1 },
    { cmd: "HOLD", alias: ["HDS", "HOLDINGS", "POS"], label: "Holdings", page: "holdings", alt: 2 },
    { cmd: "TX", alias: ["TRAN", "TRADES", "TRANSACTIONS"], label: "Transactions", page: "transactions", alt: 3 },
    { cmd: "IMP", alias: ["EXP", "IMPORT", "EXPORT", "CSV"], label: "Import / Export", page: "import", alt: 4 },
    { cmd: "RULES", alias: ["SET", "SETTINGS"], label: "Rules & Settings", page: "settings", alt: 5 },
    { cmd: "VC", alias: ["SPLC", "CHAIN", "SC"], label: "Value Chain · Supply Chain", page: "valuechain", vcTab: "splc", alt: 6 },
    { cmd: "METH", alias: ["HOW", "METHODOLOGY", "ABOUT"], label: "Methodology", page: "methodology", alt: 7 },
    { cmd: "IDEA", alias: ["IDEAS", "LAB"], label: "Idea Lab (coming soon)", page: "soon-idea", alt: 8 },
    { cmd: "MACRO", alias: ["PEG", "HKMA", "HIBOR"], label: "HK Macro & Peg (coming soon)", page: "soon-macro", alt: 9 },
    { cmd: "BRIEF", alias: ["AM", "MORNING"], label: "Morning Brief (coming soon)", page: "soon-brief" },
    { cmd: "EVT", alias: ["EVENTS", "CAL", "EVENT"], label: "Event Tracker (coming soon)", page: "soon-events" },
    { cmd: "MAP", alias: ["CHAINMAP"], label: "Value Chain · Chain Map", page: "valuechain", vcTab: "map" },
    { cmd: "POOLS", alias: ["PROFIT"], label: "Value Chain · Profit Pools", page: "valuechain", vcTab: "pools" },
    { cmd: "EXPO", alias: ["EXPOSURE"], label: "Value Chain · Exposure", page: "valuechain", vcTab: "exposure" }
  ];
  const FUNCS = {
    DES: "description – position maths for a holding, company card otherwise",
    VC: "supply chain map centred on the company", SPLC: "same as VC", SC: "same as VC",
    PATH: "shock paths into the company (How this is calculated)"
  };

  /* ===== SECTION: COMMAND REGISTRY (verbs that are not screens) ===== */
  const VERBS = [
    { cmd: "SHOCK", alias: ["SIM", "WHATIF"], args: "[CAPEX|EXPORT|TSMC|HBM]", label: "Shock Simulator (optionally run a preset)", run: function (a) {
      const id = a[0] ? SHOCKS[a[0]] : null;
      if (a[0] && !id) return fail("Unknown shock '" + a[0] + "'. Try SHOCK CAPEX, EXPORT, TSMC or HBM.");
      if (!vc(id ? "shock" : "tab", id || "shock")) return fail("Value Chain page isn't loaded.");
      APP.go("valuechain"); return ok(id ? "Ran " + a[0] + " preset" : "Shock Simulator");
    } },
    { cmd: "CHK", alias: ["CHECKS", "DQ"], label: "Data checks panel (Phase 1, 7 checks)", run: function () { APP.showChecks(); return ok("Data checks"); } },
    { cmd: "VCCHK", alias: ["VCCHECKS"], label: "Value-chain data checks (8 checks)", run: function () {
      APP.go("valuechain"); later(function () { const p = $("vc-checks-panel"); if (p) p.scrollIntoView({ block: "center" }); }); return ok("VC checks");
    } },
    { cmd: "TOUR", alias: ["DEMO-TOUR", "GUIDE"], label: "60-second guided tour", run: function () { setTimeout(Tour.start, 0); return ok("Tour"); } },
    { cmd: "HELP", alias: ["?", "KEYS", "H"], label: "Shortcut and command sheet", run: function () { setTimeout(Sheet.open, 0); return ok("Help"); } },
    { cmd: "MODE", args: "DEMO|MY", label: "Switch Demo portfolio / My Portfolio", run: function (a) {
      const m = a[0] === "MY" ? "my" : a[0] === "DEMO" ? "demo" : null; if (!m) return fail("Use MODE DEMO or MODE MY.");
      APP.setMode(m); APP.toast(m === "demo" ? "Demo portfolio" : "My Portfolio (saved in this browser only)"); return ok("Mode " + a[0]);
    } },
    { cmd: "ASK", args: "question", label: "Ask the analyst (copilot is a later phase)", run: function () {
      APP.analyst(true); APP.toast("The Grok analyst comes in a later phase. Nothing was sent anywhere."); return ok("Analyst");
    } },
    { cmd: "CLR", alias: ["CLEAR"], label: "Clear command history", run: function () { hist = []; saveHist(); return ok("History cleared"); } }
  ];
  const SCREEN_BY = {}, VERB_BY = {};
  SCREENS.forEach(function (s) { [s.cmd].concat(s.alias || []).forEach(function (k) { SCREEN_BY[k] = s; }); });
  VERBS.forEach(function (v) { [v.cmd].concat(v.alias || []).forEach(function (k) { VERB_BY[k] = v; }); });

  /* ===== SECTION: HELPERS ===== */
  function ok(msg) { return { ok: true, msg: msg }; }
  function fail(msg) { return { ok: false, msg: msg }; }
  function later(fn) { setTimeout(fn, 80); }
  function vc(op, arg) { const m = VC(); return !!(m && m.command && m.command(op, arg)); }
  function typing(el) { return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }
  let hist = (function () { try { const h = JSON.parse(localStorage.getItem(HKEY) || "[]"); return Array.isArray(h) ? h.filter(function (x) { return typeof x === "string"; }).slice(0, 20) : []; } catch (e) { return []; } })();
  function saveHist() { try { localStorage.setItem(HKEY, JSON.stringify(hist.slice(0, 20))); } catch (e) { /* storage blocked: history stays in memory */ } }
  function remember(c) { hist = [c].concat(hist.filter(function (x) { return x !== c; })).slice(0, 20); saveHist(); }

  /* ===== SECTION: ASSET UNIVERSE + TICKER RESOLUTION ===== */
  function universe() { // holdings of the active portfolio + value-chain companies, one entry per symbol
    const out = [], seen = {};
    APP.holdings().forEach(function (h) { if (!seen[h.symbol]) { seen[h.symbol] = 1; out.push({ symbol: h.symbol, name: h.name, held: true, vc: COMPANIES.some(function (c) { return c.symbol === h.symbol; }) }); } });
    COMPANIES.forEach(function (c) { if (!seen[c.symbol]) { seen[c.symbol] = 1; out.push({ symbol: c.symbol, name: c.name, held: false, vc: true }); } });
    return out;
  }
  function base(s) { const i = s.lastIndexOf("."); return i > 0 ? s.slice(0, i) : s; }
  function short(s) { // what the palette shows: NVDA, 0700, 2330, else the full symbol when the base is ambiguous
    const b = base(s); return universe().filter(function (u) { return base(u.symbol) === b; }).length === 1 ? b : s;
  }
  function resolve(tok) {
    const U = universe(), t = tok.toUpperCase();
    const hit = function (arr) { if (!arr.length) return null; const held = arr.filter(function (u) { return u.held; }); return (held[0] || arr[0]).symbol; };
    let r = hit(U.filter(function (u) { return u.symbol === t; })); if (r) return r;
    const cand = [t]; if (/^\d{1,4}$/.test(t)) cand.push(("0000" + t).slice(-4));
    if (/^\d{1,5}\.HK$/.test(t)) cand.push(("0000" + base(t)).slice(-4) + ".HK");
    r = hit(U.filter(function (u) { return cand.indexOf(u.symbol) >= 0; })); if (r) return r;
    r = hit(U.filter(function (u) { return cand.indexOf(base(u.symbol)) >= 0 && (t.indexOf(".") < 0 || u.symbol.slice(-t.length + t.indexOf(".")) === t.slice(t.indexOf("."))); })); if (r) return r;
    if (t.length >= 3 && !/^\d+$/.test(t)) { // unique company-name prefix, e.g. TENCENT DES
      const byName = U.filter(function (u) { return u.name.toUpperCase().replace(/[^A-Z0-9]/g, "").indexOf(t.replace(/[^A-Z0-9]/g, "")) === 0; });
      if (byName.length === 1 || (byName.length > 1 && byName.every(function (u) { return u.name === byName[0].name; }))) return byName[0].symbol;
    }
    return null;
  }

  /* ===== SECTION: PARSER ===== */
  function parse(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    if (text.charAt(0) === "/") { const m = text.match(/^\/(stock|s|eq|equity|find)?\s*(.*)$/i); return { kind: "search", q: m ? m[2] : text.slice(1) }; }
    let tk = text.toUpperCase().replace(/<GO>/g, " ").split(/\s+/).filter(Boolean);
    if (tk.length > 1 && tk[tk.length - 1] === "GO") tk.pop();
    tk = tk.filter(function (x, i) { return i === 0 || (x !== "EQUITY" && x !== "EQ"); });
    if (!tk.length) return null;
    const head = tk[0];
    if (tk.length === 1 && SCREEN_BY[head]) return { kind: "screen", screen: SCREEN_BY[head] };
    if (VERB_BY[head]) return { kind: "verb", verb: VERB_BY[head], args: tk.slice(1), rest: text.slice(text.indexOf(" ") + 1) };
    let t = head, i = 1;
    if (tk[1] && EXCH[tk[1]] && t.indexOf(".") < 0) { t = t + EXCH[tk[1]]; i = 2; }
    const sym = resolve(t) || (i === 2 ? resolve(head) : null);
    if (sym) {
      const fn = tk[i] || "DES";
      if (!FUNCS[fn]) return { kind: "error", msg: "Unknown function '" + fn + "' for " + APP.sym(sym) + ". Try DES, VC or PATH." };
      return { kind: "fn", sym: sym, fn: fn === "SPLC" || fn === "SC" ? "VC" : fn };
    }
    if (SCREEN_BY[head]) return { kind: "screen", screen: SCREEN_BY[head] };
    return { kind: "error", msg: "Unknown command or ticker '" + head + "'. Type HELP or press ? for the list." };
  }

  /* ===== SECTION: EXECUTION ===== */
  function run(raw) {
    const p = parse(raw); if (!p) return fail("");
    let r;
    if (p.kind === "error") r = fail(p.msg);
    else if (p.kind === "search") { setTimeout(function () { Palette.open("/" + p.q); }, 0); r = ok("Search"); }
    else if (p.kind === "screen") {
      if (p.screen.vcTab) vc("tab", p.screen.vcTab);
      APP.closeModal(); APP.go(p.screen.page); r = ok(p.screen.label);
    } else if (p.kind === "verb") r = p.verb.run(p.args, p.rest);
    else r = runFn(p.sym, p.fn);
    if (r.ok) remember(String(raw).trim().toUpperCase().replace(/\s+/g, " ")); else if (r.msg) APP.toast(r.msg, true);
    return r;
  }
  function runFn(sym, fn) {
    const inVC = COMPANIES.some(function (c) { return c.symbol === sym; });
    if (fn === "DES") {
      if (APP.isHeld(sym)) { APP.drill("row:" + sym); return ok(APP.sym(sym) + " DES"); }
      if (inVC) { vc("drawer", sym); vc("focus", sym); APP.go("valuechain"); return ok(APP.sym(sym) + " DES"); }
      return fail(APP.sym(sym) + " isn't a holding or a value-chain company.");
    }
    if (!inVC) return fail(APP.sym(sym) + " isn't in the value-chain demo set (VC_DATA), so there's no map. Try " + APP.sym(sym) + " DES.");
    APP.closeModal();
    if (fn === "VC") { vc("close-drawer"); vc("focus", sym); APP.go("valuechain"); return ok(APP.sym(sym) + " supply chain"); }
    if (fn === "PATH") { vc("paths", sym); APP.go("valuechain"); later(function () { const h = $("vc-how"); if (h) h.scrollIntoView({ block: "start" }); }); return ok(APP.sym(sym) + " paths"); }
    return fail("Unknown function.");
  }

  /* ===== SECTION: SUGGESTIONS (shared by the command line and the palette) ===== */
  function items() {
    const L = [];
    SCREENS.forEach(function (s) { L.push({ cmd: s.cmd, label: s.label, kind: "Screen", key: s.alt ? "Alt+" + s.alt : "", words: (s.alias || []).join(" ") }); });
    VERBS.forEach(function (v) {
      if (v.cmd === "SHOCK") Object.keys(SHOCKS).filter(function (k) { return ["CAPEX", "EXPORT", "TSMC", "HBM"].indexOf(k) >= 0; }).forEach(function (k) {
        const s = typeof VC_DATA !== "undefined" ? VC_DATA.shocks.find(function (x) { return x.id === SHOCKS[k]; }) : null;
        L.push({ cmd: "SHOCK " + k, label: "Run shock: " + (s ? s.name : k), kind: "Action", words: "scenario what-if" });
      });
      if (v.cmd === "MODE") { L.push({ cmd: "MODE DEMO", label: "Switch to Demo portfolio", kind: "Action" }); L.push({ cmd: "MODE MY", label: "Switch to My Portfolio", kind: "Action" }); return; }
      if (v.cmd === "ASK") return;
      L.push({ cmd: v.cmd, label: v.label, kind: v.cmd === "TOUR" || v.cmd === "HELP" ? "Help" : "Action", key: v.cmd === "HELP" ? "?" : "", words: (v.alias || []).join(" ") });
    });
    universe().forEach(function (u) {
      const s = short(u.symbol);
      L.push({ cmd: s + " DES", label: u.name + (u.held ? " · position maths" : " · company card"), kind: "Asset", asset: true, words: u.symbol + " " + u.name });
      if (u.vc) L.push({ cmd: s + " VC", label: u.name + " · supply chain", kind: "Asset", asset: true, words: u.symbol + " " + u.name });
    });
    return L;
  }
  function score(q, it) { // simple fuzzy: prefix > word start > substring > subsequence; 0 = no match
    const hay = (it.cmd + " " + it.label + " " + (it.words || "")).toUpperCase(), c = it.cmd.toUpperCase();
    if (!q) return 1;
    if (c === q) return 1000; if (c.indexOf(q) === 0) return 500 - c.length;
    if (hay.indexOf(" " + q) >= 0) return 300 - hay.indexOf(" " + q) / 100;
    if (hay.indexOf(q) >= 0) return 200 - hay.indexOf(q) / 100;
    const qs = q.replace(/\s+/g, ""); let i = 0; for (let k = 0; k < hay.length && i < qs.length; k++) if (hay[k] === qs[i]) i++;
    return i === qs.length ? 50 - hay.length / 100 : 0;
  }
  function suggest(q, max, assetsOnly) {
    const Q = String(q || "").trim().toUpperCase();
    return items().filter(function (it) { return !assetsOnly || it.asset; }).map(function (it) { return { it: it, s: score(Q, it) }; })
      .filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, max).map(function (x) { return x.it; });
  }
  function rowHtml(it, i, sel) {
    return '<li role="option" id="' + "opt-" + i + '" class="cmd-opt' + (i === sel ? " sel" : "") + '" data-cmd-run="' + esc(it.cmd) + '" aria-selected="' + (i === sel) + '"><span class="mono c">' + esc(it.cmd) + '</span><span class="l">' + esc(it.label) +
      '</span><span class="k">' + esc(it.key || it.kind || "") + "</span></li>";
  }

  /* ===== SECTION: COMMAND LINE ===== */
  const PINS = ["0700 DES", "NVDA VC", "SHOCK CAPEX", "CHK", "IDEA"];
  const Line = { sel: -1, list: [] };
  function lineInput() { return $("cmd-input"); }
  function showList() {
    const inp = lineInput(), ul = $("cmd-list"), v = inp.value.trim();
    if (!v) Line.list = hist.slice(0, 5).map(function (h) { return { cmd: h, label: "recent", kind: "History" }; })
      .concat(PINS.filter(function (p) { return hist.slice(0, 5).indexOf(p) < 0; }).map(function (p) { const s = suggest(p, 1)[0]; return { cmd: p, label: s ? s.label : "", kind: "Pinned" }; }));
    else Line.list = v.charAt(0) === "/" ? suggest(v.slice(1).replace(/^(stock|s|eq|equity|find)\s*/i, ""), 8, true) : suggest(v, 8);
    if (Line.sel >= Line.list.length) Line.sel = -1;
    ul.innerHTML = Line.list.map(function (it, i) { return rowHtml(it, i, Line.sel); }).join("") || '<li class="cmd-none">No match. Enter runs it anyway; HELP lists commands.</li>';
    ul.hidden = false; inp.setAttribute("aria-expanded", "true");
    inp.setAttribute("aria-activedescendant", Line.sel >= 0 ? "opt-" + Line.sel : "");
  }
  function hideList() { const ul = $("cmd-list"); if (ul) ul.hidden = true; const i = lineInput(); if (i) { i.setAttribute("aria-expanded", "false"); i.removeAttribute("aria-activedescendant"); } Line.sel = -1; }
  function submitLine(text) {
    const inp = lineInput(), r = run(text);
    if (r.ok) { inp.value = ""; hideList(); inp.blur(); } else if (r.msg) inp.select();
    return r;
  }
  function wireLine() {
    const inp = lineInput(); if (!inp) return;
    inp.addEventListener("focus", function () { Line.sel = -1; showList(); });
    inp.addEventListener("input", function () { Line.sel = -1; showList(); });
    inp.addEventListener("blur", function () { setTimeout(hideList, 150); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = Line.list.length; if (!n) return; Line.sel = e.key === "ArrowDown" ? (Line.sel + 1) % n : (Line.sel <= 0 ? n - 1 : Line.sel - 1); showList(); }
      else if (e.key === "Tab" && Line.list.length && inp.value.trim()) { e.preventDefault(); inp.value = Line.list[Math.max(0, Line.sel)].cmd + " "; Line.sel = -1; showList(); }
      else if (e.key === "Enter") { e.preventDefault(); submitLine(Line.sel >= 0 && Line.list[Line.sel] ? Line.list[Line.sel].cmd : inp.value); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (inp.value) { inp.value = ""; showList(); } else { hideList(); inp.blur(); } }
    });
    $("cmd-list").addEventListener("mousedown", function (e) { const li = e.target.closest("[data-cmd-run]"); if (li) { e.preventDefault(); submitLine(li.getAttribute("data-cmd-run")); } });
    const pins = $("cmd-pins");
    if (pins) pins.innerHTML = PINS.map(function (p) { return '<button type="button" class="cmd-pin mono" data-cmd-run="' + esc(p) + '" title="Run ' + esc(p) + '">' + esc(p) + "</button>"; }).join("");
  }

  /* ===== SECTION: OVERLAY BASE (palette + sheet) ===== */
  function overlay(id, cls, label) {
    let el = $(id);
    if (!el) { el = document.createElement("div"); el.id = id; el.className = "cmd-overlay " + cls; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", label); document.body.appendChild(el); }
    return el;
  }
  let lastFocus = null;
  function openOverlay(el) { lastFocus = document.activeElement; Palette.close(true); Sheet.close(true); el.hidden = false; }
  function closeOverlay(el, quiet) {
    if (!el || el.hidden) return;
    if (el.contains(document.activeElement) && document.activeElement.blur) document.activeElement.blur(); // a hidden field must not keep the keyboard
    el.hidden = true; if (!quiet && lastFocus && lastFocus.focus && document.contains(lastFocus) && lastFocus !== lineInput()) lastFocus.focus(); }

  /* ===== SECTION: PALETTE (Ctrl/Cmd+K) ===== */
  const Palette = {
    sel: 0, list: [],
    el: function () { return overlay("cmd-palette", "palette", "Command palette"); },
    open: function (q) {
      const el = Palette.el();
      el.innerHTML = '<div class="cmd-box"><div class="cmd-box-head"><span class="mono cmd-prompt">&gt;</span><input id="pal-input" class="mono" type="text" autocomplete="off" spellcheck="false" placeholder="Search screens, actions, tickers… (/ = companies only)" aria-label="Search commands" role="combobox" aria-controls="pal-list" aria-expanded="true">' +
        '<kbd>Esc</kbd></div><ul id="pal-list" class="cmd-list pal-list" role="listbox"></ul><div class="cmd-box-foot note">↑↓ move · Enter run · Tab copy to command line · the left column is the command you can type yourself</div></div>';
      openOverlay(el);
      const inp = $("pal-input"); inp.value = q || ""; Palette.sel = 0; Palette.render(); inp.focus();
      inp.addEventListener("input", function () { Palette.sel = 0; Palette.render(); });
      inp.addEventListener("keydown", function (e) {
        const n = Palette.list.length;
        if (e.key === "ArrowDown" && n) { e.preventDefault(); Palette.sel = (Palette.sel + 1) % n; Palette.render(); }
        else if (e.key === "ArrowUp" && n) { e.preventDefault(); Palette.sel = (Palette.sel - 1 + n) % n; Palette.render(); }
        else if (e.key === "Enter") { e.preventDefault(); const it = Palette.list[Palette.sel]; Palette.close(true); if (it) run(it.cmd); else if (inp.value.trim()) run(inp.value); }
        else if (e.key === "Tab" && n) { e.preventDefault(); const it = Palette.list[Palette.sel]; Palette.close(true); const li = lineInput(); li.value = it.cmd; li.focus(); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); Palette.close(); }
      });
      el.onmousedown = function (e) { if (e.target === el) Palette.close(); const li = e.target.closest("[data-cmd-run]"); if (li) { e.preventDefault(); Palette.close(true); run(li.getAttribute("data-cmd-run")); } };
    },
    render: function () {
      const v = $("pal-input").value.trim(), assets = v.charAt(0) === "/";
      Palette.list = suggest(assets ? v.slice(1).replace(/^(stock|s|eq|equity|find)\s*/i, "") : v, assets ? 40 : 14, assets);
      $("pal-list").innerHTML = Palette.list.map(function (it, i) { return rowHtml(it, i, Palette.sel); }).join("") || '<li class="cmd-none">No match.</li>';
      const s = $("pal-list").querySelector(".sel"); if (s && s.scrollIntoView) s.scrollIntoView({ block: "nearest" });
    },
    close: function (quiet) { closeOverlay($("cmd-palette"), quiet); }
  };

  /* ===== SECTION: "?" SHEET (shortcuts + grammar) ===== */
  const Sheet = {
    open: function () {
      const el = overlay("cmd-sheet", "sheet", "Keyboard shortcuts and commands");
      const kb = [["/ or `", "Focus the command line"], ["Ctrl+K / ⌘K", "Command palette"], ["?", "This sheet"], ["Alt+1 … Alt+9", "Jump to a screen (see list)"], ["↑ ↓ · Tab · Enter", "Pick, complete, run a suggestion"], ["Esc", "Close / clear"], ["← →", "Back / next in the tour"]];
      const tr = function (a, b, c) { return "<tr><td class=\"mono k\">" + a + "</td><td>" + b + "</td>" + (c !== undefined ? '<td class="mono note">' + c + "</td>" : "") + "</tr>"; };
      el.innerHTML = '<div class="cmd-box sheet-box"><div class="panel-head"><span class="panel-title">Shortcuts &amp; commands</span><span class="src-chip">Phase 2</span><button class="icon-btn" data-cmd-ui="close-sheet" aria-label="Close">×</button></div>' +
        '<div class="sheet-grid"><div><h4>Keyboard</h4><table class="sheet-t">' + kb.map(function (r) { return tr(esc(r[0]), esc(r[1])); }).join("") + "</table>" +
        "<h4>Grammar</h4><table class=\"sheet-t\">" + tr("SCREEN", "Jump to a screen") + tr("TICKER [EXCH] FN", "0700 DES · 700 HK DES · NVDA US EQUITY VC &lt;GO&gt;") +
        tr("FN", "DES (default) · VC / SPLC · PATH") + tr("/stock QUERY", "Search companies, e.g. /stock tencent") + tr("EXCH", "HK · US/UW/UN · TT · KS · JP · NA · CH") +
        '</table><p class="note">Ticker codes: 700 = 0700.HK, NVDA = NVDA.US, 2330 = 2330.TW. Company names work too (TENCENT DES).</p></div>' +
        "<div><h4>Screens</h4><table class=\"sheet-t\">" + SCREENS.map(function (s) { return tr(esc(s.cmd), esc(s.label), s.alt ? "Alt+" + s.alt : ""); }).join("") + "</table>" +
        "<h4>Actions</h4><table class=\"sheet-t\">" + VERBS.map(function (v) { return tr(esc(v.cmd + (v.args ? " " + v.args : "")), esc(v.label)); }).join("") + "</table></div></div>" +
        '<p class="note">Every screen can be reached from the keyboard. Commands only navigate and display; all maths stays in calc.js / vc-calc.js.</p></div>';
      openOverlay(el);
      el.onmousedown = function (e) { if (e.target === el) Sheet.close(); };
      const b = el.querySelector("[data-cmd-ui=close-sheet]"); if (b) b.focus();
    },
    close: function (quiet) { closeOverlay($("cmd-sheet"), quiet); }
  };

  /* ===== SECTION: GUIDED TOUR (recruiter walkthrough, ~60 s, 9 steps) ===== */
  // Numbers in the copy are read from the screen at each step, so the tour never states a figure the page doesn't show.
  const txt = function (sel, fb) { const e = document.querySelector(sel); return e ? e.textContent.trim() : fb; };
  const STEPS = [
    { sel: ".header", title: "Winston Terminal", prep: function () { APP.closeModal(); APP.go("dashboard"); },
      body: function () { return "A Bloomberg-style HK/US investment cockpit on a labelled <b>demo portfolio</b>. The chips at the top are live data-quality checks: <b>" + esc(txt("#checks-chip", "")) + "</b> and <b>" + esc(txt("#vc-chip", "")) + "</b>."; } },
    { sel: "#page-dashboard .grid", title: "Every number is calculated, not typed", prep: function () { APP.go("dashboard"); },
      body: function () { return "Total value <b>HKD " + esc(txt("#page-dashboard .kpi .big", "—")) + "</b> comes from calc.js (qty × price × FX). Click any KPI or row for the maths behind it."; } },
    { sel: "#checks-panel", title: "Trust layer: 7 data checks", prep: function () { APP.go("dashboard"); },
      body: function () { return "Seven checks re-run on every change (weights sum to 100%, FX inside the 7.75–7.85 peg band, no unpriced positions …). A failure turns the header chip red."; } },
    { sel: ".splc-svg", title: "Supply chain, SPLC-style", prep: function () { vc("overlay", "none"); vc("focus", "NVDA.US"); APP.go("valuechain"); },
      body: function () { return "NVIDIA in the centre, suppliers left, customers right. Line width = illustrative $ flow; labels show the % of supplier revenue and customer cost. Click any box to re-centre. <i>Illustrative data, not a forecast.</i>"; } },
    { sel: ".splc-shockbar", title: "What-if: hyperscaler capex −20%", prep: function () { vc("overlay", "capex_cut"); vc("focus", "NVDA.US"); APP.go("valuechain"); },
      body: function () { return "The shock travels upstream and recolours the chain. Portfolio impact <b>HKD " + esc(txt(".splc-kpi b", "—")) + "</b>, the same figure as the Shock Simulator (tested to the dollar)."; } },
    { sel: "#vc-how", title: "How this is calculated", prep: function () { vc("overlay", "none"); vc("shock", "capex_cut"); APP.go("valuechain"); },
      body: function () { return "Every path is listed with its weights, so a reviewer can rebuild any number by hand. Deterministic, linear, no black box."; } },
    { sel: "#cmd", title: "Terminal fluency: the command line", prep: function () { APP.closeModal(); vc("tab", "splc"); APP.go("dashboard"); const i = lineInput(); if (i) i.value = "0700 DES"; },
      body: function () { return "Type <b class=\"mono\">0700 DES</b>, <b class=\"mono\">NVDA VC</b> or <b class=\"mono\">SHOCK CAPEX</b>. Press <b class=\"mono\">/</b> to focus, <b class=\"mono\">Ctrl+K</b> for the palette, <b class=\"mono\">?</b> for every shortcut. Next runs it."; } },
    { sel: ".modal", title: "0700 DES", prep: function () { const i = lineInput(); if (i) i.value = ""; runFn(resolve("0700") || "0700.HK", "DES"); },
      body: function () { return "Tencent's position maths: quantity, average cost, FX and P&amp;L, with its source and as-of date."; } },
    { sel: ".nav", title: "On the roadmap", prep: function () { APP.closeModal(); if (window.matchMedia("(max-width: 900px)").matches) $("sidebar").classList.add("open"); },
      body: function () { return "Next modules: <b>Idea Lab</b> (news → thesis → chain → watchlist with kill criteria), <b>HK Macro &amp; Peg</b> (live HKMA data), <b>Morning Brief</b> (Grok, pre-generated with sources) and <b>Event Tracker</b>."; } },
    { sel: null, title: "Built by Winston Leung", prep: function () { $("sidebar").classList.remove("open"); APP.go("dashboard"); },
      body: function () { return "Vanilla JavaScript, no build step, no API keys or trackers in the page. Maths lives in two pure files with automated tie-out tests. Demo data is always labelled. <span class=\"note\">Read the Methodology page for the formulas.</span>"; } }
  ];
  const Tour = {
    i: -1, el: null,
    start: function () {
      Palette.close(true); Sheet.close(true); hideList(); const ts = $("toast"); if (ts) ts.hidden = true;
      if (!Tour.el) {
        Tour.el = document.createElement("div"); Tour.el.id = "tour"; Tour.el.className = "tour"; Tour.el.setAttribute("role", "dialog"); Tour.el.setAttribute("aria-modal", "true"); Tour.el.setAttribute("aria-label", "Guided tour");
        Tour.el.innerHTML = '<div class="tour-block"></div><div class="tour-spot" aria-hidden="true"></div><div class="tour-card" tabindex="-1"><div class="tour-top"><span class="tour-step mono"></span><span class="tour-bar"><i></i></span><button class="icon-btn" data-tour="end" aria-label="Close tour">×</button></div>' +
          '<h3 class="tour-title"></h3><p class="tour-body"></p><div class="tour-actions"><button class="btn" data-tour="end">Skip</button><span class="tour-sp"></span><button class="btn" data-tour="back">← Back</button><button class="btn primary" data-tour="next">Next →</button></div></div>';
        document.body.appendChild(Tour.el);
        Tour.el.addEventListener("click", function (e) { const b = e.target.closest("[data-tour]"); if (!b) return; const a = b.getAttribute("data-tour"); if (a === "next") Tour.go(Tour.i + 1); else if (a === "back") Tour.go(Tour.i - 1); else if (a === "end") Tour.end(); else if (a === "meth") { Tour.end(); APP.go("methodology"); } });
        window.addEventListener("resize", Tour.place); window.addEventListener("scroll", Tour.place, true);
      }
      document.body.classList.add("touring"); Tour.el.hidden = false; Tour.go(0);
    },
    go: function (n) {
      if (n < 0) return; if (n >= STEPS.length) return Tour.end();
      Tour.i = n; const s = STEPS[n];
      try { s.prep(); } catch (e) { /* a missing page must not break the tour */ }
      setTimeout(function () {
        if (Tour.i !== n) return;
        const t = s.sel ? document.querySelector(s.sel) : null;
        if (!t || t.closest(".header")) window.scrollTo(0, 0); else if (t.scrollIntoView) t.scrollIntoView({ block: "center" });
        const card = Tour.el.querySelector(".tour-card");
        Tour.el.querySelector(".tour-step").textContent = (n + 1) + " / " + STEPS.length;
        Tour.el.querySelector(".tour-bar i").style.width = ((n + 1) / STEPS.length * 100).toFixed(0) + "%";
        Tour.el.querySelector(".tour-title").textContent = s.title;
        Tour.el.querySelector(".tour-body").innerHTML = s.body() + (n === STEPS.length - 1 ? ' <a href="#methodology" data-tour="meth">Open Methodology</a>' : "");
        Tour.el.querySelector("[data-tour=back]").disabled = n === 0;
        Tour.el.querySelector("[data-tour=next]").textContent = n === STEPS.length - 1 ? "Finish" : "Next →";
        Tour.el.setAttribute("data-step", String(n + 1));
        Tour.place(); card.focus({ preventScroll: true });
      }, 140);
    },
    place: function () {
      if (!Tour.el || Tour.el.hidden || Tour.i < 0) return;
      const s = STEPS[Tour.i], t = s.sel ? document.querySelector(s.sel) : null, spot = Tour.el.querySelector(".tour-spot"), card = Tour.el.querySelector(".tour-card");
      const W = window.innerWidth, H = window.innerHeight, phone = W <= 600;
      let r = t && t.getClientRects().length ? t.getBoundingClientRect() : null;
      if (r) { const pad = 4, top = Math.max(r.top - pad, 2), bot = Math.min(r.bottom + pad, H - 2); r = { left: Math.max(r.left - pad, 2), top: top, width: Math.min(r.width + 2 * pad, W - 4), height: Math.max(bot - top, 8) }; }
      spot.hidden = !r; Tour.el.classList.toggle("no-spot", !r);
      if (r) { spot.style.left = r.left + "px"; spot.style.top = r.top + "px"; spot.style.width = r.width + "px"; spot.style.height = r.height + "px"; }
      card.className = "tour-card" + (phone ? " dock" : "") + (!r ? " centre" : "");
      if (phone || !r) { card.style.left = card.style.top = ""; return; }
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let top = r.top + r.height + 10; if (top + ch > H - 8) top = r.top - ch - 10; if (top < 8) top = Math.max(8, Math.min(H - ch - 8, r.top + 12));
      const left = Math.max(8, Math.min(W - cw - 8, r.left));
      card.style.left = left + "px"; card.style.top = top + "px";
    },
    end: function () {
      if (!Tour.el || Tour.el.hidden) return;
      Tour.el.hidden = true; Tour.i = -1; document.body.classList.remove("touring");
      APP.closeModal(); vc("overlay", "none"); vc("tab", "splc"); $("sidebar").classList.remove("open");
      const i = lineInput(); if (i) i.value = "";
      APP.go("dashboard"); const b = $("tour-btn"); if (b) b.focus();
    },
    active: function () { return !!(Tour.el && !Tour.el.hidden); }
  };

  /* ===== SECTION: GLOBAL KEYS + CLICKS ===== */
  document.addEventListener("keydown", function (e) {
    const t = e.target, k = e.key;
    if (Tour.active()) {
      if (k === "Escape") { e.preventDefault(); Tour.end(); }
      else if ((k === "ArrowRight" || k === "Enter") && !(t && t.tagName === "BUTTON" && k === "Enter")) { e.preventDefault(); Tour.go(Tour.i + 1); }
      else if (k === "ArrowLeft") { e.preventDefault(); Tour.go(Tour.i - 1); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === "k" || k === "K")) { e.preventDefault(); const p = $("cmd-palette"); if (p && !p.hidden) Palette.close(); else Palette.open(""); return; }
    if (k === "Escape") { Palette.close(); Sheet.close(); return; }
    if (typing(t) || e.ctrlKey || e.metaKey) return;
    if (e.altKey && /^Digit[1-9]$/.test(e.code || "")) {
      const s = SCREENS.find(function (x) { return x.alt === Number(e.code.slice(5)); });
      if (s) { e.preventDefault(); run(s.cmd); } return;
    }
    if (e.altKey) return;
    if (k === "/" || k === "`") { e.preventDefault(); Palette.close(true); Sheet.close(true); lineInput().focus(); }
    else if (k === "?") { e.preventDefault(); const sh = $("cmd-sheet"); if (sh && !sh.hidden) Sheet.close(); else Sheet.open(); }
  });
  document.addEventListener("click", function (e) {
    const el = e.target.closest && e.target.closest("[data-cmd-ui],[data-cmd-run]"); if (!el || (el.closest("#cmd-list") || el.closest(".cmd-overlay.palette"))) return;
    if (el.hasAttribute("data-cmd-run")) { run(el.getAttribute("data-cmd-run")); return; }
    const a = el.getAttribute("data-cmd-ui");
    if (a === "palette") Palette.open(""); else if (a === "help") Sheet.open(); else if (a === "close-sheet") Sheet.close(); else if (a === "tour") Tour.start();
  });

  /* ===== SECTION: START ===== */
  wireLine();
  if (/[?&]tour(=1)?(&|$)/.test(location.search)) setTimeout(Tour.start, 300); // shareable link: index.html?tour=1

  /* ===== SECTION: PUBLIC API (tests + console) ===== */
  return { parse: parse, run: run, resolve: resolve, suggest: suggest, tour: Tour, palette: Palette, sheet: Sheet, screens: SCREENS, verbs: VERBS };
})();

// END OF FILE: cmd.js
