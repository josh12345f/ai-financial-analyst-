import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SourceState = "ok" | "missing_key" | "unavailable" | "error";
type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type AlphaStatement = { annualReports?: Array<Record<string, string>>; quarterlyReports?: Array<Record<string, string>> };
type NewsRow = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string; summary?: string };
type FinancialYear = {
  fiscalYear: string;
  fiscalDate: string;
  revenue: number | null;
  revenueGrowth: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  ebitda: number | null;
  ebit: number | null;
  ebitMargin: number | null;
  netIncome: number | null;
  incomeBeforeTax: number | null;
  taxes: number | null;
  taxRate: number | null;
  interestExpense: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  fcfMargin: number | null;
  cash: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  workingCapital: number | null;
  shares: number | null;
};
type WaccDetail = {
  riskFreeRate: number | null;
  beta: number | null;
  equityRiskPremium: number;
  costOfEquity: number | null;
  preTaxCostOfDebt: number | null;
  afterTaxCostOfDebt: number | null;
  taxRate: number | null;
  equityValue: number | null;
  debtValue: number | null;
  equityWeight: number | null;
  debtWeight: number | null;
  wacc: number | null;
};
type Scenario = {
  name: "Base Case" | "Growth Case" | "No-Growth / Downside Case";
  probability: number;
  revenueGrowth: number | null;
  fcfMargin: number | null;
  wacc: number | null;
  terminalGrowthRate: number | null;
  exitMultiple: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  intrinsicValuePerShare: number | null;
  upsideDownsidePercent: number | null;
  terminalValuePercent: number | null;
  impliedEvEbitda: number | null;
  impliedPe: number | null;
  bullCase: string;
  bearCase: string;
  baseCase: string;
};
type ForecastRow = { scenario: string; year: number; revenue: number | null; freeCashFlow: number | null; presentValueFcf: number | null };
type SensitivityRow = { wacc: number; values: Array<{ terminalGrowthRate: number; valuePerShare: number | null }> };
type Prediction = { label: string; prediction: string; probability: number; timeHorizon: string; evidence: string[]; watchItems: string[] };

type DcfLookup = {
  symbol: string;
  companyName: string | null;
  price: number | null;
  source: string | null;
  status: "ready" | "unavailable";
  sources: Record<string, SourceState>;
  generatedAt: string;
  profile: {
    sector: string | null;
    industry: string | null;
    description: string | null;
    marketCap: number | null;
    analystTargetPrice: number | null;
    beta: number | null;
    peRatio: number | null;
    profitMargin: number | null;
    revenueTtm: number | null;
    cik: string | null;
  };
  metrics: {
    revenue: number | null;
    grossMargin: number | null;
    ebitda: number | null;
    ebit: number | null;
    taxes: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    freeCashFlow: number | null;
    fcfMargin: number | null;
    workingCapital: number | null;
    cash: number | null;
    totalDebt: number | null;
    netDebt: number | null;
    shares: number | null;
    revenueGrowthTrend: number | null;
  };
  wacc: WaccDetail;
  historical: FinancialYear[];
  scenarios: Scenario[];
  forecasts: ForecastRow[];
  sensitivity: { waccValues: number[]; terminalGrowthValues: number[]; rows: SensitivityRow[] };
  predictions: Prediction[];
  research: {
    valuationSummary: string;
    investmentMemo: string;
    businessSummary: string;
    newsSummary: string;
    filingSummary: string;
    macroSummary: string;
    catalysts: string[];
    risks: string[];
    whatToVerify: string[];
    confidence: number;
    sourcesUsed: string[];
  };
  evidence: { news: NewsRow[]; filings: NewsRow[] };
  sourceLinks: Array<{ label: string; url: string }>;
};

