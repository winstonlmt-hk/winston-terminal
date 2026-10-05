// vc-data.js – Winston Terminal v2: Value Chain Explorer demo data, defaults and constants (no DOM, no maths)
// v4 (5 Oct 2026, flow-sanity rebalance "Option B", approved by Winston): SK hynix→NVDA w 0.30→0.20, TSMC→NVDA 0.20→0.16, Samsung→NVDA 0.05→0.03,
// TSMC→AMD 0.08→0.06, ASML→SMIC 0.08→0.04, ASML→TSMC 0.30→0.28; Quanta AI exposure 60→78%. Clears all W1/W2 flow warnings; capex/export tie-outs unchanged.

// ===== VALUE CHAIN DEMO DATA (ILLUSTRATIVE) =====
// Names, tickers and node mapping are real. Every number is made-up demo data, not real financials.
const VC_DATA = {
 "meta": {"theme": "AI servers & semiconductors", "label": "ILLUSTRATIVE DEMO DATA - names, tickers and node mapping are real; every number is made up for the demo, not real financials", "metrics_are_illustrative": true, "units": "rev_usd_bn = USD bn; gm_pct, rev_growth_pct, ai_exposure_pct in %; ev_ebitda, pe in x; w = share of supplier revenue from that customer (0-1)"},
 "nodes": [
  {"id": "tools", "order": 1, "name": "EDA, IP & Equipment", "role": "Design software, licensed chip blueprints and the machines that make chips"},
  {"id": "design", "order": 2, "name": "Chip Design", "role": "Designs the GPUs, custom ASICs and CPUs that do the AI maths (fabless)"},
  {"id": "foundry", "order": 3, "name": "Foundry", "role": "Manufactures the chips on silicon wafers at leading or mature nodes"},
  {"id": "memory", "order": 4, "name": "Memory (HBM)", "role": "Supplies high-bandwidth memory and server DRAM stacked next to the GPU"},
  {"id": "packaging", "order": 5, "name": "Advanced Packaging", "role": "Joins logic and memory dies into one package (CoWoS-type) and tests them"},
  {"id": "network", "order": 6, "name": "Networking & Optics", "role": "Switches and optical transceivers that link thousands of GPUs together"},
  {"id": "odm", "order": 7, "name": "Server ODM / Assembly", "role": "Builds boards, servers and full racks for the end customer"},
  {"id": "power", "order": 8, "name": "Power & Cooling", "role": "Power supplies, UPS and liquid cooling for dense AI racks, plus grid power"},
  {"id": "datacentre", "order": 9, "name": "Data Centres", "role": "Leases the buildings, power and space where AI servers run"},
  {"id": "cloud", "order": 10, "name": "Hyperscalers / Cloud", "role": "Buys the capex and sells AI compute and AI services to end users"}
 ],
 "companies": [
  {"symbol": "SNPS.US", "name": "Synopsys", "node": "tools", "country": "US", "rev_usd_bn": 7, "gm_pct": 80, "ev_ebitda": 35, "pe": 45, "rev_growth_pct": 12, "ai_exposure_pct": 40},
  {"symbol": "ARM.US", "name": "Arm Holdings", "node": "tools", "country": "UK/US", "rev_usd_bn": 4, "gm_pct": 95, "ev_ebitda": 90, "pe": 120, "rev_growth_pct": 20, "ai_exposure_pct": 35},
  {"symbol": "ASML.AS", "name": "ASML", "node": "tools", "country": "NL", "rev_usd_bn": 32, "gm_pct": 52, "ev_ebitda": 25, "pe": 32, "rev_growth_pct": 10, "ai_exposure_pct": 45},
  {"symbol": "8035.TSE", "name": "Tokyo Electron", "node": "tools", "country": "JP", "rev_usd_bn": 16, "gm_pct": 46, "ev_ebitda": 15, "pe": 22, "rev_growth_pct": 12, "ai_exposure_pct": 40},
  {"symbol": "NVDA.US", "name": "NVIDIA", "node": "design", "country": "US", "rev_usd_bn": 180, "gm_pct": 72, "ev_ebitda": 35, "pe": 45, "rev_growth_pct": 50, "ai_exposure_pct": 90},
  {"symbol": "AMD.US", "name": "AMD", "node": "design", "country": "US", "rev_usd_bn": 32, "gm_pct": 52, "ev_ebitda": 40, "pe": 45, "rev_growth_pct": 25, "ai_exposure_pct": 45},
  {"symbol": "AVGO.US", "name": "Broadcom", "node": "design", "country": "US", "rev_usd_bn": 60, "gm_pct": 66, "ev_ebitda": 30, "pe": 38, "rev_growth_pct": 20, "ai_exposure_pct": 50},
  {"symbol": "2330.TW", "name": "TSMC", "node": "foundry", "country": "TW", "rev_usd_bn": 110, "gm_pct": 58, "ev_ebitda": 12, "pe": 22, "rev_growth_pct": 30, "ai_exposure_pct": 55},
  {"symbol": "0981.HK", "name": "SMIC", "node": "foundry", "country": "CN", "rev_usd_bn": 9, "gm_pct": 20, "ev_ebitda": 12, "pe": 70, "rev_growth_pct": 15, "ai_exposure_pct": 20},
  {"symbol": "1347.HK", "name": "Hua Hong Semiconductor", "node": "foundry", "country": "CN", "rev_usd_bn": 2.3, "gm_pct": 12, "ev_ebitda": 15, "pe": 60, "rev_growth_pct": 10, "ai_exposure_pct": 10},
  {"symbol": "000660.KO", "name": "SK hynix", "node": "memory", "country": "KR", "rev_usd_bn": 60, "gm_pct": 55, "ev_ebitda": 5, "pe": 8, "rev_growth_pct": 35, "ai_exposure_pct": 60},
  {"symbol": "005930.KO", "name": "Samsung Electronics", "node": "memory", "country": "KR", "rev_usd_bn": 220, "gm_pct": 38, "ev_ebitda": 5, "pe": 14, "rev_growth_pct": 10, "ai_exposure_pct": 25},
  {"symbol": "MU.US", "name": "Micron Technology", "node": "memory", "country": "US", "rev_usd_bn": 37, "gm_pct": 40, "ev_ebitda": 9, "pe": 15, "rev_growth_pct": 40, "ai_exposure_pct": 50},
  {"symbol": "3711.TW", "name": "ASE Technology", "node": "packaging", "country": "TW", "rev_usd_bn": 20, "gm_pct": 17, "ev_ebitda": 8, "pe": 20, "rev_growth_pct": 10, "ai_exposure_pct": 25},
  {"symbol": "0522.HK", "name": "ASMPT", "node": "packaging", "country": "HK", "rev_usd_bn": 1.8, "gm_pct": 40, "ev_ebitda": 18, "pe": 40, "rev_growth_pct": 5, "ai_exposure_pct": 30},
  {"symbol": "ANET.US", "name": "Arista Networks", "node": "network", "country": "US", "rev_usd_bn": 9, "gm_pct": 64, "ev_ebitda": 40, "pe": 48, "rev_growth_pct": 25, "ai_exposure_pct": 55},
  {"symbol": "300308.SHE", "name": "Zhongji Innolight", "node": "network", "country": "CN", "rev_usd_bn": 5, "gm_pct": 38, "ev_ebitda": 25, "pe": 30, "rev_growth_pct": 60, "ai_exposure_pct": 85},
  {"symbol": "2317.TW", "name": "Hon Hai (Foxconn)", "node": "odm", "country": "TW", "rev_usd_bn": 230, "gm_pct": 6, "ev_ebitda": 9, "pe": 15, "rev_growth_pct": 15, "ai_exposure_pct": 40},
  {"symbol": "2382.TW", "name": "Quanta Computer", "node": "odm", "country": "TW", "rev_usd_bn": 55, "gm_pct": 8, "ev_ebitda": 14, "pe": 20, "rev_growth_pct": 30, "ai_exposure_pct": 78},
  {"symbol": "6669.TW", "name": "Wiwynn", "node": "odm", "country": "TW", "rev_usd_bn": 20, "gm_pct": 10, "ev_ebitda": 14, "pe": 18, "rev_growth_pct": 50, "ai_exposure_pct": 90},
  {"symbol": "SMCI.US", "name": "Super Micro Computer", "node": "odm", "country": "US", "rev_usd_bn": 22, "gm_pct": 10, "ev_ebitda": 15, "pe": 18, "rev_growth_pct": 20, "ai_exposure_pct": 85},
  {"symbol": "0992.HK", "name": "Lenovo Group", "node": "odm", "country": "HK", "rev_usd_bn": 70, "gm_pct": 16, "ev_ebitda": 6, "pe": 11, "rev_growth_pct": 15, "ai_exposure_pct": 15},
  {"symbol": "VRT.US", "name": "Vertiv", "node": "power", "country": "US", "rev_usd_bn": 10, "gm_pct": 36, "ev_ebitda": 28, "pe": 38, "rev_growth_pct": 22, "ai_exposure_pct": 55},
  {"symbol": "2308.TW", "name": "Delta Electronics", "node": "power", "country": "TW", "rev_usd_bn": 16, "gm_pct": 32, "ev_ebitda": 22, "pe": 32, "rev_growth_pct": 18, "ai_exposure_pct": 35},
  {"symbol": "EQIX.US", "name": "Equinix", "node": "datacentre", "country": "US", "rev_usd_bn": 9, "gm_pct": 50, "ev_ebitda": 25, "pe": 70, "rev_growth_pct": 7, "ai_exposure_pct": 25},
  {"symbol": "9698.HK", "name": "GDS Holdings", "node": "datacentre", "country": "CN", "rev_usd_bn": 1.5, "gm_pct": 22, "ev_ebitda": 15, "pe": 80, "rev_growth_pct": 10, "ai_exposure_pct": 40},
  {"symbol": "MSFT.US", "name": "Microsoft", "node": "cloud", "country": "US", "rev_usd_bn": 290, "gm_pct": 69, "ev_ebitda": 25, "pe": 35, "rev_growth_pct": 15, "ai_exposure_pct": 30},
  {"symbol": "AMZN.US", "name": "Amazon", "node": "cloud", "country": "US", "rev_usd_bn": 690, "gm_pct": 50, "ev_ebitda": 16, "pe": 35, "rev_growth_pct": 11, "ai_exposure_pct": 15},
  {"symbol": "GOOGL.US", "name": "Alphabet", "node": "cloud", "country": "US", "rev_usd_bn": 390, "gm_pct": 59, "ev_ebitda": 16, "pe": 24, "rev_growth_pct": 13, "ai_exposure_pct": 20},
  {"symbol": "META.US", "name": "Meta Platforms", "node": "cloud", "country": "US", "rev_usd_bn": 190, "gm_pct": 82, "ev_ebitda": 16, "pe": 26, "rev_growth_pct": 18, "ai_exposure_pct": 20},
  {"symbol": "0700.HK", "name": "Tencent", "node": "cloud", "country": "CN", "rev_usd_bn": 100, "gm_pct": 55, "ev_ebitda": 15, "pe": 20, "rev_growth_pct": 10, "ai_exposure_pct": 15},
  {"symbol": "9988.HK", "name": "Alibaba", "node": "cloud", "country": "CN", "rev_usd_bn": 140, "gm_pct": 40, "ev_ebitda": 10, "pe": 14, "rev_growth_pct": 6, "ai_exposure_pct": 15}
 ],
 "edges": [
  {"from": "SNPS.US", "to": "NVDA.US", "w": 0.06}, {"from": "ARM.US", "to": "NVDA.US", "w": 0.06}, {"from": "ASML.AS", "to": "2330.TW", "w": 0.28},
  {"from": "ASML.AS", "to": "005930.KO", "w": 0.12}, {"from": "ASML.AS", "to": "0981.HK", "w": 0.04}, {"from": "8035.TSE", "to": "2330.TW", "w": 0.18},
  {"from": "2330.TW", "to": "NVDA.US", "w": 0.16}, {"from": "2330.TW", "to": "AMD.US", "w": 0.06}, {"from": "2330.TW", "to": "AVGO.US", "w": 0.08},
  {"from": "0981.HK", "to": "9988.HK", "w": 0.03}, {"from": "1347.HK", "to": "2308.TW", "w": 0.03}, {"from": "000660.KO", "to": "NVDA.US", "w": 0.2},
  {"from": "005930.KO", "to": "NVDA.US", "w": 0.03}, {"from": "MU.US", "to": "NVDA.US", "w": 0.15}, {"from": "3711.TW", "to": "NVDA.US", "w": 0.05},
  {"from": "0522.HK", "to": "2330.TW", "w": 0.12}, {"from": "NVDA.US", "to": "2317.TW", "w": 0.25}, {"from": "NVDA.US", "to": "2382.TW", "w": 0.2},
  {"from": "NVDA.US", "to": "6669.TW", "w": 0.08}, {"from": "NVDA.US", "to": "SMCI.US", "w": 0.08}, {"from": "NVDA.US", "to": "0700.HK", "w": 0.03},
  {"from": "NVDA.US", "to": "9988.HK", "w": 0.03}, {"from": "AMD.US", "to": "2382.TW", "w": 0.1}, {"from": "AVGO.US", "to": "GOOGL.US", "w": 0.2},
  {"from": "AVGO.US", "to": "META.US", "w": 0.1}, {"from": "ANET.US", "to": "MSFT.US", "w": 0.2}, {"from": "ANET.US", "to": "META.US", "w": 0.15},
  {"from": "300308.SHE", "to": "NVDA.US", "w": 0.15}, {"from": "300308.SHE", "to": "GOOGL.US", "w": 0.1}, {"from": "2317.TW", "to": "MSFT.US", "w": 0.1},
  {"from": "2317.TW", "to": "AMZN.US", "w": 0.08}, {"from": "2382.TW", "to": "GOOGL.US", "w": 0.15}, {"from": "2382.TW", "to": "META.US", "w": 0.1},
  {"from": "2382.TW", "to": "AMZN.US", "w": 0.1}, {"from": "6669.TW", "to": "MSFT.US", "w": 0.35}, {"from": "6669.TW", "to": "AMZN.US", "w": 0.3},
  {"from": "SMCI.US", "to": "META.US", "w": 0.08}, {"from": "0992.HK", "to": "0700.HK", "w": 0.03}, {"from": "0992.HK", "to": "9988.HK", "w": 0.03},
  {"from": "VRT.US", "to": "MSFT.US", "w": 0.1}, {"from": "VRT.US", "to": "EQIX.US", "w": 0.06}, {"from": "2308.TW", "to": "2317.TW", "w": 0.05},
  {"from": "EQIX.US", "to": "AMZN.US", "w": 0.04}, {"from": "9698.HK", "to": "9988.HK", "w": 0.15}, {"from": "9698.HK", "to": "0700.HK", "w": 0.1}
 ],
 "holdingExposure": [
  {"symbol": "NVDA.US", "exposures": [{"node": "design", "pct": 100, "company": "NVDA.US"}]},
  {"symbol": "MSFT.US", "exposures": [{"node": "cloud", "pct": 40, "company": "MSFT.US"}]},
  {"symbol": "0700.HK", "exposures": [{"node": "cloud", "pct": 20, "company": "0700.HK"}]},
  {"symbol": "9988.HK", "exposures": [{"node": "cloud", "pct": 30, "company": "9988.HK"}]},
  {"symbol": "AAPL.US", "exposures": [{"node": "design", "pct": 5, "company": null}, {"node": "cloud", "pct": 5, "company": null}]},
  {"symbol": "0941.HK", "exposures": [{"node": "datacentre", "pct": 15, "company": null}]},
  {"symbol": "0002.HK", "exposures": [{"node": "power", "pct": 5, "company": null}]}
 ],
 "shocks": [
  {"id": "tsmc_price", "name": "TSMC +10% wafer price", "items": [{"target": "2330.TW", "type": "price", "pct": 10}], "pass_through": 0.5, "crit_mult": 1},
  {"id": "hbm_short", "name": "HBM shortage", "items": [{"target": "node:memory", "type": "supply", "pct": 10}, {"target": "node:memory", "type": "price", "pct": 20}], "pass_through": 0.3, "crit_mult": 3},
  {"id": "export_ctrl", "name": "US export controls tighten", "items": [{"target": "NVDA.US", "type": "volume", "pct": -8}, {"target": "AMD.US", "type": "volume", "pct": -5}, {"target": "0700.HK", "type": "volume", "pct": -10}, {"target": "9988.HK", "type": "volume", "pct": -10}, {"target": "0981.HK", "type": "volume", "pct": 5}, {"target": "1347.HK", "type": "volume", "pct": 3}], "pass_through": 0, "crit_mult": 1},
  {"id": "capex_cut", "name": "Hyperscaler capex -20%", "items": [{"target": "node:cloud", "type": "demand", "pct": -20}], "pass_through": 0, "crit_mult": 1}
 ]
};

