// calc.js – Winston Terminal v1: all calculations as pure functions (no DOM, no clock, no storage)
// Method: average cost. Full precision inside; round only for display (app.js) or export.

const Calc = (function () {
  "use strict";

  /* ===== SECTION: SMALL HELPERS ===== */
  const EPS = 1e-9;
  function num(v) {
    if (v === null || v === undefined || v === "") return NaN;
    if (typeof v === "number") return v;
    return Number(String(v).replace(/[,\s]/g, "").replace(/^(HK\$|US\$|\$)/i, ""));
  }
  function isPos(v) { return isFinite(v) && v > 0; }
  function fxToHKD(currency, settings) { return currency === "USD" ? num(settings.usd_hkd_rate) : 1; }
  function sortTransactions(txs) {
    return txs.map(function (t, i) { return { t: t, i: i }; })
      .sort(function (a, b) { return a.t.trade_date < b.t.trade_date ? -1 : a.t.trade_date > b.t.trade_date ? 1 : a.i - b.i; })
      .map(function (x) { return x.t; });
  }

  /* ===== SECTION: POSITION BUILDER (average-cost method) ===== */
  // BUY: qty += q; cost += q*price + fees.  SELL: realised += q*(price - avg) - fees; cost -= q*avg; qty -= q.
  // DIV: income += q*price - fees (q = shares, price = dividend per share).  FEE: income -= q*price + fees.
  function buildPosition(holding, txs, settings) {
    const fx = fxToHKD(holding.currency, settings);
    let qty = 0, cost = 0, realised = 0, income = 0, minQty = 0, minQtyDate = "";
    const steps = [];
    sortTransactions(txs.filter(function (t) { return t.symbol === holding.symbol; })).forEach(function (t) {
      const q = num(t.quantity) || 0, p = num(t.price) || 0, f = num(t.fees) || 0;
      let r = 0, avgBefore = qty > EPS ? cost / qty : 0;
      if (t.type === "BUY") { qty += q; cost += q * p + f; }
      else if (t.type === "SELL") {
        r = q * (p - avgBefore) - f; realised += r; qty -= q;
        cost = qty > EPS ? cost - q * avgBefore : 0;
      }
      else if (t.type === "DIV") { r = q * p - f; income += r; }
      else if (t.type === "FEE") { r = -(q * p + f); income += r; }
      if (Math.abs(qty) < EPS) qty = 0;
      if (qty < minQty) { minQty = qty; minQtyDate = t.trade_date; }
      steps.push({ tx: t, qtyAfter: qty, costAfter: cost, avgAfter: qty > EPS ? cost / qty : 0, avgBefore: avgBefore, cashEffect: r });
    });
    const price = num(holding.last_price);
    const hasPrice = isPos(price);
    const avg = qty > EPS ? cost / qty : 0;
    const valueLocal = hasPrice ? qty * price : 0;
    const unrealLocal = hasPrice ? valueLocal - cost : null;
    return {
      symbol: holding.symbol, name: holding.name, market: holding.market, currency: holding.currency,
      sector: holding.sector || "Unclassified", last_price: hasPrice ? price : null,
      last_price_date: holding.last_price_date || "", price_note: holding.price_note || "",
      hasPrice: hasPrice, fx: fx, qty: qty, avgCost: avg, costLocal: cost, costHKD: cost * fx,
      valueLocal: valueLocal, valueHKD: valueLocal * fx,
      unrealLocal: unrealLocal, unrealHKD: unrealLocal === null ? null : unrealLocal * fx,
      unrealPct: unrealLocal === null || cost <= EPS ? null : unrealLocal / cost * 100,
      drawdownPct: hasPrice && avg > EPS ? (avg - price) / avg * 100 : null,
      realisedLocal: realised, realisedHKD: realised * fx, incomeLocal: income, incomeHKD: income * fx,
      minQty: minQty, minQtyDate: minQtyDate, steps: steps, weightPct: 0, status: "OK", reasons: []
    };
  }

  /* ===== SECTION: RISK CLASSIFICATION (Flag / Watch / OK) ===== */
  function classify(row, s) {
    const reasons = [];
    const w = row.weightPct, d = row.drawdownPct;
    if (w > num(s.max_weight_pct)) reasons.push({ kind: "weight", level: "FLAG", value: w, limit: num(s.max_weight_pct) });
    else if (w > num(s.watch_weight_pct)) reasons.push({ kind: "weight", level: "WATCH", value: w, limit: num(s.watch_weight_pct) });
    if (d !== null && d > num(s.max_drawdown_pct)) reasons.push({ kind: "drawdown", level: "FLAG", value: d, limit: num(s.max_drawdown_pct), avg: row.avgCost });
    else if (d !== null && d > num(s.watch_drawdown_pct)) reasons.push({ kind: "drawdown", level: "WATCH", value: d, limit: num(s.watch_drawdown_pct), avg: row.avgCost });
    const status = reasons.some(function (r) { return r.level === "FLAG"; }) ? "FLAG" : reasons.length ? "WATCH" : "OK";
    return { status: status, reasons: reasons };
  }

  /* ===== SECTION: SPLITS (sector / market / currency) ===== */
  function splitBy(rows, key, total) {
    const map = {};
    rows.forEach(function (r) { map[r[key]] = (map[r[key]] || 0) + r.valueHKD; });
    return Object.keys(map).map(function (k) { return { key: k, valueHKD: map[k], pct: total > 0 ? map[k] / total * 100 : 0 }; })
      .sort(function (a, b) { return b.valueHKD - a.valueHKD; });
  }

  /* ===== SECTION: PORTFOLIO MODEL ===== */
  function computePortfolio(holdings, transactions, settings) {
    const all = holdings.map(function (h) { return buildPosition(h, transactions, settings); });
    const rows = all.filter(function (r) { return r.qty !== 0; });
    let value = 0, cost = 0, pricedCost = 0, unreal = 0, realised = 0, income = 0, unpriced = 0;
    rows.forEach(function (r) {
      value += r.valueHKD; cost += r.costHKD;
      if (r.hasPrice) { pricedCost += r.costHKD; unreal += r.unrealHKD; } else unpriced++;
    });
    all.forEach(function (r) { realised += r.realisedHKD; income += r.incomeHKD; });
    rows.forEach(function (r) {
      r.weightPct = value > 0 ? r.valueHKD / value * 100 : 0;
      const c = classify(r, settings); r.status = c.status; r.reasons = c.reasons;
    });
    let largest = null;
    rows.forEach(function (r) { if (!largest || r.valueHKD > largest.valueHKD) largest = r; });
    const model = {
      rows: rows, allRows: all,
      totals: { positions: rows.length, valueHKD: value, costHKD: cost, pricedCostHKD: pricedCost, unrealHKD: unreal,
        unrealPct: pricedCost > 0 ? unreal / pricedCost * 100 : null, realisedHKD: realised, incomeHKD: income, unpriced: unpriced },
      splits: { sector: splitBy(rows, "sector", value), market: splitBy(rows, "market", value), currency: splitBy(rows, "currency", value) },
      largest: largest,
      flags: rows.filter(function (r) { return r.status === "FLAG"; }),
      watch: rows.filter(function (r) { return r.status === "WATCH"; })
    };
    model.checks = runDataChecks(model, holdings, transactions, settings);
    model.checksPassed = model.checks.filter(function (c) { return c.pass; }).length;
    return model;
  }

  /* ===== SECTION: DATA CHECKS (7) ===== */
  function runDataChecks(model, holdings, transactions, settings) {
    const rows = model.rows, t = model.totals, out = [];
    const near100 = function (x) { return Math.abs(x - 100) <= 0.1; };
    const sumPct = function (arr) { return arr.reduce(function (a, x) { return a + x.pct; }, 0); };
    const empty = rows.length === 0 || !(t.valueHKD > 0); // nothing priced yet: check 5 reports it
    const emptyMsg = rows.length === 0 ? "No positions yet" : "No priced positions yet (see check 5)";
    // 1. Weights sum to 100%
    const wSum = rows.reduce(function (a, r) { return a + r.weightPct; }, 0);
    out.push({ id: 1, label: "Weights sum to 100% (±0.1)", pass: empty || near100(wSum),
      detail: empty ? emptyMsg : "Sum = " + wSum.toFixed(4) + "%" });
    // 2. Sector, market and currency splits each sum to 100%
    const sp = ["sector", "market", "currency"].map(function (k) { return { k: k, s: sumPct(model.splits[k]) }; });
    out.push({ id: 2, label: "Sector, market and currency splits each sum to 100%", pass: empty || sp.every(function (x) { return near100(x.s); }),
      detail: empty ? emptyMsg : sp.map(function (x) { return x.k + " " + x.s.toFixed(2) + "%"; }).join(" · ") });
    // 3. Total value equals the sum of rows (recomputed independently from qty × price × FX)
    const recomputed = rows.reduce(function (a, r) { return a + (r.hasPrice ? r.qty * r.last_price * fxToHKD(r.currency, settings) : 0); }, 0);
    out.push({ id: 3, label: "Total Value HKD equals the sum of rows", pass: Math.abs(recomputed - t.valueHKD) < 0.005,
      detail: "Total " + t.valueHKD.toFixed(2) + " vs rows " + recomputed.toFixed(2) });
    // 4. No negative quantity at any date
    const neg = model.allRows.filter(function (r) { return r.minQty < 0; });
    out.push({ id: 4, label: "No negative quantity at any date", pass: neg.length === 0,
      detail: neg.length ? neg.map(function (r) { return r.symbol + " " + r.minQty + " on " + r.minQtyDate; }).join("; ") : "All running quantities ≥ 0" });
    // 5. Every holding has a last price > 0 and a price date
    const noPrice = holdings.filter(function (h) { return !isPos(num(h.last_price)) || !h.last_price_date; });
    out.push({ id: 5, label: "Every holding has a last price > 0 and a price date", pass: noPrice.length === 0,
      detail: noPrice.length ? "Missing: " + noPrice.map(function (h) { return h.symbol; }).join(", ") : holdings.length + " of " + holdings.length + " priced" });
    // 6. Every transaction symbol exists in holdings
    const known = {}; holdings.forEach(function (h) { known[h.symbol] = true; });
    const orphan = []; transactions.forEach(function (x) { if (!known[x.symbol] && orphan.indexOf(x.symbol) < 0) orphan.push(x.symbol); });
    out.push({ id: 6, label: "Every transaction symbol exists in holdings", pass: orphan.length === 0,
      detail: orphan.length ? "Unknown: " + orphan.join(", ") : transactions.length + " transactions matched" });
    // 7. USD/HKD within band
    const fx = num(settings.usd_hkd_rate);
    out.push({ id: 7, label: "USD/HKD is within 7.75–7.85", pass: isFinite(fx) && fx >= 7.75 && fx <= 7.85, detail: "Rate = " + fx });
    return out;
  }

  /* ===== SECTION: CSV PARSING ===== */
  function parseCSV(text) {
    const rows = []; let row = [], field = "", q = false;
    text = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
  }

  const IMPORT_FIELDS = ["date", "ticker", "type", "qty", "price", "currency", "fees"];
  const FIELD_SYNONYMS = {
    date: ["date", "trade_date", "tradedate", "tradedt", "trade date"], ticker: ["ticker", "symbol", "code", "stock", "stockcode"],
    type: ["type", "side", "action", "buysell"], qty: ["qty", "quantity", "shares", "units", "volume"],
    price: ["price", "unitprice", "tradeprice"], currency: ["currency", "ccy", "cur"], fees: ["fees", "fee", "commission", "charges", "costs"]
  };
  function guessMapping(headers) {
    const norm = headers.map(function (h) { return String(h).toLowerCase().replace(/[^a-z_ ]/g, "").trim(); });
    const m = {};
    IMPORT_FIELDS.forEach(function (f) {
      m[f] = -1;
      norm.forEach(function (h, i) { if (m[f] < 0 && (FIELD_SYNONYMS[f].indexOf(h) >= 0 || FIELD_SYNONYMS[f].indexOf(h.replace(/[ _]/g, "")) >= 0)) m[f] = i; });
    });
    return m;
  }

  /* ===== SECTION: IMPORT VALIDATION ===== */
  function normaliseTicker(raw) {
    let s = String(raw || "").trim().toUpperCase();
    if (!s) return null;
    if (/^\d{1,5}(\.HK)?$/.test(s)) { const d = s.replace(".HK", ""); return (d.length < 4 ? ("0000" + d).slice(-4) : d) + ".HK"; }
    if (!/\.US$/.test(s) && /^[A-Z][A-Z0-9]{0,5}([.\-][A-Z])?$/.test(s)) s = s + ".US";
    s = s.replace(/^([A-Z][A-Z0-9]{0,5})\.([A-Z])\.US$/, "$1-$2.US");
    return /^\d{4,5}\.HK$/.test(s) || /^[A-Z][A-Z0-9]{0,5}(-[A-Z])?\.US$/.test(s) ? s : null;
  }
  function parseDate(raw) {
    const s = String(raw || "").trim(); let y, mo, d, m;
    if ((m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; } // DD/MM/YYYY (HK style)
    else return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  }
  function normaliseType(raw) {
    const s = String(raw || "").trim().toUpperCase();
    return { B: "BUY", BUY: "BUY", S: "SELL", SELL: "SELL", DIV: "DIV", DIVIDEND: "DIV", FEE: "FEE", FEES: "FEE" }[s] || null;
  }
  function txKey(t) { return [t.trade_date, t.symbol, t.type, num(t.quantity), num(t.price)].join("|"); }

  // Returns one preview row per CSV data row: status "ok" | "duplicate" | "error".
  function validateImport(dataRows, mapping, existingTxs, todayISO) {
    const seen = {}; (existingTxs || []).forEach(function (t) { seen[txKey(t)] = "existing"; });
    const out = dataRows.map(function (cells, idx) {
      const get = function (f) { return mapping[f] >= 0 ? String(cells[mapping[f]] === undefined ? "" : cells[mapping[f]]).trim() : ""; };
      const errors = [];
      const date = parseDate(get("date"));
      if (!date) errors.push("bad date '" + get("date") + "'");
      else if (todayISO && date > todayISO) errors.push("date is in the future");
      const symbol = normaliseTicker(get("ticker"));
      if (!symbol) errors.push("bad ticker '" + get("ticker") + "'");
      const type = normaliseType(get("type"));
      if (!type) errors.push("bad type '" + get("type") + "'");
      const isFee = type === "FEE";
      const qty = isFee && get("qty") === "" ? 0 : num(get("qty")), price = isFee && get("price") === "" ? 0 : num(get("price"));
      const feesRaw = get("fees"), fees = feesRaw === "" ? 0 : num(feesRaw);
      if (!isFee) {
        if (!isFinite(qty) || qty <= 0) errors.push("qty must be > 0");
        if (get("price") === "" || !isFinite(price)) errors.push("missing price");
        else if (price <= 0) errors.push("price must be > 0");
      } else if (!isFinite(qty) || qty < 0 || !isFinite(price) || price < 0 || !(fees > 0 || qty * price > 0)) errors.push("FEE needs a positive amount (fees, or qty × price)");
      if (!isFinite(fees) || fees < 0) errors.push("fees must be ≥ 0");
      const market = symbol ? symbol.slice(-2) : null, mktCcy = market === "US" ? "USD" : "HKD";
      let ccy = get("currency").toUpperCase() || (symbol ? mktCcy : "");
      if (symbol && ccy !== mktCcy) errors.push("currency " + ccy + " doesn't match " + market + " market (" + mktCcy + ")");
      const tx = errors.length ? null : { symbol: symbol, trade_date: date, type: type, quantity: isFinite(qty) ? qty : 0,
        price: isFinite(price) ? price : 0, currency: ccy, fees: fees, note: "CSV import", source: "csv" };
      let status = errors.length ? "error" : "ok", dupOf = null;
      if (tx) { const k = txKey(tx); if (seen[k]) { status = "duplicate"; dupOf = seen[k]; } else seen[k] = "row " + (idx + 2); }
      return { line: idx + 2, cells: cells, tx: tx, status: status, errors: errors, dupOf: dupOf };
    });
    return { rows: out, counts: {
      ok: out.filter(function (r) { return r.status === "ok"; }).length,
      duplicate: out.filter(function (r) { return r.status === "duplicate"; }).length,
      error: out.filter(function (r) { return r.status === "error"; }).length } };
  }

  /* ===== SECTION: APPLY IMPORT (returns a new portfolio; input untouched) ===== */
  function applyImport(portfolio, previewRows, includeDuplicates) {
    const pf = JSON.parse(JSON.stringify(portfolio || { holdings: [], transactions: [] }));
    const known = {}; pf.holdings.forEach(function (h) { known[h.symbol] = true; });
    let imported = 0, skipped = 0; const created = [];
    previewRows.forEach(function (r) {
      if (r.status === "error") return;
      if (r.status === "duplicate" && !includeDuplicates) { skipped++; return; }
      pf.transactions.push(r.tx); imported++;
      if (!known[r.tx.symbol]) {
        known[r.tx.symbol] = true; created.push(r.tx.symbol);
        const us = r.tx.symbol.slice(-3) === ".US";
        pf.holdings.push({ symbol: r.tx.symbol, name: r.tx.symbol.replace(/\.US$/, ""), market: us ? "US" : "HK", currency: us ? "USD" : "HKD",
          sector: "Unclassified", last_price: null, last_price_date: "", price_note: "Added by CSV import – enter a price" });
      }
    });
    return { portfolio: pf, imported: imported, skipped: skipped, created: created };
  }

  /* ===== SECTION: CSV EXPORT ===== */
  function csvCell(v) { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(header, rows) { return [header].concat(rows).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n"; }
  function r2(x) { return x === null || !isFinite(x) ? "" : Math.round(x * 100) / 100; }
  function r4(x) { return x === null || !isFinite(x) ? "" : Math.round(x * 10000) / 10000; }
  function holdingsCSV(model) {
    return toCSV(["symbol", "name", "market", "currency", "sector", "quantity", "avg_cost", "last_price", "last_price_date", "value_local",
      "fx_to_hkd", "value_hkd", "cost_hkd", "unrealised_hkd", "unrealised_pct", "realised_hkd", "weight_pct", "status"],
      model.rows.map(function (r) {
        return [r.symbol, r.name, r.market, r.currency, r.sector, r.qty, r4(r.avgCost), r.last_price === null ? "" : r.last_price, r.last_price_date,
          r2(r.valueLocal), r.fx, r2(r.valueHKD), r2(r.costHKD), r2(r.unrealHKD), r4(r.unrealPct), r2(r.realisedHKD), r4(r.weightPct), r.status];
      }));
  }
  function transactionsCSV(txs) {
    return toCSV(["date", "ticker", "type", "qty", "price", "currency", "fees", "note", "source"],
      sortTransactions(txs).map(function (t) { return [t.trade_date, t.symbol, t.type, t.quantity, t.price, t.currency, t.fees || 0, t.note || "", t.source || ""]; }));
  }

  /* ===== SECTION: PUBLIC API ===== */
  return {
    num: num, fxToHKD: fxToHKD, sortTransactions: sortTransactions, buildPosition: buildPosition, classify: classify,
    splitBy: splitBy, computePortfolio: computePortfolio, runDataChecks: runDataChecks,
    parseCSV: parseCSV, IMPORT_FIELDS: IMPORT_FIELDS, guessMapping: guessMapping, normaliseTicker: normaliseTicker,
    parseDate: parseDate, normaliseType: normaliseType, txKey: txKey, validateImport: validateImport, applyImport: applyImport,
    holdingsCSV: holdingsCSV, transactionsCSV: transactionsCSV
  };
})();

// END OF FILE: calc.js
