// data.js – Winston Terminal v1: demo seed, defaults and constants (no DOM, no maths)
// v4: COMING_SOON lists the plan-v3 modules (Idea Lab, HK Macro & Peg, Morning Brief, Event Tracker).

/* ===== SECTION: STORAGE KEYS ===== */
const STORAGE_PREFIX = "winstonTerminal.v1.";
const STORAGE_KEYS = {
  mode: STORAGE_PREFIX + "mode",              // "demo" or "my"
  settings: STORAGE_PREFIX + "settings",      // thresholds + FX rate
  demoPrices: STORAGE_PREFIX + "demoPrices",  // local edits to demo prices
  myPortfolio: STORAGE_PREFIX + "myPortfolio" // { holdings, transactions }
};

/* ===== SECTION: DEMO SEED (exactly as given – made-up prices, not market data) ===== */
const DEMO_SEED = {
  "settings": { "usd_hkd_rate": 7.80, "max_weight_pct": 20, "max_drawdown_pct": 15, "watch_weight_pct": 15, "watch_drawdown_pct": 10 },
  "holdings": [
    {"symbol": "0700.HK", "name": "Tencent", "market": "HK", "currency": "HKD", "sector": "Communication Services", "last_price": 600.00},
    {"symbol": "9988.HK", "name": "Alibaba", "market": "HK", "currency": "HKD", "sector": "Consumer Discretionary", "last_price": 150.00},
    {"symbol": "0388.HK", "name": "HKEX", "market": "HK", "currency": "HKD", "sector": "Financials", "last_price": 400.00},
    {"symbol": "0005.HK", "name": "HSBC", "market": "HK", "currency": "HKD", "sector": "Financials", "last_price": 100.00},
    {"symbol": "1299.HK", "name": "AIA", "market": "HK", "currency": "HKD", "sector": "Financials", "last_price": 70.00},
    {"symbol": "0941.HK", "name": "China Mobile", "market": "HK", "currency": "HKD", "sector": "Communication Services", "last_price": 85.00},
    {"symbol": "0002.HK", "name": "CLP Holdings", "market": "HK", "currency": "HKD", "sector": "Utilities", "last_price": 65.00},
    {"symbol": "AAPL.US", "name": "Apple", "market": "US", "currency": "USD", "sector": "Information Technology", "last_price": 230.00},
    {"symbol": "MSFT.US", "name": "Microsoft", "market": "US", "currency": "USD", "sector": "Information Technology", "last_price": 500.00},
    {"symbol": "NVDA.US", "name": "NVIDIA", "market": "US", "currency": "USD", "sector": "Information Technology", "last_price": 180.00},
    {"symbol": "JPM.US", "name": "JPMorgan Chase", "market": "US", "currency": "USD", "sector": "Financials", "last_price": 300.00},
    {"symbol": "BRK-B.US", "name": "Berkshire Hathaway B", "market": "US", "currency": "USD", "sector": "Financials", "last_price": 480.00}
  ],
  "transactions": [
    {"symbol": "0700.HK", "trade_date": "2024-03-12", "type": "BUY", "quantity": 600, "price": 380.00, "currency": "HKD", "fees": 0},
    {"symbol": "0700.HK", "trade_date": "2025-01-20", "type": "BUY", "quantity": 500, "price": 468.00, "currency": "HKD", "fees": 0},
    {"symbol": "9988.HK", "trade_date": "2024-09-05", "type": "BUY", "quantity": 1700, "price": 120.00, "currency": "HKD", "fees": 0},
    {"symbol": "0388.HK", "trade_date": "2024-06-18", "type": "BUY", "quantity": 500, "price": 330.00, "currency": "HKD", "fees": 0},
    {"symbol": "0005.HK", "trade_date": "2024-02-08", "type": "BUY", "quantity": 1600, "price": 66.00, "currency": "HKD", "fees": 0},
    {"symbol": "0005.HK", "trade_date": "2025-04-10", "type": "BUY", "quantity": 800, "price": 84.00, "currency": "HKD", "fees": 0},
    {"symbol": "1299.HK", "trade_date": "2025-02-14", "type": "BUY", "quantity": 2400, "price": 86.00, "currency": "HKD", "fees": 0},
    {"symbol": "0941.HK", "trade_date": "2024-11-04", "type": "BUY", "quantity": 2000, "price": 78.00, "currency": "HKD", "fees": 0},
    {"symbol": "0002.HK", "trade_date": "2025-06-02", "type": "BUY", "quantity": 2000, "price": 73.50, "currency": "HKD", "fees": 0},
    {"symbol": "AAPL.US", "trade_date": "2025-07-15", "type": "BUY", "quantity": 110, "price": 245.00, "currency": "USD", "fees": 0},
    {"symbol": "MSFT.US", "trade_date": "2024-05-20", "type": "BUY", "quantity": 80, "price": 410.00, "currency": "USD", "fees": 0},
    {"symbol": "MSFT.US", "trade_date": "2025-08-11", "type": "SELL", "quantity": 20, "price": 480.00, "currency": "USD", "fees": 0},
    {"symbol": "NVDA.US", "trade_date": "2024-08-07", "type": "BUY", "quantity": 240, "price": 100.00, "currency": "USD", "fees": 0},
    {"symbol": "NVDA.US", "trade_date": "2025-03-03", "type": "BUY", "quantity": 100, "price": 134.00, "currency": "USD", "fees": 0},
    {"symbol": "JPM.US", "trade_date": "2024-10-15", "type": "BUY", "quantity": 65, "price": 210.00, "currency": "USD", "fees": 0},
    {"symbol": "BRK-B.US", "trade_date": "2024-04-22", "type": "BUY", "quantity": 37, "price": 455.00, "currency": "USD", "fees": 0}
  ]
};