/* ===== SECTION: VC STORAGE KEYS (same "winstonTerminal.v1." prefix as Phase 1) ===== */
const VC_STORAGE_KEYS = {
  exposureDemo: STORAGE_PREFIX + "vcExposure.demo", // holding -> node mapping, demo portfolio
  exposureMy: STORAGE_PREFIX + "vcExposure.my",     // holding -> node mapping, My Portfolio (starts unmapped)
  settings: STORAGE_PREFIX + "vcSettings"           // VC limits, hops, elasticity
};

/* ===== SECTION: VC DEFAULTS ===== */
const VC_DEFAULT_SETTINGS = { vc_node_limit_pct: 40, vc_node_watch_pct: 30, vc_max_hops: 3, vc_equity_elasticity: 1.0 };
const VC_METRICS = [
  { key: "gm_pct", label: "Gross margin %", unit: "%" }, { key: "ev_ebitda", label: "EV/EBITDA", unit: "x" },
  { key: "pe", label: "P/E", unit: "x" }, { key: "rev_growth_pct", label: "Revenue growth %", unit: "%" }
];
const VC_SHOCK_TYPES = ["volume", "demand", "price", "supply"];
const VC_SYMBOL_RE = /^[A-Z0-9-]+\.(US|HK|TW|KO|TSE|AS|SHE|SHG)$/;
const VC_DISCLAIMER = "Illustrative linear model on demo links. It only sees modelled links, so effects are a lower bound. Not a forecast.";

// END OF FILE: vc-data.js
