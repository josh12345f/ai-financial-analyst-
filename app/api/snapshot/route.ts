import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type Instrument = {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  source: string;
  status: string;
  group: "index" | "equity" | "sector" | "commodity" | "crypto" | "rates";
  note?: string;
};
type NewsItem = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string };
type EventItem = NewsItem & { lat: number; lon: number; summary: string; impact: string };

type QuoteDef = { symbol: string; name: string; group: Instrument["group"]; note?: string };

const marketUniverse: QuoteDef[] = [
  { symbol: "SPY", name: "S&P 500 ETF", group: "index" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", group: "index" },
  { symbol: "DIA", name: "Dow Industrials ETF", group: "index" },
  { symbol: "IWM", name: "Russell 2000 ETF", group: "index" },
  { symbol: "TLT", name: "20Y Treasury ETF", group: "rates" },
  { symbol: "UUP", name: "US Dollar Index ETF", group: "rates" },
  { symbol: "AAPL", name: "Apple", group: "equity" },
  { symbol: "MSFT", name: "Microsoft", group: "equity" },
  { symbol: "NVDA", name: "NVIDIA", group: "equity" },
  { symbol: "AMZN", name: "Amazon", group: "equity" },
  { symbol: "GOOGL", name: "Alphabet", group: "equity" },
  { symbol: "META", name: "Meta", group: "equity" },
  { symbol: "TSLA", name: "Tesla", group: "equity" },
  { symbol: "JPM", name: "JPMorgan", group: "equity" },
  { symbol: "XOM", name: "Exxon Mobil", group: "equity" },
  { symbol: "CVX", name: "Chevron", group: "equity" },
  { symbol: "GLD", name: "Gold ETF", group: "commodity", note: "commodity proxy" },
  { symbol: "SLV", name: "Silver ETF", group: "commodity", note: "commodity proxy" },
  { symbol: "USO", name: "US Oil Fund", group: "commodity", note: "energy proxy" },
  { symbol: "UNG", name: "US Natural Gas Fund", group: "commodity", note: "energy proxy" },
  { symbol: "DBA", name: "Agriculture Fund", group: "commodity", note: "agriculture proxy" }
];

const sectorUniverse: QuoteDef[] = [
  { symbol: "XLK", name: "Technology", group: "sector" },
  { symbol: "XLF", name: "Financials", group: "sector" },
  { symbol: "XLE", name: "Energy", group: "sector" },
  { symbol: "XLV", name: "Health Care", group: "sector" },
  { symbol: "XLI", name: "Industrials", group: "sector" },
  { symbol: "XLY", name: "Consumer Discretionary", group: "sector" },
  { symbol: "XLP", name: "Consumer Staples", group: "sector" },
  { symbol: "XLU", name: "Utilities", group: "sector" },
  { symbol: "XLB", name: "Materials", group: "sector" },
  { symbol: "XLRE", name: "Real Estate", group: "sector" }
];

const commoditySeries = [
  { fn: "WTI", symbol: "WTI", name: "WTI Crude Oil", note: "Alpha Vantage commodity series" },
  { fn: "BRENT", symbol: "BRENT", name: "Brent Crude Oil", note: "Alpha Vantage commodity series" },
  { fn: "NATURAL_GAS", symbol: "NATGAS", name: "Natural Gas", note: "Alpha Vantage commodity series" },
  { fn: "COPPER", symbol: "COPPER", name: "Copper", note: "Alpha Vantage commodity series" },
  { fn: "WHEAT", symbol: "WHEAT", name: "Wheat", note: "Alpha Vantage commodity series" },
  { fn: "CORN", symbol: "CORN", name: "Corn", note: "Alpha Vantage commodity series" }
];

const cryptoIds = [
  ["bitcoin", "BTC", "Bitcoin"],
  ["ethereum", "ETH", "Ethereum"],
  ["solana", "SOL", "Solana"],
  ["binancecoin", "BNB", "BNB"],
  ["ripple", "XRP", "XRP"],
  ["cardano", "ADA", "Cardano"],
  ["chainlink", "LINK", "Chainlink"],
  ["avalanche-2", "AVAX", "Avalanche"]
] as const;

const ciks = [
  ["AAPL", "0000320193"],
  ["MSFT", "0000789019"],
  ["NVDA", "0001045810"],
  ["TSLA", "0001318605"],
  ["AMZN", "0001018724"]
] as const;

const coords: Record<string, [number, number]> = {
  us: [39, -98], europe: [50, 10], asia: [34, 100], middle: [29, 45], china: [35, 103],
  russia: [61, 90], ukraine: [49, 31], israel: [31, 35], iran: [32, 53], taiwan: [24, 121],
  japan: [36, 138], india: [22, 79], brazil: [-10, -55], mexico: [23, -102], global: [20, 0]
};

function key(name: string) { return process.env[name] || ""; }
function num(value: unknown): number | null {
  const n = Number(String(value ?? "").replace("%", ""));
  return Number.isFinite(n) ? n : null;
}
function inst(def: QuoteDef, price: number | null, changePercent: number | null, source: string, status = "ok"): Instrument {
  return { ...def, price, changePercent, source, status };
}
async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, next: { revalidate: 300 } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
function severity(text: string): Severity {
  const t = text.toLowerCase();
  if (/war|missile|attack|invasion|default|crisis|earthquake|explosion|bankruptcy|emergency/.test(t)) return "CRITICAL";
  if (/sanction|lawsuit|fraud|investigation|conflict|inflation|rate hike|oil spike|shortage/.test(t)) return "ALERT";
  if (/earnings|policy|fed|oil|supply|regulation|filing|tariff|housing|jobs/.test(t)) return "WATCH";
  return "INFO";
}
function category(text: string) {
  const t = text.toLowerCase();
  if (/oil|gas|energy|opec|lng|crude/.test(t)) return "Energy";
  if (/war|military|missile|conflict|attack/.test(t)) return "Conflict";
  if (/congress|federal|regulation|law|sec |filing|rule/.test(t)) return "Government";
  if (/home|housing|mortgage|real estate|reit/.test(t)) return "Real Estate";
  if (/tech|ai|semiconductor|chip|software/.test(t)) return "Technology";
  if (/inflation|jobs|fed|rates|gdp|treasury|yield/.test(t)) return "Economy";
  if (/china|russia|iran|taiwan|israel|ukraine|nato/.test(t)) return "Geopolitics";
  return "Markets";
}
function locate(text: string): [number, number] {
  const t = text.toLowerCase();
  for (const [needle, value] of Object.entries(coords)) if (t.includes(needle)) return value;
  return coords.global;
}

async function finnhubQuotes(defs: QuoteDef[], statuses: Record<string, string>) {
  if (!key("FINNHUB_API_KEY")) {
    statuses.Finnhub = "missing_key";
    return defs.map((d) => inst(d, null, null, "Finnhub", "missing_key"));
  }
  const results = await Promise.all(defs.map(async (d) => {
    try {
      const q = await getJson(`https://finnhub.io/api/v1/quote?symbol=${d.symbol}&token=${key("FINNHUB_API_KEY")}`);
      return inst(d, num(q.c), num(q.dp), "Finnhub");
    } catch {
      return inst(d, null, null, "Finnhub", "error");
    }
  }));
  statuses.Finnhub = results.some((r) => r.status === "ok") ? "ok" : "error";
  return results;
}

async function alphaCommodities(statuses: Record<string, string>) {
  const proxies = marketUniverse.filter((m) => m.group === "commodity");
  if (!key("ALPHA_VANTAGE_API_KEY")) {
    statuses.AlphaVantageCommodities = "missing_key";
    return [] as Instrument[];
  }
  const direct = await Promise.all(commoditySeries.map(async (d) => {
    try {
      const j = await getJson(`https://www.alphavantage.co/query?function=${d.fn}&interval=monthly&apikey=${key("ALPHA_VANTAGE_API_KEY")}`);
      const rows = Array.isArray(j.data) ? j.data : [];
      const latest = num(rows[0]?.value);
      const prev = num(rows[1]?.value);
      const change = latest !== null && prev ? ((latest - prev) / prev) * 100 : null;
      return inst({ symbol: d.symbol, name: d.name, group: "commodity", note: d.note }, latest, change, "Alpha Vantage");
    } catch {
      return inst({ symbol: d.symbol, name: d.name, group: "commodity", note: d.note }, null, null, "Alpha Vantage", "error");
    }
  }));
  statuses.AlphaVantageCommodities = direct.some((d) => d.status === "ok") ? "ok" : "error";
  return direct.length ? direct : proxies.map((d) => inst(d, null, null, "Unavailable", "error"));
}

async function crypto(statuses: Record<string, string>) {
  try {
    const ids = cryptoIds.map(([id]) => id).join(",");
    const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    statuses.CoinGecko = "ok";
    return cryptoIds.map(([id, symbol, name]) => inst({ symbol, name, group: "crypto" }, num(j[id]?.usd), num(j[id]?.usd_24h_change), "CoinGecko"));
  } catch {
    statuses.CoinGecko = "error";
    return cryptoIds.map(([, symbol, name]) => inst({ symbol, name, group: "crypto" }, null, null, "CoinGecko", "error"));
  }
}

async function news(statuses: Record<string, string>) {
  const out: NewsItem[] = [];
  if (key("FINNHUB_API_KEY")) {
    try {
      const n = await getJson(`https://finnhub.io/api/v1/news?category=general&token=${key("FINNHUB_API_KEY")}`);
      for (const x of (Array.isArray(n) ? n : []).slice(0, 28)) out.push({ title: x.headline, source: x.source || "Finnhub", url: x.url, category: category(x.headline), severity: severity(x.headline), publishedAt: new Date((x.datetime || 0) * 1000).toISOString() });
    } catch {}
  }
  if (key("NEWS_API_KEY")) {
    try {
      const j = await getJson(`https://newsapi.org/v2/top-headlines?language=en&category=business&pageSize=30&apiKey=${key("NEWS_API_KEY")}`);
      for (const a of j.articles || []) out.push({ title: a.title, source: a.source?.name || "NewsAPI", url: a.url, category: category(a.title), severity: severity(a.title), publishedAt: a.publishedAt });
      statuses.NewsAPI = "ok";
    } catch { statuses.NewsAPI = "error"; }
  } else statuses.NewsAPI = "missing_key";
  if (key("WORLD_NEWS_API_KEY")) {
    try {
      const j = await getJson("https://api.worldnewsapi.com/search-news?text=markets%20economy%20geopolitics%20energy%20regulation&language=en&number=24", { headers: { "x-api-key": key("WORLD_NEWS_API_KEY") } });
      for (const a of j.news || []) out.push({ title: a.title, source: a.author || "World News API", url: a.url, category: category(a.title), severity: severity(a.title), publishedAt: a.publish_date });
      statuses.WorldNews = "ok";
    } catch { statuses.WorldNews = "error"; }
  } else statuses.WorldNews = "missing_key";
  return out.filter((x, i, arr) => x.title && x.url && arr.findIndex((y) => y.title === x.title) === i).slice(0, 70);
}

async function gdelt(statuses: Record<string, string>) {
  const out: EventItem[] = [];
  try {
    const j = await getJson(`${process.env.GDELT_BASE_URL || "https://api.gdeltproject.org"}/api/v2/doc/doc?query=geopolitics%20OR%20sanctions%20OR%20conflict%20OR%20energy%20OR%20election&mode=artlist&format=json&maxrecords=36`);
    for (const a of j.articles || []) {
      const [lat, lon] = locate(`${a.title} ${a.sourceCountry}`);
      out.push({ title: a.title, source: a.sourceCountry || "GDELT", url: a.url, category: category(a.title), severity: severity(a.title), publishedAt: a.seendate || new Date().toISOString(), lat, lon, summary: a.title, impact: `Potential ${category(a.title).toLowerCase()} impact across exposed markets and watchlist assets.` });
    }
    statuses.GDELT = "ok";
  } catch { statuses.GDELT = "error"; }
  return out;
}

async function macro(statuses: Record<string, string>) {
  const out: Record<string, string> = {};
  const fred = [
    ["DGS10", "US 10Y"], ["DGS2", "US 2Y"], ["FEDFUNDS", "Fed Funds"], ["UNRATE", "Unemployment"], ["CPIAUCSL", "CPI Index"]
  ] as const;
  if (key("FRED_API_KEY")) {
    const rows = await Promise.all(fred.map(async ([series, label]) => {
      try {
        const j = await getJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${key("FRED_API_KEY")}&file_type=json&sort_order=desc&limit=1`);
        return [label, j.observations?.[0]?.value || "Unavailable"] as const;
      } catch { return [label, "Unavailable"] as const; }
    }));
    rows.forEach(([k, v]) => { out[k] = v; });
    statuses.FRED = rows.some(([, v]) => v !== "Unavailable") ? "ok" : "error";
  } else statuses.FRED = "missing_key";
  statuses.BLS = key("BLS_API_KEY") ? "configured" : "missing_key";
  try {
    const wb = await getJson(`${process.env.WORLD_BANK_BASE_URL || "https://api.worldbank.org/v2"}/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=1`);
    out["World Bank US GDP"] = wb?.[1]?.[0]?.value ? Number(wb[1][0].value).toLocaleString() : "Unavailable";
    statuses.WorldBank = "ok";
  } catch { statuses.WorldBank = "error"; }
  return out;
}

async function government(statuses: Record<string, string>) {
  const regs: NewsItem[] = [];
  const filings: NewsItem[] = [];
  try {
    const j = await getJson(`${process.env.FEDERAL_REGISTER_BASE_URL || "https://www.federalregister.gov/api/v1"}/documents.json?per_page=14&order=newest`);
    for (const d of j.results || []) regs.push({ title: d.title, source: "Federal Register", url: d.html_url, category: "Government", severity: severity(d.title), publishedAt: d.publication_date });
    statuses.FederalRegister = "ok";
  } catch { statuses.FederalRegister = "error"; }
  if (key("CONGRESS_API_KEY")) {
    try {
      const j = await getJson(`https://api.congress.gov/v3/bill?format=json&limit=14&api_key=${key("CONGRESS_API_KEY")}`);
      for (const b of j.bills || []) regs.push({ title: b.title, source: "Congress.gov", url: b.url, category: "Government", severity: severity(b.title), publishedAt: b.updateDate });
      statuses.Congress = "ok";
    } catch { statuses.Congress = "error"; }
  } else statuses.Congress = "missing_key";
  const ua = key("SEC_USER_AGENT") || "WorldMarketWatcher/1.0 contact@example.com";
  const secRows = await Promise.all(ciks.map(async ([symbol, cik]) => {
    try {
      const j = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { "user-agent": ua } });
      const recent = j.filings?.recent;
      const rows: NewsItem[] = [];
      for (let i = 0; i < Math.min(3, recent?.accessionNumber?.length || 0); i++) rows.push({ title: `${symbol} ${recent.form[i]} filing`, source: "SEC EDGAR", url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(recent.accessionNumber[i]).replace(/-/g, "")}/${recent.primaryDocument[i]}`, category: "SEC Filing", severity: "WATCH", publishedAt: recent.filingDate[i] });
      return rows;
    } catch { return []; }
  }));
  filings.push(...secRows.flat());
  statuses.SEC = filings.length ? "ok" : "error";
  return { regs, filings };
}

function breadth(instruments: Instrument[]) {
  const live = instruments.filter((m) => m.changePercent !== null);
  const advancers = live.filter((m) => (m.changePercent || 0) > 0).length;
  const decliners = live.filter((m) => (m.changePercent || 0) < 0).length;
  const unchanged = Math.max(0, live.length - advancers - decliners);
  const averageChange = live.length ? live.reduce((s, m) => s + (m.changePercent || 0), 0) / live.length : null;
  const riskTone = averageChange === null ? "Unavailable" : averageChange > 0.35 ? "Risk On" : averageChange < -0.35 ? "Risk Off" : "Mixed";
  return { advancers, decliners, unchanged, averageChange, riskTone, coverage: live.length };
}
function risk(newsRows: NewsItem[], eventRows: EventItem[], instruments: Instrument[]) {
  const all = [...newsRows, ...eventRows];
  const score = (re: RegExp) => Math.min(100, Math.round(all.filter((x) => re.test(`${x.title} ${x.category}`.toLowerCase())).length * 9));
  const marketMove = Math.min(25, Math.abs(breadth(instruments).averageChange || 0) * 8);
  return {
    "Market Risk": Math.min(100, Math.round(score(/market|earnings|stock|rate|fed|inflation/) + marketMove)),
    "Geopolitical Risk": score(/war|conflict|sanction|china|russia|iran|ukraine|israel|taiwan/),
    "Regulatory Risk": score(/law|regulation|congress|federal|sec|filing/),
    "Energy Risk": score(/oil|gas|energy|opec|lng|crude/),
    "Real Estate Risk": score(/housing|mortgage|real estate|reit|rates/)
  };
}

export async function GET() {
  const statuses: Record<string, string> = {
    OpenAI: key("OPENAI_API_KEY") ? "configured" : "missing_key",
    Reddit: key("REDDIT_CLIENT_ID") ? "configured" : "missing_key",
    Binance: key("BINANCE_API_KEY") ? "configured" : "missing_key",
    Census: key("CENSUS_API_KEY") ? "configured" : "missing_key"
  };
  const [marketQuotes, sectorQuotes, alphaCommodityRows, cryptoRows, newsRows, eventRows, macroRows, gov] = await Promise.all([
    finnhubQuotes(marketUniverse, statuses),
    finnhubQuotes(sectorUniverse, statuses),
    alphaCommodities(statuses),
    crypto(statuses),
    news(statuses),
    gdelt(statuses),
    macro(statuses),
    government(statuses)
  ]);
  const commodityRows = alphaCommodityRows.some((r) => r.price !== null) ? alphaCommodityRows : marketQuotes.filter((m) => m.group === "commodity");
  const markets = marketQuotes.filter((m) => m.group !== "commodity");
  const events = [
    ...eventRows,
    ...newsRows.slice(0, 18).map((n) => {
      const [lat, lon] = locate(n.title);
      return { ...n, lat, lon, summary: n.title, impact: `Potential ${n.category.toLowerCase()} impact across watchlist and sector exposure.` };
    })
  ];
  const risks = risk(newsRows, events, [...markets, ...sectorQuotes, ...commodityRows, ...cryptoRows]);
  const br = breadth([...markets, ...sectorQuotes]);
  const sourcesUsed = Object.entries(statuses).filter(([, v]) => v === "ok" || v === "configured").map(([k]) => k);
  const insights = {
    "Executive Brief": newsRows.length ? `Monitoring ${newsRows.length} live headlines, ${markets.length + sectorQuotes.length + commodityRows.length + cryptoRows.length} instruments, ${gov.filings.length} SEC filings, and ${events.length} mapped risk events.` : "Live headlines are unavailable. Add provider keys in Vercel or wait for APIs to respond.",
    "Market Risk Summary": `${risks["Market Risk"]}% market score. Breadth: ${br.advancers} advancers, ${br.decliners} decliners, tone ${br.riskTone}.`,
    "Geopolitical Risk Summary": `${risks["Geopolitical Risk"]}% geopolitical score from GDELT/news severity and mapped event density.`,
    "Regulatory Risk Summary": `${risks["Regulatory Risk"]}% regulatory score from Federal Register, Congress, and SEC coverage.`,
    "What Changed": newsRows[0]?.title || "No change detected because live feeds are unavailable.",
    "What To Watch Next": "Watch high-severity news, SEC filing changes, Fed/rates data, energy moves, and watchlist-linked headlines.",
    "Confidence": sourcesUsed.length ? `Moderate: ${sourcesUsed.join(", ")} configured or returning data.` : "Low: no live providers returned usable data."
  };
  return NextResponse.json({ generatedAt: new Date().toISOString(), status: statuses, markets, sectors: sectorQuotes, commodities: commodityRows, crypto: cryptoRows, news: newsRows, events, macro: macroRows, filings: gov.filings, regulations: gov.regs, breadth: br, insights, risks });
}
