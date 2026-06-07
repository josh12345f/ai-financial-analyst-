import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type Candle = { date: string; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null };
type ProviderState = Record<string, string>;
type NewsRow = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string; summary?: string };
type RiskFactor = { label: string; score: number | null; summary: string; sources: string[] };

function key(name: string) { return process.env[name] || ""; }
function num(value: unknown): number | null { const n = Number(value); return Number.isFinite(n) ? n : null; }
function validSymbol(value: string) { return /^[A-Z0-9.-]{1,15}$/.test(value); }
function isoDate(daysAgo: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() - daysAgo); return d.toISOString().slice(0, 10); }
async function getJson(url: string, init?: RequestInit) { const r = await fetch(url, { ...init, next: { revalidate: 300 } }); if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
function severity(text: string): Severity { const t = text.toLowerCase(); if (/war|missile|attack|invasion|default|crisis|earthquake|explosion|bankruptcy|emergency/.test(t)) return "CRITICAL"; if (/sanction|lawsuit|fraud|investigation|conflict|inflation|rate hike|oil spike|shortage|recall|probe/.test(t)) return "ALERT"; if (/earnings|policy|fed|oil|supply|regulation|filing|tariff|housing|jobs|guidance/.test(t)) return "WATCH"; return "INFO"; }
function category(text: string) { const t = text.toLowerCase(); if (/oil|gas|energy|opec|lng|crude/.test(t)) return "Energy"; if (/war|military|missile|conflict|attack/.test(t)) return "Conflict"; if (/congress|federal|regulation|law|sec |filing|rule/.test(t)) return "Government"; if (/home|housing|mortgage|real estate|reit/.test(t)) return "Real Estate"; if (/tech|ai|semiconductor|chip|software|cyber/.test(t)) return "Technology"; if (/inflation|jobs|fed|rates|gdp|treasury|yield/.test(t)) return "Economy"; if (/china|russia|iran|taiwan|israel|ukraine|nato/.test(t)) return "Geopolitics"; return "Markets"; }
function cleanCik(value: unknown) { const digits = String(value || "").replace(/\D/g, ""); return digits ? digits.padStart(10, "0") : ""; }
function uniqueRows(rows: NewsRow[]) { const seen = new Set<string>(); return rows.filter((row) => { const k = row.url || row.title; if (!k || seen.has(k)) return false; seen.add(k); return Boolean(row.title); }); }
function sourceList(rows: NewsRow[]) { return Array.from(new Set(rows.map((row) => row.source).filter(Boolean))).slice(0, 8); }

async function finnhubQuote(symbol: string, sources: ProviderState) {
  if (!key("FINNHUB_API_KEY")) { sources.FinnhubQuote = "missing_key"; return null; }
  try {
    const q = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key("FINNHUB_API_KEY")}`);
    sources.FinnhubQuote = num(q.c) ? "ok" : "unavailable";
    return { price: num(q.c), change: num(q.d), changePercent: num(q.dp), high: num(q.h), low: num(q.l), open: num(q.o), previousClose: num(q.pc), timestamp: q.t ? new Date(Number(q.t) * 1000).toISOString() : new Date().toISOString() };
  } catch { sources.FinnhubQuote = "error"; return null; }
}
async function finnhubProfile(symbol: string, sources: ProviderState) {
  if (!key("FINNHUB_API_KEY")) { sources.FinnhubProfile = "missing_key"; return null; }
  try {
    const p = await getJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key("FINNHUB_API_KEY")}`);
    sources.FinnhubProfile = p?.name ? "ok" : "unavailable";
    return { name: p?.name || null, ticker: p?.ticker || symbol, exchange: p?.exchange || null, country: p?.country || null, currency: p?.currency || null, industry: p?.finnhubIndustry || null, marketCap: num(p?.marketCapitalization), shareOutstanding: num(p?.shareOutstanding), logo: p?.logo || null, weburl: p?.weburl || null, ipo: p?.ipo || null };
  } catch { sources.FinnhubProfile = "error"; return null; }
}
async function alphaOverview(symbol: string, sources: ProviderState) {
  if (!key("ALPHA_VANTAGE_API_KEY")) { sources.AlphaVantageOverview = "missing_key"; return null; }
  try {
    const j = await getJson(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${key("ALPHA_VANTAGE_API_KEY")}`);
    sources.AlphaVantageOverview = j?.Symbol ? "ok" : "unavailable";
    return { name: j?.Name || null, description: j?.Description || null, sector: j?.Sector || null, industry: j?.Industry || null, cik: j?.CIK || null, marketCap: num(j?.MarketCapitalization), peRatio: num(j?.PERatio), pegRatio: num(j?.PEGRatio), dividendYield: num(j?.DividendYield), beta: num(j?.Beta), eps: num(j?.EPS), revenueTtm: num(j?.RevenueTTM), profitMargin: num(j?.ProfitMargin), analystTargetPrice: num(j?.AnalystTargetPrice), week52High: num(j?.['52WeekHigh']), week52Low: num(j?.['52WeekLow']) };
  } catch { sources.AlphaVantageOverview = "error"; return null; }
}
async function alphaDaily(symbol: string, sources: ProviderState): Promise<Candle[]> {
  if (!key("ALPHA_VANTAGE_API_KEY")) { sources.AlphaVantageDaily = "missing_key"; return []; }
  try {
    const j = await getJson(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${key("ALPHA_VANTAGE_API_KEY")}`);
    const series = j?.["Time Series (Daily)"] || j?.["Time Series"];
    if (!series || typeof series !== "object") { sources.AlphaVantageDaily = "unavailable"; return []; }
    sources.AlphaVantageDaily = "ok";
    return Object.entries(series).slice(0, 100).reverse().map(([date, row]: [string, any]) => ({ date, open: num(row["1. open"]), high: num(row["2. high"]), low: num(row["3. low"]), close: num(row["5. adjusted close"] ?? row["4. close"]), volume: num(row["6. volume"] ?? row["5. volume"]) }));
  } catch { sources.AlphaVantageDaily = "error"; return []; }
}
async function finnhubCandles(symbol: string, sources: ProviderState): Promise<Candle[]> {
  if (!key("FINNHUB_API_KEY")) return [];
  try {
    const to = Math.floor(Date.now() / 1000); const from = to - 140 * 86400;
    const j = await getJson(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${key("FINNHUB_API_KEY")}`);
    if (j?.s !== "ok" || !Array.isArray(j.t)) { sources.FinnhubCandles = "unavailable"; return []; }
    sources.FinnhubCandles = "ok";
    return j.t.map((t: number, index: number) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), open: num(j.o?.[index]), high: num(j.h?.[index]), low: num(j.l?.[index]), close: num(j.c?.[index]), volume: num(j.v?.[index]) }));
  } catch { sources.FinnhubCandles = "error"; return []; }
}
async function finnhubNews(symbol: string, sources: ProviderState): Promise<NewsRow[]> {
  if (!key("FINNHUB_API_KEY")) { sources.FinnhubTickerNews = "missing_key"; return []; }
  try {
    const rows = await getJson(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${isoDate(30)}&to=${isoDate(0)}&token=${key("FINNHUB_API_KEY")}`);
    sources.FinnhubTickerNews = Array.isArray(rows) ? "ok" : "unavailable";
    return (Array.isArray(rows) ? rows : []).slice(0, 24).map((row) => ({ title: row.headline || "Untitled", source: row.source || "Finnhub", url: row.url || "", category: category(`${row.headline} ${row.summary}`), severity: severity(`${row.headline} ${row.summary}`), publishedAt: row.datetime ? new Date(Number(row.datetime) * 1000).toISOString() : new Date().toISOString(), summary: row.summary || "" }));
  } catch { sources.FinnhubTickerNews = "error"; return []; }
}
async function newsApiTicker(symbol: string, name: string | null, sources: ProviderState): Promise<NewsRow[]> {
  if (!key("NEWS_API_KEY")) { sources.NewsAPITicker = "missing_key"; return []; }
  try {
    const terms = [symbol, name].filter(Boolean).map((t) => `"${t}"`).join(" OR ");
    const j = await getJson(`https://newsapi.org/v2/everything?q=${encodeURIComponent(terms)}&language=en&sortBy=publishedAt&pageSize=30&apiKey=${key("NEWS_API_KEY")}`);
    sources.NewsAPITicker = Array.isArray(j.articles) ? "ok" : "unavailable";
    return (j.articles || []).map((a: any) => ({ title: a.title, source: a.source?.name || "NewsAPI", url: a.url, category: category(`${a.title} ${a.description}`), severity: severity(`${a.title} ${a.description}`), publishedAt: a.publishedAt, summary: a.description || "" }));
  } catch { sources.NewsAPITicker = "error"; return []; }
}
async function worldNewsTicker(symbol: string, name: string | null, sources: ProviderState): Promise<NewsRow[]> {
  if (!key("WORLD_NEWS_API_KEY")) { sources.WorldNewsTicker = "missing_key"; return []; }
  try {
    const text = encodeURIComponent([symbol, name].filter(Boolean).join(" "));
    const j = await getJson(`https://api.worldnewsapi.com/search-news?text=${text}&language=en&number=20&sort=publish-time&sort-direction=DESC`, { headers: { "x-api-key": key("WORLD_NEWS_API_KEY") } });
    sources.WorldNewsTicker = Array.isArray(j.news) ? "ok" : "unavailable";
    return (j.news || []).map((a: any) => ({ title: a.title, source: a.source || a.news_site || "World News API", url: a.url, category: category(`${a.title} ${a.summary}`), severity: severity(`${a.title} ${a.summary}`), publishedAt: a.publish_date || a.published_at || new Date().toISOString(), summary: a.summary || a.text || "" }));
  } catch { sources.WorldNewsTicker = "error"; return []; }
}
async function secFilings(symbol: string, cikRaw: unknown, sources: ProviderState): Promise<NewsRow[]> {
  const cik = cleanCik(cikRaw); if (!cik) { sources.SECFilingsTicker = "unavailable"; return []; }
  const ua = key("SEC_USER_AGENT") || "WorldMarketWatcher/1.0 contact@example.com";
  try {
    const j = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { "user-agent": ua } });
    const recent = j.filings?.recent; const rows: NewsRow[] = [];
    for (let i = 0; i < Math.min(8, recent?.accessionNumber?.length || 0); i++) rows.push({ title: `${symbol} ${recent.form[i]} filing`, source: "SEC EDGAR", url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(recent.accessionNumber[i]).replace(/-/g, "")}/${recent.primaryDocument[i]}`, category: "SEC Filing", severity: ["8-K", "10-K", "10-Q", "S-1"].includes(recent.form[i]) ? "WATCH" : "INFO", publishedAt: recent.filingDate[i], summary: recent.primaryDocDescription?.[i] || "SEC filing" });
    sources.SECFilingsTicker = rows.length ? "ok" : "unavailable"; return rows;
  } catch { sources.SECFilingsTicker = "error"; return []; }
}
async function federalRegisterTicker(name: string | null, sector: string | null, industry: string | null, sources: ProviderState): Promise<NewsRow[]> {
  const term = encodeURIComponent([name, sector, industry].filter(Boolean).join(" ") || "financial markets");
  try {
    const j = await getJson(`${process.env.FEDERAL_REGISTER_BASE_URL || "https://www.federalregister.gov/api/v1"}/documents.json?conditions%5Bterm%5D=${term}&per_page=12&order=newest`);
    sources.FederalRegisterTicker = Array.isArray(j.results) ? "ok" : "unavailable";
    return (j.results || []).map((d: any) => ({ title: d.title, source: "Federal Register", url: d.html_url, category: "Government", severity: severity(d.title), publishedAt: d.publication_date, summary: d.abstract || "" }));
  } catch { sources.FederalRegisterTicker = "error"; return []; }
}
async function earningsCalendar(symbol: string, sources: ProviderState) {
  if (!key("FINNHUB_API_KEY")) return [];
  try {
    const from = isoDate(0); const to = isoDate(-95);
    const j = await getJson(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}&token=${key("FINNHUB_API_KEY")}`);
    const rows = Array.isArray(j.earningsCalendar) ? j.earningsCalendar : [];
    sources.FinnhubEarnings = rows.length ? "ok" : "unavailable";
    return rows.slice(0, 4).map((row: any) => ({ label: "Upcoming earnings", value: [row.date, row.hour, row.epsEstimate ? `EPS est ${row.epsEstimate}` : ""].filter(Boolean).join(" / "), source: "Finnhub" }));
  } catch { sources.FinnhubEarnings = "error"; return []; }
}
function buildRisks(input: { news: NewsRow[]; filings: NewsRow[]; regulations: NewsRow[]; sector: string | null; industry: string | null }): RiskFactor[] {
  const text = `${input.sector || ""} ${input.industry || ""}`.toLowerCase();
  const boost = (re: RegExp, v: number) => re.test(text) ? v : 0;
  const severe = input.news.filter((n) => n.severity === "ALERT" || n.severity === "CRITICAL").length;
  return [
    { label: "News sentiment risk", score: Math.min(95, 25 + severe * 10 + input.news.filter((n) => n.severity === "WATCH").length * 4), summary: `${input.news.length} ticker-related headlines from configured news providers.`, sources: sourceList(input.news) },
    { label: "Regulatory / SEC risk", score: Math.min(95, 24 + input.filings.length * 6 + input.regulations.length * 7 + boost(/financial|health|energy|utility|technology|real estate/, 14)), summary: `${input.filings.length} SEC rows and ${input.regulations.length} regulation rows matched this ticker context.`, sources: sourceList([...input.filings, ...input.regulations]) },
    { label: "Geopolitical / supply-chain risk", score: Math.min(95, 30 + boost(/energy|semiconductor|industrial|aerospace|defense|shipping|transport|materials/, 28)), summary: "Sector exposure score for conflict, sanctions, shipping, energy, and supply-chain events.", sources: ["GDELT", "NewsAPI", "World News API"] },
    { label: "Macro sensitivity", score: Math.min(95, 35 + boost(/financial|real estate|consumer|industrial|technology|automotive/, 24)), summary: "Sector sensitivity to rates, credit, labor, inflation, and economic releases.", sources: ["FRED", "BLS", "World Bank"] }
  ];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "AAPL").trim().toUpperCase();
  if (!validSymbol(symbol)) return NextResponse.json({ error: "Invalid ticker symbol" }, { status: 400 });

  const sources: ProviderState = {};
  const [quote, profile, overview, alphaCandles] = await Promise.all([finnhubQuote(symbol, sources), finnhubProfile(symbol, sources), alphaOverview(symbol, sources), alphaDaily(symbol, sources)]);
  const candles = alphaCandles.length ? alphaCandles : await finnhubCandles(symbol, sources);
  const name = profile?.name || overview?.name || null;
  const sector = overview?.sector || null;
  const industry = profile?.industry || overview?.industry || null;
  const [fhNews, apiNews, worldNews, filings, regulations, earnings] = await Promise.all([finnhubNews(symbol, sources), newsApiTicker(symbol, name, sources), worldNewsTicker(symbol, name, sources), secFilings(symbol, overview?.cik, sources), federalRegisterTicker(name, sector, industry, sources), earningsCalendar(symbol, sources)]);
  const news = uniqueRows([...fhNews, ...apiNews, ...worldNews]).slice(0, 40);
  const latestClose = candles.length ? candles[candles.length - 1].close : null;
  const firstClose = candles.length ? candles[0].close : null;
  const chartChangePercent = latestClose !== null && firstClose ? ((latestClose - firstClose) / firstClose) * 100 : null;
  const upcomingWatch = [
    ...earnings,
    ...(profile?.ipo ? [{ label: "IPO date", value: profile.ipo, source: "Finnhub" }] : []),
    ...filings.filter((row) => row.severity !== "INFO").slice(0, 3).map((row) => ({ label: "SEC filing to review", value: row.title, source: row.source, url: row.url })),
    ...regulations.slice(0, 3).map((row) => ({ label: "Government/regulation watch", value: row.title, source: row.source, url: row.url })),
    ...news.filter((row) => row.severity !== "INFO").slice(0, 3).map((row) => ({ label: "News risk to verify", value: row.title, source: row.source, url: row.url }))
  ].slice(0, 12);

  return NextResponse.json({
    symbol,
    generatedAt: new Date().toISOString(),
    status: quote?.price || candles.length || overview?.name || profile?.name || news.length ? "ready" : "unavailable",
    quote,
    profile: { name, exchange: profile?.exchange || null, country: profile?.country || null, currency: profile?.currency || null, industry, sector, marketCap: profile?.marketCap ?? overview?.marketCap ?? null, shareOutstanding: profile?.shareOutstanding || null, logo: profile?.logo || null, weburl: profile?.weburl || null, description: overview?.description || null, ipo: profile?.ipo || null },
    fundamentals: { peRatio: overview?.peRatio ?? null, pegRatio: overview?.pegRatio ?? null, dividendYield: overview?.dividendYield ?? null, beta: overview?.beta ?? null, eps: overview?.eps ?? null, revenueTtm: overview?.revenueTtm ?? null, profitMargin: overview?.profitMargin ?? null, analystTargetPrice: overview?.analystTargetPrice ?? null, week52High: overview?.week52High ?? null, week52Low: overview?.week52Low ?? null, chartChangePercent },
    candles,
    news,
    filings,
    regulations,
    riskFactors: buildRisks({ news, filings, regulations, sector, industry }),
    upcomingWatch,
    sources
  });
}