const EQUITY_RISK_PREMIUM = 0.055;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = sanitizeSymbol(url.searchParams.get("symbol") || "");
  const sources: Record<string, SourceState> = {};
  const generatedAt = new Date().toISOString();

  if (!symbol) {
    return NextResponse.json(unavailable(symbol, sources, "Search a valid public ticker to build the DCF."));
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY;
  const fredKey = process.env.FRED_API_KEY;

  const [quote, overview, income, cashFlow, balance, riskFree] = await Promise.all([
    configured(finnhubKey) ? finnhubQuote(symbol, finnhubKey!, sources) : Promise.resolve(null),
    configured(alphaKey) ? alphaFetch<Record<string, string>>("OVERVIEW", symbol, alphaKey!, sources, "AlphaVantageOverview") : Promise.resolve(null),
    configured(alphaKey) ? alphaFetch<AlphaStatement>("INCOME_STATEMENT", symbol, alphaKey!, sources, "AlphaVantageIncome") : Promise.resolve(null),
    configured(alphaKey) ? alphaFetch<AlphaStatement>("CASH_FLOW", symbol, alphaKey!, sources, "AlphaVantageCashFlow") : Promise.resolve(null),
    configured(alphaKey) ? alphaFetch<AlphaStatement>("BALANCE_SHEET", symbol, alphaKey!, sources, "AlphaVantageBalance") : Promise.resolve(null),
    configured(fredKey) ? fredRiskFree(fredKey!, sources) : Promise.resolve(null)
  ]);

  if (!configured(finnhubKey)) sources.FinnhubQuote = "missing_key";
  if (!configured(alphaKey)) {
    sources.AlphaVantageOverview = "missing_key";
    sources.AlphaVantageIncome = "missing_key";
    sources.AlphaVantageCashFlow = "missing_key";
    sources.AlphaVantageBalance = "missing_key";
  }
  if (!configured(fredKey)) sources.FRED10Y = "missing_key";

  const cik = normalizeCik(overview?.CIK);
  const [news, filings] = await Promise.all([
    tickerNews(symbol, text(overview?.Name) || null, sources),
    secFilings(symbol, cik, sources)
  ]);

  const historical = buildHistorical(income, cashFlow, balance);
  const latest = historical[0] ?? null;
  const price = quote?.price ?? null;
  const companyName = text(overview?.Name) || null;
  const revenue = latest?.revenue ?? number(overview?.RevenueTTM);
  const marketCap = number(overview?.MarketCapitalization) ?? (price != null && latest?.shares ? price * latest.shares : null);
  const shares = number(overview?.SharesOutstanding) ?? latest?.shares ?? (marketCap != null && price ? marketCap / price : null);
  const netDebt = latest?.netDebt ?? null;
  const revenueGrowthTrend = trendGrowth(historical);
  const fcfMargin = average(historical.slice(0, 3).map((row) => row.fcfMargin).filter(isNumber));
  const taxRate = latest?.taxRate ?? clamp(number(overview?.TaxRate) ?? 0.21, 0.05, 0.35);
  const beta = number(overview?.Beta) ?? 1;
  const debt = latest?.totalDebt ?? 0;
  const riskFreeRate = riskFree ?? 0.045;
  const preTaxCostOfDebt = costOfDebt(historical) ?? 0.055;
  const wacc = buildWacc({ riskFreeRate, beta, taxRate, marketCap, debt, preTaxCostOfDebt });
  const scenarios = buildScenarios({ revenue, revenueGrowthTrend, fcfMargin, netDebt, shares, price, wacc, latest, marketCap });
  const forecasts = scenarios.flatMap((scenario) => buildForecastRows(revenue, scenario));
  const sensitivity = buildSensitivity({ revenue, fcfMargin, netDebt, shares, wacc: wacc.wacc, price });
  const predictions = buildPredictions({ scenarios, price, analystTargetPrice: number(overview?.AnalystTargetPrice), historical, news, filings, wacc });
  const research = buildResearch({ symbol, companyName, overview, historical, scenarios, news, filings, wacc, predictions, sources });
  const modelReady = scenarios.some((scenario) => scenario.intrinsicValuePerShare != null);

  return NextResponse.json({
    symbol,
    companyName,
    price,
    source: price == null ? null : quote?.source || "Finnhub",
    status: modelReady || price != null || companyName ? "ready" : "unavailable",
    sources,
    generatedAt,
    profile: {
      sector: text(overview?.Sector) || null,
      industry: text(overview?.Industry) || null,
      description: text(overview?.Description) || null,
      marketCap,
      analystTargetPrice: number(overview?.AnalystTargetPrice),
      beta: number(overview?.Beta),
      peRatio: number(overview?.PERatio),
      profitMargin: number(overview?.ProfitMargin),
      revenueTtm: number(overview?.RevenueTTM),
      cik: cik || null
    },
    metrics: {
      revenue,
      grossMargin: latest?.grossMargin ?? null,
      ebitda: latest?.ebitda ?? null,
      ebit: latest?.ebit ?? null,
      taxes: latest?.taxes ?? null,
      operatingCashFlow: latest?.operatingCashFlow ?? null,
      capex: latest?.capex ?? null,
      freeCashFlow: latest?.freeCashFlow ?? null,
      fcfMargin,
      workingCapital: latest?.workingCapital ?? null,
      cash: latest?.cash ?? null,
      totalDebt: latest?.totalDebt ?? null,
      netDebt,
      shares,
      revenueGrowthTrend
    },
    wacc,
    historical,
    scenarios,
    forecasts,
    sensitivity,
    predictions,
    research,
    evidence: { news, filings },
    sourceLinks: [
      configured(alphaKey) ? { label: "Alpha Vantage overview", url: `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}` } : null,
      price != null ? { label: "Finnhub quote", url: `https://finnhub.io/quote/${symbol}` } : null,
      cik ? { label: "SEC EDGAR submissions", url: `https://data.sec.gov/submissions/CIK${cik}.json` } : null,
      configured(fredKey) ? { label: "FRED DGS10", url: "https://fred.stlouisfed.org/series/DGS10" } : null
    ].filter((item): item is { label: string; url: string } => Boolean(item))
  } satisfies DcfLookup, { headers: { "Cache-Control": "no-store" } });
}

