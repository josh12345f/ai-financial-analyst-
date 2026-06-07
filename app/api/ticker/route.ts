import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Candle = { date: string; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null };
type ProviderState = Record<string, string>;

function key(name: string) {
  return process.env[name] || "";
}
function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function validSymbol(value: string) {
  return /^[A-Z0-9.-]{1,15}$/.test(value);
}
function isoDate(daysAgo: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, next: { revalidate: 300 } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function finnhubQuote(symbol: string, sources: ProviderState) {
  if (!key("FINNHUB_API_KEY")) {
    sources.FinnhubQuote = "missing_key";
    return null;
  }

  try {
    const q = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key("FINNHUB_API_KEY")}`);
    sources.FinnhubQuote = num(q.c) ? "ok" : "unavailable";
    return {
      price: num(q.c),
      change: num(q.d),
      changePercent: num(q.dp),
      high: num(q.h),
      low: num(q.l),
      open: num(q.o),
      previousClose: num(q.pc),
      timestamp: q.t ? new Date(Number(q.t) * 1000).toISOString() : new Date().toISOString()
    };
  } catch {
    sources.FinnhubQuote = "error";
    return null;
  }
}

async function finnhubProfile(symbol: string, sources: ProviderState) {
  if (!key("FINNHUB_API_KEY")) {
    sources.FinnhubProfile = "missing_key";
    return null;
  }

  try {
    const p = await getJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key("FINNHUB_API_KEY")}`);
    sources.FinnhubProfile = p?.name ? "ok" : "unavailable";
    return {
      name: p?.name || null,
      ticker: p?.ticker || symbol,
      exchange: p?.exchange || null,
      country: p?.country || null,
      currency: p?.currency || null,
      industry: p?.finnhubIndustry || null,
      marketCap: num(p?.marketCapitalization),
      shareOutstanding: num(p?.shareOutstanding),
      logo: p?.logo || null,
      weburl: p?.weburl || null,
      ipo: p?.ipo || null
    };
  } catch {
    sources.FinnhubProfile = "error";
    return null;
  }
}

async function finnhubNews(symbol: string, sources: ProviderState) {
  if (!key("FINNHUB_API_KEY")) {
    sources.FinnhubTickerNews = "missing_key";
    return [];
  }

  try {
    const rows = await getJson(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${isoDate(21)}&to=${isoDate(0)}&token=${key("FINNHUB_API_KEY")}`);
    sources.FinnhubTickerNews = Array.isArray(rows) ? "ok" : "unavailable";
    return (Array.isArray(rows) ? rows : []).slice(0, 12).map((row) => ({
      title: row.headline || "Untitled",
      source: row.source || "Finnhub",
      url: row.url || "",
      publishedAt: row.datetime ? new Date(Number(row.datetime) * 1000).toISOString() : new Date().toISOString(),
      summary: row.summary || ""
    }));
  } catch {
    sources.FinnhubTickerNews = "error";
    return [];
  }
}

async function alphaOverview(symbol: string, sources: ProviderState) {
  if (!key("ALPHA_VANTAGE_API_KEY")) {
    sources.AlphaVantageOverview = "missing_key";
    return null;
  }

  try {
    const j = await getJson(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${key("ALPHA_VANTAGE_API_KEY")}`);
    sources.AlphaVantageOverview = j?.Symbol ? "ok" : "unavailable";
    return {
      name: j?.Name || null,
      description: j?.Description || null,
      sector: j?.Sector || null,
      industry: j?.Industry || null,
      marketCap: num(j?.MarketCapitalization),
      peRatio: num(j?.PERatio),
      pegRatio: num(j?.PEGRatio),
      dividendYield: num(j?.DividendYield),
      beta: num(j?.Beta),
      eps: num(j?.EPS),
      revenueTtm: num(j?.RevenueTTM),
      profitMargin: num(j?.ProfitMargin),
      analystTargetPrice: num(j?.AnalystTargetPrice),
      week52High: num(j?.['52WeekHigh']),
      week52Low: num(j?.['52WeekLow'])
    };
  } catch {
    sources.AlphaVantageOverview = "error";
    return null;
  }
}