/* ===== SECTION: DEFAULTS ===== */
const DEMO_PRICE_NOTE = "Illustrative demo price";
const DEFAULT_SETTINGS = {
  usd_hkd_rate: 7.80, rate_as_of: "", max_weight_pct: 20, max_drawdown_pct: 15,
  watch_weight_pct: 15, watch_drawdown_pct: 10
};
const FX_BAND = { min: 7.75, max: 7.85 };
const TX_TYPES = ["BUY", "SELL", "DIV", "FEE"];
const SECTORS = [
  "Communication Services", "Consumer Discretionary", "Consumer Staples", "Energy", "Financials",
  "Health Care", "Industrials", "Information Technology", "Materials", "Real Estate", "Utilities", "Unclassified"
];

/* ===== SECTION: DISPLAY CONSTANTS ===== */
const CHART_COLORS = ["#FFB000", "#2EC4B6", "#3FA7FF", "#A78BFA", "#8A94A6", "#F472B6"];
const COMING_SOON = [ // plan v3 §4.4 modules; "cmd" is the command-line mnemonic (cmd.js), "phase" the plan-v3 phase
  { id: "idea", label: "Idea Lab", phase: 6, cmd: "IDEA", line: "News and geopolitics → thesis → value chain → names → watchlist with kill criteria. GDELT theme spikes, a Grok thesis pre-generated with citations, and the shock model reused." },
  { id: "macro", label: "HK Macro & Peg", phase: 3, cmd: "MACRO", line: "Live HKMA open data: HIBOR, USD/HKD against the 7.75–7.85 band and the Aggregate Balance, credited to the HKMA." },
  { id: "brief", label: "Morning Brief", phase: 4, cmd: "BRIEF", line: "Three things that changed overnight, pre-generated by Grok with sources and HKT timestamps. Its figures must equal the dashboard's." },
  { id: "events", label: "Event Tracker", phase: 7, cmd: "EVT", line: "Earnings, FOMC and macro dates and GDELT theme spikes for my names, plus 50/200-DMA, momentum and relative-strength trend signals." }
];

/* ===== SECTION: DATE HELPER (today in Hong Kong, YYYY-MM-DD) ===== */
function hktTodayISO() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/* ===== SECTION: DEMO BUILDER (fresh deep copy of the seed, dated today HKT) ===== */
function buildDemoPortfolio(todayISO) {
  const seed = JSON.parse(JSON.stringify(DEMO_SEED));
  const today = todayISO || hktTodayISO();
  seed.holdings.forEach(function (h) { h.last_price_date = today; h.price_note = DEMO_PRICE_NOTE; });
  seed.transactions.forEach(function (t) { t.note = ""; t.source = "manual"; });
  seed.settings.rate_as_of = today;
  return seed;
}

// END OF FILE: data.js