async function finnhubQuote(symbol: string, token: string, sources: Record<string, SourceState>) {
  try {
    const q = await fetchJson<Record<string, number>>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`);
    const price = number(q?.c);
    sources.FinnhubQuote = price != null ? "ok" : "unavailable";
    return { price, change: number(q?.d), changePercent: number(q?.dp), source: "Finnhub" };
  } catch {
    sources.FinnhubQuote = "error";
    return null;
  }
}

async function alphaFetch<T>(fn: string, symbol: string, apiKey: string, sources: Record<string, SourceState>, sourceKey: string) {
  try {
    const payload = await fetchJson<T>(`https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`);
    sources[sourceKey] = payload ? "ok" : "unavailable";
    return payload;
  } catch {
    sources[sourceKey] = "error";
    return null;
  }
}

async function fredRiskFree(apiKey: string, sources: Record<string, SourceState>) {
  try {
    const payload = await fetchJson<{ observations?: Array<{ value?: string }> }>(`https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=1`);
    const value = number(payload?.observations?.[0]?.value);
    sources.FRED10Y = value != null ? "ok" : "unavailable";
    return value == null ? null : value / 100;
  } catch {
    sources.FRED10Y = "error";
    return null;
  }
}

async function tickerNews(symbol: string, companyName: string | null, sources: Record<string, SourceState>) {
  const out: NewsRow[] = [];
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const newsApiKey = process.env.NEWS_API_KEY;
  const worldNewsKey = process.env.WORLD_NEWS_API_KEY;

  if (configured(finnhubKey)) {
    try {
      const rows = await fetchJson<Array<Record<string, unknown>>>(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${isoDate(45)}&to=${isoDate(0)}&token=${encodeURIComponent(finnhubKey!)}`);
      for (const row of (Array.isArray(rows) ? rows : []).slice(0, 28)) {
        out.push(newsRow({ title: text(row.headline), source: text(row.source) || "Finnhub", url: text(row.url), summary: text(row.summary), publishedAt: typeof row.datetime === "number" ? new Date(row.datetime * 1000).toISOString() : new Date().toISOString() }));
      }
      sources.FinnhubTickerNews = out.some((row) => row.source === "Finnhub") ? "ok" : "unavailable";
    } catch {
      sources.FinnhubTickerNews = "error";
    }
  } else {
    sources.FinnhubTickerNews = "missing_key";
  }

  if (configured(newsApiKey)) {
    try {
      const q = encodeURIComponent([symbol, companyName].filter(Boolean).map((term) => `"${term}"`).join(" OR "));
      const payload = await fetchJson<{ articles?: Array<Record<string, unknown>> }>(`https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=25&apiKey=${encodeURIComponent(newsApiKey!)}`);
      for (const item of payload?.articles ?? []) {
        out.push(newsRow({ title: text(item.title), source: text((item.source as Record<string, unknown> | undefined)?.name) || "NewsAPI", url: text(item.url), summary: text(item.description), publishedAt: text(item.publishedAt) || new Date().toISOString() }));
      }
      sources.NewsAPITicker = (payload?.articles ?? []).length ? "ok" : "unavailable";
    } catch {
      sources.NewsAPITicker = "error";
    }
  } else {
    sources.NewsAPITicker = "missing_key";
  }

  if (configured(worldNewsKey)) {
    try {
      const q = encodeURIComponent([symbol, companyName].filter(Boolean).join(" "));
      const payload = await fetchJson<{ news?: Array<Record<string, unknown>> }>(`https://api.worldnewsapi.com/search-news?text=${q}&language=en&number=20&sort=publish-time&sort-direction=DESC`, { "x-api-key": worldNewsKey! });
      for (const item of payload?.news ?? []) {
        out.push(newsRow({ title: text(item.title), source: text(item.source) || text(item.news_site) || "World News API", url: text(item.url), summary: text(item.summary) || text(item.text), publishedAt: text(item.publish_date) || text(item.published_at) || new Date().toISOString() }));
      }
      sources.WorldNewsTicker = (payload?.news ?? []).length ? "ok" : "unavailable";
    } catch {
      sources.WorldNewsTicker = "error";
    }
  } else {
    sources.WorldNewsTicker = "missing_key";
  }

  return uniqueRows(out).sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)).slice(0, 50);
}