async function alphaDaily(symbol: string, sources: ProviderState): Promise<Candle[]> {
  if (!key("ALPHA_VANTAGE_API_KEY")) {
    sources.AlphaVantageDaily = "missing_key";
    return [];
  }

  try {
    const j = await getJson(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${key("ALPHA_VANTAGE_API_KEY")}`);
    const series = j?.["Time Series (Daily)"] || j?.["Time Series"];
    if (!series || typeof series !== "object") {
      sources.AlphaVantageDaily = "unavailable";
      return [];
    }
    sources.AlphaVantageDaily = "ok";
    return Object.entries(series).slice(0, 90).reverse().map(([date, row]: [string, any]) => ({
      date,
      open: num(row["1. open"]),
      high: num(row["2. high"]),
      low: num(row["3. low"]),
      close: num(row["5. adjusted close"] ?? row["4. close"]),
      volume: num(row["6. volume"] ?? row["5. volume"])
    }));
  } catch {
    sources.AlphaVantageDaily = "error";
    return [];
  }
}

async function finnhubCandles(symbol: string, sources: ProviderState): Promise<Candle[]> {
  if (!key("FINNHUB_API_KEY")) return [];

  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 100 * 86400;
    const j = await getJson(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${key("FINNHUB_API_KEY")}`);
    if (j?.s !== "ok" || !Array.isArray(j.t)) {
      sources.FinnhubCandles = "unavailable";
      return [];
    }
    sources.FinnhubCandles = "ok";
    return j.t.map((t: number, index: number) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      open: num(j.o?.[index]),
      high: num(j.h?.[index]),
      low: num(j.l?.[index]),
      close: num(j.c?.[index]),
      volume: num(j.v?.[index])
    }));
  } catch {
    sources.FinnhubCandles = "error";
    return [];
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") || "AAPL").trim().toUpperCase();

  if (!validSymbol(symbol)) {
    return NextResponse.json({ error: "Invalid ticker symbol" }, { status: 400 });
  }

  const sources: ProviderState = {};
  const [quote, profile, overview, alphaCandles, news] = await Promise.all([
    finnhubQuote(symbol, sources),
    finnhubProfile(symbol, sources),
    alphaOverview(symbol, sources),
    alphaDaily(symbol, sources),
    finnhubNews(symbol, sources)
  ]);
  const candles = alphaCandles.length ? alphaCandles : await finnhubCandles(symbol, sources);
  const latestClose = candles.length ? candles[candles.length - 1].close : null;
  const firstClose = candles.length ? candles[0].close : null;
  const chartChangePercent = latestClose !== null && firstClose ? ((latestClose - firstClose) / firstClose) * 100 : null;

  return NextResponse.json({
    symbol,
    generatedAt: new Date().toISOString(),
    status: quote?.price || candles.length || overview?.name || profile?.name ? "ready" : "unavailable",
    quote,
    profile: {
      name: profile?.name || overview?.name || null,
      exchange: profile?.exchange || null,
      country: profile?.country || null,
      currency: profile?.currency || null,
      industry: profile?.industry || overview?.industry || null,
      sector: overview?.sector || null,
      marketCap: profile?.marketCap ?? overview?.marketCap ?? null,
      shareOutstanding: profile?.shareOutstanding || null,
      logo: profile?.logo || null,
      weburl: profile?.weburl || null,
      description: overview?.description || null
    },
    fundamentals: {
      peRatio: overview?.peRatio ?? null,
      pegRatio: overview?.pegRatio ?? null,
      dividendYield: overview?.dividendYield ?? null,
      beta: overview?.beta ?? null,
      eps: overview?.eps ?? null,
      revenueTtm: overview?.revenueTtm ?? null,
      profitMargin: overview?.profitMargin ?? null,
      analystTargetPrice: overview?.analystTargetPrice ?? null,
      week52High: overview?.week52High ?? null,
      week52Low: overview?.week52Low ?? null,
      chartChangePercent
    },
    candles,
    news,
    sources
  });
}