async function secFilings(symbol: string, cik: string, sources: Record<string, SourceState>) {
  if (!cik) {
    sources.SECFilings = "unavailable";
    return [] as NewsRow[];
  }
  try {
    const userAgent = process.env.SEC_USER_AGENT || "WorldMarketWatcher/1.0 contact@example.com";
    const payload = await fetchJson<Record<string, any>>(`https://data.sec.gov/submissions/CIK${cik}.json`, { "User-Agent": userAgent });
    const recent = payload?.filings?.recent;
    const rows: NewsRow[] = [];
    for (let index = 0; index < Math.min(12, recent?.accessionNumber?.length || 0); index += 1) {
      const form = text(recent.form?.[index]);
      const accession = text(recent.accessionNumber?.[index]);
      const primary = text(recent.primaryDocument?.[index]);
      rows.push({
        title: `${symbol} ${form} filing`,
        source: "SEC EDGAR",
        url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${primary}`,
        category: "SEC Filing",
        severity: ["8-K", "10-K", "10-Q", "S-1", "S-3"].includes(form) ? "WATCH" : "INFO",
        publishedAt: text(recent.filingDate?.[index]) || new Date().toISOString(),
        summary: text(recent.primaryDocDescription?.[index]) || primary || "SEC filing"
      });
    }
    sources.SECFilings = rows.length ? "ok" : "unavailable";
    return rows;
  } catch {
    sources.SECFilings = "error";
    return [] as NewsRow[];
  }
}

function buildHistorical(income: AlphaStatement | null, cashFlow: AlphaStatement | null, balance: AlphaStatement | null) {
  const incomeRows = income?.annualReports ?? [];
  const cashRows = new Map((cashFlow?.annualReports ?? []).map((row) => [row.fiscalDateEnding, row]));
  const balanceRows = new Map((balance?.annualReports ?? []).map((row) => [row.fiscalDateEnding, row]));
  const ascending = incomeRows.slice().sort((a, b) => Date.parse(a.fiscalDateEnding) - Date.parse(b.fiscalDateEnding));
  const rows = ascending.map((incomeRow, index) => {
    const date = incomeRow.fiscalDateEnding;
    const cashRow = cashRows.get(date) ?? {};
    const balanceRow = balanceRows.get(date) ?? {};
    const revenue = number(incomeRow.totalRevenue);
    const previousRevenue = index > 0 ? number(ascending[index - 1]?.totalRevenue) : null;
    const grossProfit = number(incomeRow.grossProfit);
    const ebit = number(incomeRow.ebit) ?? number(incomeRow.operatingIncome);
    const ebitda = number(incomeRow.ebitda) ?? (ebit != null && number(cashRow.depreciationDepletionAndAmortization) != null ? ebit + number(cashRow.depreciationDepletionAndAmortization)! : null);
    const tax = number(incomeRow.incomeTaxExpense);
    const pretax = number(incomeRow.incomeBeforeTax);
    const ocf = number(cashRow.operatingCashflow) ?? number(cashRow.operatingCashFlow);
    const capexRaw = number(cashRow.capitalExpenditures);
    const capex = capexRaw == null ? null : Math.abs(capexRaw);
    const fcf = ocf == null || capexRaw == null ? null : ocf + (capexRaw < 0 ? capexRaw : -capexRaw);
    const cash = number(balanceRow.cashAndCashEquivalentsAtCarryingValue) ?? number(balanceRow.cashAndShortTermInvestments);
    const totalDebt = number(balanceRow.shortLongTermDebtTotal) ?? sumNullable(number(balanceRow.shortTermDebt), number(balanceRow.longTermDebt));
    const currentAssets = number(balanceRow.totalCurrentAssets);
    const currentLiabilities = number(balanceRow.totalCurrentLiabilities);
    const shares = number(balanceRow.commonStockSharesOutstanding);
    return {
      fiscalYear: date ? date.slice(0, 4) : "Unavailable",
      fiscalDate: date || "",
      revenue,
      revenueGrowth: revenue != null && previousRevenue ? (revenue / previousRevenue) - 1 : null,
      grossProfit,
      grossMargin: ratio(grossProfit, revenue),
      ebitda,
      ebit,
      ebitMargin: ratio(ebit, revenue),
      netIncome: number(incomeRow.netIncome),
      incomeBeforeTax: pretax,
      taxes: tax,
      taxRate: pretax && tax != null ? clamp(tax / pretax, 0, 0.5) : null,
      interestExpense: Math.abs(number(incomeRow.interestExpense) ?? 0) || null,
      operatingCashFlow: ocf,
      capex,
      freeCashFlow: fcf,
      fcfMargin: ratio(fcf, revenue),
      cash,
      totalDebt,
      netDebt: totalDebt != null && cash != null ? totalDebt - cash : null,
      workingCapital: currentAssets != null && currentLiabilities != null ? currentAssets - currentLiabilities : null,
      shares
    } satisfies FinancialYear;
  });
  return rows.sort((a, b) => Date.parse(b.fiscalDate) - Date.parse(a.fiscalDate)).slice(0, 8);
}

function buildWacc(input: { riskFreeRate: number; beta: number; taxRate: number; marketCap: number | null; debt: number | null; preTaxCostOfDebt: number }) {
  const costOfEquity = input.riskFreeRate + input.beta * EQUITY_RISK_PREMIUM;
  const afterTaxCostOfDebt = input.preTaxCostOfDebt * (1 - input.taxRate);
  const equityValue = input.marketCap;
  const debtValue = input.debt ?? 0;
  const totalCapital = (equityValue ?? 0) + debtValue;
  const equityWeight = equityValue != null && totalCapital > 0 ? equityValue / totalCapital : null;
  const debtWeight = totalCapital > 0 ? debtValue / totalCapital : null;
  const wacc = equityWeight != null && debtWeight != null ? equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt : costOfEquity;
  return { riskFreeRate: input.riskFreeRate, beta: input.beta, equityRiskPremium: EQUITY_RISK_PREMIUM, costOfEquity, preTaxCostOfDebt: input.preTaxCostOfDebt, afterTaxCostOfDebt, taxRate: input.taxRate, equityValue, debtValue, equityWeight, debtWeight, wacc } satisfies WaccDetail;
}

function buildScenarios(input: { revenue: number | null; revenueGrowthTrend: number | null; fcfMargin: number | null; netDebt: number | null; shares: number | null; price: number | null; wacc: WaccDetail; latest: FinancialYear | null; marketCap: number | null }) {
  const baseGrowth = input.revenueGrowthTrend == null ? null : clamp(input.revenueGrowthTrend, -0.04, 0.16);
  const baseMargin = input.fcfMargin == null ? null : clamp(input.fcfMargin, -0.1, 0.4);
  const baseWacc = input.wacc.wacc == null ? null : clamp(input.wacc.wacc, 0.055, 0.16);
  const configs: Array<{ name: Scenario["name"]; probability: number; growth: number | null; margin: number | null; wacc: number | null; terminal: number; multiple: number; bull: string; bear: string; base: string }> = [
    { name: "No-Growth / Downside Case", probability: 20, growth: baseGrowth == null ? null : clamp(Math.min(0.01, baseGrowth - 0.05), -0.06, 0.03), margin: baseMargin == null ? null : Math.max(-0.05, baseMargin - 0.035), wacc: baseWacc == null ? null : baseWacc + 0.015, terminal: 0.01, multiple: 8, bull: "Downside is limited if cash generation stabilizes and filing/news risk stays routine.", bear: "Margins compress, growth stalls, and the market applies a higher discount rate.", base: "Stress case uses no-growth assumptions and lower source-derived FCF margin." },
    { name: "Base Case", probability: 55, growth: baseGrowth, margin: baseMargin, wacc: baseWacc, terminal: 0.025, multiple: 12, bull: "Base case can improve if revenue growth and FCF conversion beat the historical trend.", bear: "Base case weakens if the latest FCF margin is not sustainable.", base: "Uses source-derived historical revenue trend, FCF margin, and WACC inputs." },
    { name: "Growth Case", probability: 25, growth: baseGrowth == null ? null : clamp(baseGrowth + 0.04, 0.02, 0.22), margin: baseMargin == null ? null : Math.min(0.48, baseMargin + 0.025), wacc: baseWacc == null ? null : Math.max(0.05, baseWacc - 0.0075), terminal: 0.03, multiple: 15, bull: "Growth case requires revenue acceleration, durable margins, and no major adverse filing/news changes.", bear: "Growth case fails if valuation already discounts aggressive terminal assumptions.", base: "Upside case raises growth and FCF margin from the source-derived base." }
  ];
  return configs.map((config) => scenarioFromConfig(config, input));
}

function scenarioFromConfig(config: { name: Scenario["name"]; probability: number; growth: number | null; margin: number | null; wacc: number | null; terminal: number; multiple: number; bull: string; bear: string; base: string }, input: { revenue: number | null; netDebt: number | null; shares: number | null; price: number | null; latest: FinancialYear | null }) {
  const valuation = calculateDcf({ revenue: input.revenue, revenueGrowth: config.growth, fcfMargin: config.margin, wacc: config.wacc, terminalGrowth: config.terminal, netDebt: input.netDebt, shares: input.shares });
  const enterpriseValue = valuation?.enterpriseValue ?? null;
  const equityValue = valuation?.equityValue ?? null;
  const intrinsic = valuation?.valuePerShare ?? null;
  const terminalValuePercent = valuation?.terminalValuePercent ?? null;
  const upside = intrinsic != null && input.price ? ((intrinsic - input.price) / input.price) * 100 : null;
  const impliedEvEbitda = enterpriseValue != null && input.latest?.ebitda ? enterpriseValue / input.latest.ebitda : null;
  const impliedPe = equityValue != null && input.latest?.netIncome ? equityValue / input.latest.netIncome : null;
  return { name: config.name, probability: config.probability, revenueGrowth: config.growth, fcfMargin: config.margin, wacc: config.wacc, terminalGrowthRate: config.terminal, exitMultiple: config.multiple, enterpriseValue, equityValue, intrinsicValuePerShare: intrinsic, upsideDownsidePercent: upside, terminalValuePercent, impliedEvEbitda, impliedPe, bullCase: config.bull, bearCase: config.bear, baseCase: config.base } satisfies Scenario;
}

function calculateDcf(input: { revenue: number | null; revenueGrowth: number | null; fcfMargin: number | null; wacc: number | null; terminalGrowth: number | null; netDebt: number | null; shares: number | null }) {
  if (input.revenue == null || input.revenueGrowth == null || input.fcfMargin == null || input.wacc == null || input.terminalGrowth == null || input.netDebt == null || !input.shares || input.wacc <= input.terminalGrowth) return null;
  let revenue = input.revenue;
  let presentValue = 0;
  let finalFcf = 0;
  const forecastRows = [] as number[];
  for (let year = 1; year <= 5; year += 1) {
    revenue *= 1 + input.revenueGrowth;
    const fcf = revenue * input.fcfMargin;
    finalFcf = fcf;
    const pv = fcf / Math.pow(1 + input.wacc, year);
    presentValue += pv;
    forecastRows.push(pv);
  }
  const terminalValue = (finalFcf * (1 + input.terminalGrowth)) / (input.wacc - input.terminalGrowth);
  const presentTerminalValue = terminalValue / Math.pow(1 + input.wacc, 5);
  const enterpriseValue = presentValue + presentTerminalValue;
  const equityValue = enterpriseValue - input.netDebt;
  return { enterpriseValue, equityValue, valuePerShare: equityValue / input.shares, terminalValuePercent: enterpriseValue ? (presentTerminalValue / enterpriseValue) * 100 : null, forecastRows };
}

function buildForecastRows(revenue: number | null, scenario: Scenario) {
  if (revenue == null || scenario.revenueGrowth == null || scenario.fcfMargin == null || scenario.wacc == null) return [];
  let rollingRevenue = revenue;
  const rows: ForecastRow[] = [];
  for (let year = 1; year <= 5; year += 1) {
    rollingRevenue *= 1 + scenario.revenueGrowth;
    const freeCashFlow = rollingRevenue * scenario.fcfMargin;
    rows.push({ scenario: scenario.name, year, revenue: rollingRevenue, freeCashFlow, presentValueFcf: freeCashFlow / Math.pow(1 + scenario.wacc, year) });
  }
  return rows;
}

function buildSensitivity(input: { revenue: number | null; fcfMargin: number | null; netDebt: number | null; shares: number | null; wacc: number | null; price: number | null }) {
  const baseWacc = input.wacc ?? 0.095;
  const waccValues = [-0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.015].map((delta) => clamp(baseWacc + delta, 0.045, 0.18));
  const terminalGrowthValues = [0.015, 0.02, 0.025, 0.03, 0.035, 0.04];
  const rows = waccValues.map((wacc) => ({
    wacc,
    values: terminalGrowthValues.map((terminalGrowthRate) => ({
      terminalGrowthRate,
      valuePerShare: calculateDcf({ revenue: input.revenue, revenueGrowth: 0.04, fcfMargin: input.fcfMargin, wacc, terminalGrowth: Math.min(terminalGrowthRate, wacc - 0.005), netDebt: input.netDebt, shares: input.shares })?.valuePerShare ?? null
    }))
  }));
  return { waccValues, terminalGrowthValues, rows };
}

function buildPredictions(input: { scenarios: Scenario[]; price: number | null; analystTargetPrice: number | null; historical: FinancialYear[]; news: NewsRow[]; filings: NewsRow[]; wacc: WaccDetail }) {
  const predictions: Prediction[] = [];
  const base = input.scenarios.find((scenario) => scenario.name === "Base Case");
  const downside = input.scenarios.find((scenario) => scenario.name === "No-Growth / Downside Case");
  const growth = input.scenarios.find((scenario) => scenario.name === "Growth Case");
  const severeNews = input.news.filter((item) => item.severity === "ALERT" || item.severity === "CRITICAL");
  const materialFilings = input.filings.filter((item) => item.severity !== "INFO");

  if (base?.intrinsicValuePerShare != null && input.price) {
    predictions.push({
      label: "Valuation direction",
      prediction: base.intrinsicValuePerShare > input.price ? "Base-case DCF indicates upside versus the current provider quote." : "Base-case DCF indicates downside or limited upside versus the current provider quote.",
      probability: clampInt(Math.round(50 + Math.min(25, Math.abs(base.upsideDownsidePercent ?? 0) / 2)), 50, 75),
      timeHorizon: "6-18 months",
      evidence: [`Base intrinsic value ${roundMoney(base.intrinsicValuePerShare)}`, `Current quote ${roundMoney(input.price)}`, `Upside/downside ${roundPercent(base.upsideDownsidePercent)}`],
      watchItems: ["Re-check FCF margin after next filing", "Watch analyst target revisions", "Compare WACC against current rates"]
    });
  }
  if (input.analystTargetPrice != null && input.price) {
    predictions.push({
      label: "Street target gap",
      prediction: input.analystTargetPrice > input.price ? "Analyst target price is above the current quote." : "Analyst target price is below or near the current quote.",
      probability: clampInt(Math.round(50 + Math.min(22, Math.abs((input.analystTargetPrice - input.price) / input.price) * 70)), 50, 72),
      timeHorizon: "3-12 months",
      evidence: [`Analyst target ${roundMoney(input.analystTargetPrice)}`, `Current quote ${roundMoney(input.price)}`],
      watchItems: ["Verify target source and date", "Compare to base/growth DCF range"]
    });
  }
  if (growth?.intrinsicValuePerShare != null && downside?.intrinsicValuePerShare != null) {
    predictions.push({
      label: "Scenario skew",
      prediction: Math.abs((growth.upsideDownsidePercent ?? 0)) > Math.abs((downside.upsideDownsidePercent ?? 0)) ? "Scenario range is skewed toward upside if growth and margins hold." : "Scenario range is skewed toward downside if margins or discount rate worsen.",
      probability: 58,
      timeHorizon: "1-3 years",
      evidence: [`Growth case ${roundMoney(growth.intrinsicValuePerShare)}`, `Downside case ${roundMoney(downside.intrinsicValuePerShare)}`],
      watchItems: ["Revenue growth trend", "FCF conversion", "Terminal value as percent of total value"]
    });
  }
  if (severeNews.length || materialFilings.length) {
    predictions.push({
      label: "Disclosure/news risk",
      prediction: "Recent high-severity news or material filings increase model-risk and should be reviewed before relying on the DCF.",
      probability: clampInt(52 + severeNews.length * 5 + materialFilings.length * 4, 52, 82),
      timeHorizon: "Now to next reporting event",
      evidence: [...severeNews.slice(0, 3).map((item) => item.title), ...materialFilings.slice(0, 3).map((item) => item.title)],
      watchItems: ["8-K and 10-Q language", "Guidance changes", "Legal/regulatory headlines"]
    });
  }
  if (input.wacc.riskFreeRate != null) {
    predictions.push({
      label: "Rate sensitivity",
      prediction: (input.wacc.riskFreeRate ?? 0) > 0.045 ? "Higher risk-free rates keep valuation multiple sensitivity elevated." : "Rate input is moderate, but WACC sensitivity still drives terminal value.",
      probability: clampInt(Math.round(48 + (input.wacc.riskFreeRate ?? 0) * 500), 50, 74),
      timeHorizon: "1-6 months",
      evidence: [`Risk-free rate ${roundPercent((input.wacc.riskFreeRate ?? 0) * 100)}`, `WACC ${roundPercent((input.wacc.wacc ?? 0) * 100)}`],
      watchItems: ["10Y Treasury", "Credit spreads", "Fed communications"]
    });
  }
  return predictions;
}

function buildResearch(input: { symbol: string; companyName: string | null; overview: Record<string, string> | null; historical: FinancialYear[]; scenarios: Scenario[]; news: NewsRow[]; filings: NewsRow[]; wacc: WaccDetail; predictions: Prediction[]; sources: Record<string, SourceState> }) {
  const base = input.scenarios.find((scenario) => scenario.name === "Base Case");
  const latest = input.historical[0] ?? null;
  const severeNews = input.news.filter((item) => item.severity === "ALERT" || item.severity === "CRITICAL");
  const risks = redFlags({ historical: input.historical, scenarios: input.scenarios, filings: input.filings, news: input.news, wacc: input.wacc });
  const catalysts = [
    base?.upsideDownsidePercent != null && base.upsideDownsidePercent > 0 ? `Base-case upside of ${roundPercent(base.upsideDownsidePercent)} if source-derived assumptions hold.` : null,
    input.overview?.AnalystTargetPrice ? `Analyst target price from Alpha Vantage: ${input.overview.AnalystTargetPrice}.` : null,
    latest?.freeCashFlow != null && latest.freeCashFlow > 0 ? "Latest reported free cash flow is positive." : null,
    input.news.length ? `${input.news.length} recent ticker-related news rows available for review.` : null
  ].filter((item): item is string => Boolean(item));
  const sourcesUsed = Object.entries(input.sources).filter(([, status]) => status === "ok").map(([source]) => source);
  const confidence = clampInt(30 + sourcesUsed.length * 7 + Math.min(20, input.historical.length * 3) + (base?.intrinsicValuePerShare != null ? 15 : 0), 0, 86);
  return {
    valuationSummary: base?.intrinsicValuePerShare != null ? `${input.symbol} base-case intrinsic value is ${roundMoney(base.intrinsicValuePerShare)} versus the current quote, with ${roundPercent(base.upsideDownsidePercent)} implied upside/downside.` : "DCF valuation is unavailable until revenue, FCF margin, WACC, net debt, shares, and price are available from providers.",
    investmentMemo: `${input.companyName || input.symbol} model uses provider-backed statement history, quote data, FRED rate context, SEC filings, and ticker news where available. Treat the output as probabilistic intelligence, not financial advice. The most important manual checks are FCF quality, debt/dilution, terminal value sensitivity, and recent filings/news.` ,
    businessSummary: text(input.overview?.Description) || "Business description unavailable from Alpha Vantage for this ticker.",
    newsSummary: input.news.length ? `${input.news.length} ticker news rows loaded; ${severeNews.length} are above INFO severity.` : "No ticker-specific news rows returned by configured providers.",
    filingSummary: input.filings.length ? `${input.filings.length} recent SEC filings loaded. Review WATCH filings first.` : "No SEC filings returned. This can happen if CIK is unavailable or SEC access is not configured.",
    macroSummary: input.wacc.wacc != null ? `WACC is ${roundPercent((input.wacc.wacc ?? 0) * 100)}, using risk-free rate ${roundPercent((input.wacc.riskFreeRate ?? 0) * 100)}, beta ${input.wacc.beta?.toFixed(2) ?? "unavailable"}, ERP 5.5%, and source-derived capital structure where available.` : "WACC unavailable because market cap, beta, debt, or rate inputs were missing.",
    catalysts: catalysts.length ? catalysts : ["No automatic catalysts detected from available provider-backed rows."],
    risks,
    whatToVerify: ["Revenue, FCF, shares, and net debt against the latest 10-K/10-Q.", "Stock-based compensation, one-time items, leases, and adjusted EBITDA quality.", "Segment growth, customer concentration, geographic exposure, and supply-chain risk.", "Peer multiples and whether the terminal value is too large a share of the DCF.", "Recent SEC filings, legal/regulatory headlines, and management guidance."],
    confidence,
    sourcesUsed
  };
}

function redFlags(input: { historical: FinancialYear[]; scenarios: Scenario[]; filings: NewsRow[]; news: NewsRow[]; wacc: WaccDetail }) {
  const flags: string[] = [];
  const latest = input.historical[0];
  const base = input.scenarios.find((scenario) => scenario.name === "Base Case");
  if (!latest?.revenue) flags.push("Revenue unavailable from provider financial statements.");
  if (latest?.freeCashFlow == null) flags.push("Free cash flow unavailable from provider cash-flow statements.");
  if (latest?.freeCashFlow != null && latest.freeCashFlow < 0) flags.push("Latest reported free cash flow is negative.");
  if (latest?.netDebt == null) flags.push("Net debt could not be calculated from balance sheet debt and cash.");
  if (!latest?.shares) flags.push("Shares outstanding unavailable or not reliable enough for per-share valuation.");
  if ((base?.terminalValuePercent ?? 0) > 80) flags.push("Terminal value is more than 80% of enterprise value, making the DCF highly sensitive to WACC and terminal growth.");
  if ((input.wacc.wacc ?? 0) < (input.wacc.riskFreeRate ?? 0)) flags.push("WACC is below the risk-free rate, so capital-structure inputs should be checked.");
  if (input.filings.some((item) => item.severity !== "INFO")) flags.push("Recent WATCH-level SEC filings require manual review.");
  if (input.news.some((item) => item.severity === "ALERT" || item.severity === "CRITICAL")) flags.push("Recent ALERT/CRITICAL news may change assumptions.");
  return flags.length ? flags : ["No automatic red flags from the available source-backed valuation inputs."];
}

function costOfDebt(history: FinancialYear[]) {
  const values = history.slice(0, 3).map((row) => row.interestExpense != null && row.totalDebt ? row.interestExpense / row.totalDebt : null).filter(isNumber).filter((value) => value > 0 && value < 0.25);
  return average(values);
}

function trendGrowth(history: FinancialYear[]) {
  const latest = history[0]?.revenue;
  const old = history[Math.min(3, history.length - 1)]?.revenue;
  if (latest != null && old != null && old > 0 && history.length > 1) return Math.pow(latest / old, 1 / Math.min(3, history.length - 1)) - 1;
  return average(history.slice(0, 4).map((row) => row.revenueGrowth).filter(isNumber));
}

function unavailable(symbol: string, sources: Record<string, SourceState>, message: string): DcfLookup {
  return {
    symbol,
    companyName: null,
    price: null,
    source: null,
    status: "unavailable",
    sources,
    generatedAt: new Date().toISOString(),
    profile: { sector: null, industry: null, description: null, marketCap: null, analystTargetPrice: null, beta: null, peRatio: null, profitMargin: null, revenueTtm: null, cik: null },
    metrics: { revenue: null, grossMargin: null, ebitda: null, ebit: null, taxes: null, operatingCashFlow: null, capex: null, freeCashFlow: null, fcfMargin: null, workingCapital: null, cash: null, totalDebt: null, netDebt: null, shares: null, revenueGrowthTrend: null },
    wacc: { riskFreeRate: null, beta: null, equityRiskPremium: EQUITY_RISK_PREMIUM, costOfEquity: null, preTaxCostOfDebt: null, afterTaxCostOfDebt: null, taxRate: null, equityValue: null, debtValue: null, equityWeight: null, debtWeight: null, wacc: null },
    historical: [],
    scenarios: [],
    forecasts: [],
    sensitivity: { waccValues: [], terminalGrowthValues: [], rows: [] },
    predictions: [],
    research: { valuationSummary: message, investmentMemo: message, businessSummary: message, newsSummary: message, filingSummary: message, macroSummary: message, catalysts: [], risks: [message], whatToVerify: [], confidence: 0, sourcesUsed: [] },
    evidence: { news: [], filings: [] },
    sourceLinks: []
  };
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T | null> {
  const response = await fetch(url, { headers: { Accept: "application/json", ...(headers ?? {}) }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function newsRow(input: { title: string; source: string; url: string; summary?: string; publishedAt: string }) {
  const textValue = `${input.title} ${input.summary ?? ""}`;
  return { title: input.title || "Untitled", source: input.source || "News", url: input.url || "", category: category(textValue), severity: severity(textValue), publishedAt: input.publishedAt || new Date().toISOString(), summary: input.summary || "" } satisfies NewsRow;
}

function severity(value: string): Severity { const t = value.toLowerCase(); if (/war|missile|attack|invasion|default|crisis|earthquake|explosion|bankruptcy|emergency/.test(t)) return "CRITICAL"; if (/sanction|lawsuit|fraud|investigation|conflict|inflation|rate hike|oil spike|shortage|recall|probe/.test(t)) return "ALERT"; if (/earnings|policy|fed|oil|supply|regulation|filing|tariff|housing|jobs|guidance/.test(t)) return "WATCH"; return "INFO"; }
function category(value: string) { const t = value.toLowerCase(); if (/oil|gas|energy|opec|lng|crude/.test(t)) return "Energy"; if (/war|military|missile|conflict|attack/.test(t)) return "Conflict"; if (/congress|federal|regulation|law|sec |filing|rule/.test(t)) return "Government"; if (/home|housing|mortgage|real estate|reit/.test(t)) return "Real Estate"; if (/tech|ai|semiconductor|chip|software|cyber/.test(t)) return "Technology"; if (/inflation|jobs|fed|rates|gdp|treasury|yield/.test(t)) return "Economy"; if (/china|russia|iran|taiwan|israel|ukraine|nato/.test(t)) return "Geopolitics"; return "Markets"; }
function uniqueRows<T extends { title: string; url: string }>(rows: T[]) { const seen = new Set<string>(); return rows.filter((row) => { const key = row.url || row.title; if (!key || seen.has(key)) return false; seen.add(key); return Boolean(row.title); }); }
function sanitizeSymbol(value: string) { const symbol = value.trim().toUpperCase(); return /^[A-Z0-9.-]{1,15}$/.test(symbol) ? symbol : ""; }
function configured(value: string | undefined) { return Boolean(value && !value.startsWith("<") && !value.toLowerCase().includes("your ")); }
function number(value: unknown) { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : null; }
function text(value: unknown) { return typeof value === "string" ? value : value == null ? "" : String(value); }
function ratio(numerator: number | null, denominator: number | null) { return numerator != null && denominator ? numerator / denominator : null; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function isNumber(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function clampInt(value: number, min: number, max: number) { return Math.round(clamp(value, min, max)); }
function sumNullable(a: number | null, b: number | null) { return a == null && b == null ? null : (a ?? 0) + (b ?? 0); }
function normalizeCik(value: unknown) { const digits = text(value).replace(/\D/g, ""); return digits ? digits.padStart(10, "0") : ""; }
function isoDate(daysAgo: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() - daysAgo); return date.toISOString().slice(0, 10); }
function roundMoney(value: number | null | undefined) { return value == null || Number.isNaN(value) ? "unavailable" : `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function roundPercent(value: number | null | undefined) { return value == null || Number.isNaN(value) ? "unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }
