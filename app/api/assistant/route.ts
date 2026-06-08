import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
type EventItem = NewsItem & { lat: number; lon: number; summary: string; impact: string; layer?: string; confidence?: number };
type LayerStat = { layer: string; count: number; severe: number; sources: string[] };
type Snapshot = {
  generatedAt?: string;
  status?: Record<string, string>;
  markets?: Instrument[];
  sectors?: Instrument[];
  commodities?: Instrument[];
  crypto?: Instrument[];
  news?: NewsItem[];
  events?: EventItem[];
  layers?: LayerStat[];
  macro?: Record<string, string>;
  filings?: NewsItem[];
  regulations?: NewsItem[];
  insights?: Record<string, string>;
  risks?: Record<string, number>;
  breadth?: {
    advancers?: number;
    decliners?: number;
    unchanged?: number;
    averageChange?: number | null;
    riskTone?: string;
    coverage?: number;
  };
};
type EvidenceKind = "market" | "news" | "event" | "risk" | "filing" | "regulation" | "macro" | "layer" | "insight" | "provider" | "breadth";
type Evidence = {
  kind: EvidenceKind;
  title: string;
  detail: string;
  source: string;
  url?: string;
  category?: string;
  severity?: Severity;
  publishedAt?: string;
  location?: string;
  score: number;
  direct: boolean;
};
type QuestionProfile = {
  original: string;
  lower: string;
  tokens: string[];
  tickers: string[];
  locations: string[];
  topics: Record<string, boolean>;
};

type AssistantRequest = { question?: string; snapshot?: Snapshot };

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "what", "why", "how", "does", "this", "that", "from", "about", "today", "please", "tell", "show", "mean", "means", "affect", "effect", "into", "are", "is", "it", "to", "of", "in", "on", "a", "an", "my", "me", "you", "your", "risk", "news", "market", "markets"
]);
const TICKER_STOP_WORDS = new Set(["A", "I", "AI", "US", "USA", "SEC", "GDP", "CPI", "FED", "ETF", "API", "DCF", "CEO", "OIL", "GAS"]);
const LOCATION_ALIASES = [
  { name: "United States", aliases: ["united states", "u.s.", "usa", "america", "us market", "washington"] },
  { name: "China", aliases: ["china", "beijing", "shanghai"] },
  { name: "Russia", aliases: ["russia", "moscow"] },
  { name: "Ukraine", aliases: ["ukraine", "kyiv", "kiev"] },
  { name: "Israel", aliases: ["israel"] },
  { name: "Iran", aliases: ["iran", "tehran"] },
  { name: "Taiwan", aliases: ["taiwan", "taipei"] },
  { name: "Japan", aliases: ["japan", "tokyo"] },
  { name: "South Korea", aliases: ["south korea", "korea", "seoul"] },
  { name: "India", aliases: ["india", "mumbai", "delhi"] },
  { name: "Pakistan", aliases: ["pakistan"] },
  { name: "Germany", aliases: ["germany", "frankfurt", "berlin"] },
  { name: "France", aliases: ["france", "paris"] },
  { name: "United Kingdom", aliases: ["united kingdom", "uk", "britain", "london"] },
  { name: "Canada", aliases: ["canada", "ottawa", "toronto"] },
  { name: "Mexico", aliases: ["mexico"] },
  { name: "Brazil", aliases: ["brazil", "sao paulo"] },
  { name: "Chile", aliases: ["chile"] },
  { name: "Saudi Arabia", aliases: ["saudi", "saudi arabia", "riyadh"] },
  { name: "Yemen", aliases: ["yemen", "houthi"] },
  { name: "Iraq", aliases: ["iraq"] },
  { name: "Syria", aliases: ["syria"] },
  { name: "Turkey", aliases: ["turkey", "turkiye"] },
  { name: "Egypt", aliases: ["egypt", "suez"] },
  { name: "Singapore", aliases: ["singapore"] },
  { name: "Panama", aliases: ["panama"] },
  { name: "Middle East", aliases: ["middle east", "red sea", "hormuz", "gulf"] },
  { name: "Europe", aliases: ["europe", "eurozone", "eu"] },
  { name: "Asia", aliases: ["asia", "asia pacific", "apac"] },
  { name: "Latin America", aliases: ["latin america", "latam"] }
];

function env(name: string) {
  return process.env[name] || "";
}
function configured(value: string) {
  return Boolean(value && !value.startsWith("<") && !value.toLowerCase().includes("your "));
}
function arr<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function pct(value: number | null | undefined) {
  return value == null || Number.isNaN(value) ? "unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "unavailable";
  return value > 1000 ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${value.toFixed(2)}`;
}
function severityRank(severity?: Severity) {
  return severity === "CRITICAL" ? 4 : severity === "ALERT" ? 3 : severity === "WATCH" ? 2 : severity === "INFO" ? 1 : 0;
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function textIncludesAlias(text: string, alias: string) {
  const clean = alias.toLowerCase();
  if (/^[a-z0-9 ]+$/.test(clean)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(clean)}([^a-z0-9]|$)`).test(text);
  }
  return text.includes(clean);
}
function unique(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}
function recentBoost(iso?: string) {
  const time = Date.parse(String(iso || ""));
  if (!Number.isFinite(time)) return 0;
  const hours = Math.max(0, (Date.now() - time) / 36e5);
  if (hours <= 1) return 12;
  if (hours <= 24) return 8;
  if (hours <= 168) return 4;
  return 0;
}
function tokenize(question: string) {
  return unique(
    question
      .toLowerCase()
      .replace(/[^a-z0-9. -]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  ).slice(0, 18);
}
function detectTickers(question: string) {
  return unique(question.toUpperCase().match(/\b[A-Z]{1,6}(?:\.[A-Z])?\b/g) || []).filter((token) => !TICKER_STOP_WORDS.has(token)).slice(0, 8);
}
function detectLocations(text: string) {
  const lower = text.toLowerCase();
  return LOCATION_ALIASES.filter((entry) => entry.aliases.some((alias) => textIncludesAlias(lower, alias))).map((entry) => entry.name);
}
function inferLocationFromCoordinates(lat?: number, lon?: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  const y = Number(lat);
  const x = Number(lon);
  if (y > 24 && y < 50 && x > -125 && x < -66) return "United States";
  if (y > 42 && y < 72 && x > -141 && x < -52) return "Canada";
  if (y > 14 && y < 33 && x > -118 && x < -86) return "Mexico";
  if (y > -34 && y < 6 && x > -74 && x < -34) return "Brazil";
  if (y > 35 && y < 61 && x > -11 && x < 32) return "Europe";
  if (y > 49 && y < 61 && x > -8 && x < 2) return "United Kingdom";
  if (y > 47 && y < 56 && x > 5 && x < 16) return "Germany";
  if (y > 41 && y < 52 && x > -5 && x < 9) return "France";
  if (y > 41 && y < 52 && x > 22 && x < 41) return "Ukraine";
  if (y > 41 && y < 82 && x > 30 && x < 180) return "Russia";
  if (y > 24 && y < 40 && x > 44 && x < 64) return "Iran";
  if (y > 29 && y < 34 && x > 34 && x < 36) return "Israel";
  if (y > 16 && y < 33 && x > 34 && x < 60) return "Middle East";
  if (y > 18 && y < 54 && x > 73 && x < 135) return "China";
  if (y > 21 && y < 26 && x > 119 && x < 123) return "Taiwan";
  if (y > 30 && y < 46 && x > 129 && x < 146) return "Japan";
  if (y > 33 && y < 39 && x > 124 && x < 131) return "South Korea";
  if (y > 6 && y < 36 && x > 68 && x < 89) return "India";
  if (y > 24 && y < 38 && x > 60 && x < 78) return "Pakistan";
  if (y > -45 && y < -10 && x > 112 && x < 154) return "Australia";
  return "";
}
function profileQuestion(question: string): QuestionProfile {
  const lower = question.toLowerCase();
  return {
    original: question,
    lower,
    tokens: tokenize(question),
    tickers: detectTickers(question),
    locations: detectLocations(question),
    topics: {
      market: /market|stock|stocks|equity|equities|index|indices|ticker|price|chart|move|moving|watchlist|trading|rates|yield|bond|dollar/.test(lower),
      news: /news|headline|story|source|today|latest|changed|moving/.test(lower),
      country: /country|countries|geopolitical|geopolitics|war|conflict|sanction|military|election|government|global/.test(lower),
      risk: /risk|threat|alert|critical|watch|exposure|impact|danger|stress/.test(lower),
      regulation: /law|laws|bill|congress|regulation|regulatory|federal register|policy|government/.test(lower),
      filing: /sec|filing|10-k|10-q|8-k|s-1|edgar/.test(lower),
      commodity: /commodity|commodities|oil|gas|gold|silver|copper|wheat|corn|energy|metals/.test(lower),
      crypto: /crypto|bitcoin|btc|ethereum|eth|solana|coin/.test(lower),
      realEstate: /real estate|housing|mortgage|reit|property|commercial property/.test(lower),
      economy: /economy|economic|macro|inflation|cpi|jobs|labor|gdp|fed|treasury|rates|world bank|imf/.test(lower),
      provider: /api|data|source|provider|key|missing|working|unavailable/.test(lower)
    }
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as AssistantRequest;
  const question = String(body.question || "").trim();

  if (question.length < 3) {
    return NextResponse.json(
      {
        answer: "Ask a specific question about markets, news, a country, risk, filings, laws, commodities, crypto, real estate, or what the latest data means.",
        confidence: 0,
        sources: [],
        status: "unavailable"
      },
      { status: 400 }
    );
  }

  const snapshot = await loadSnapshot(request, body.snapshot);
  const profile = profileQuestion(question);
  const analysis = buildAnalysis(snapshot, profile);

  if (!analysis.hasAnyData) {
    return NextResponse.json({
      answer: "Live source-backed data is unavailable right now. I cannot provide market, country, news, or risk analysis until at least one provider returns usable rows. Check the provider status panel and Vercel environment variables, then ask again.",
      confidence: 0,
      sources: [],
      status: "unavailable"
    });
  }

  if (configured(env("OPENAI_API_KEY"))) {
    const modelAnswer = await askOpenAI(question, analysis.context);
    if (modelAnswer) {
      return NextResponse.json({
        answer: modelAnswer,
        confidence: analysis.confidence,
        sources: analysis.sources,
        evidenceCount: analysis.evidence.length,
        status: "ready"
      });
    }
  }

  return NextResponse.json({
    answer: localMemo(snapshot, profile, analysis),
    confidence: analysis.confidence,
    sources: analysis.sources,
    evidenceCount: analysis.evidence.length,
    status: "ready"
  });
}

async function loadSnapshot(request: Request, fallback?: Snapshot) {
  try {
    const origin = new URL(request.url).origin;
    const response = await fetch(`${origin}/api/snapshot`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(25_000)
    });
    if (response.ok) return (await response.json()) as Snapshot;
  } catch {
  }
  return fallback || {};
}

async function askOpenAI(question: string, context: string) {
  try {
    const baseUrl = (env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env("OPENAI_API_KEY")}`
      },
      body: JSON.stringify({
        model: env("OPENAI_SUMMARY_MODEL") || env("OPENAI_MODEL") || "gpt-4o-mini",
        temperature: 0.15,
        max_tokens: 1100,
        messages: [
          {
            role: "system",
            content:
              "You are an institutional market intelligence analyst inside WORLD MARKET WATCHER. Answer questions about markets, countries, news, risk, laws, filings, commodities, crypto, real estate, and what events mean. Use only the supplied live app evidence. If evidence is missing, state what is unavailable. Do not invent news, prices, events, or sources. Do not give personalized financial advice or trade instructions; frame output as probabilistic intelligence. Always include concise sections: Bottom line, Evidence, Market/risk meaning, What to watch, Sources used."
          },
          {
            role: "user",
            content: `Question: ${question}\n\nLive app evidence:\n${context}`
          }
        ]
      }),
      signal: AbortSignal.timeout(25_000)
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = json.choices?.[0]?.message?.content?.trim();
    return answer || null;
  } catch {
    return null;
  }
}

function buildAnalysis(snapshot: Snapshot, profile: QuestionProfile) {
  const allEvidence = collectEvidence(snapshot, profile);
  const ranked = allEvidence
    .map((item) => ({ ...item, score: scoreEvidence(item, profile) }))
    .sort((a, b) => b.score - a.score || severityRank(b.severity) - severityRank(a.severity));
  const directEvidence = ranked.filter((item) => item.score > 0 || item.direct);
  const evidence = (directEvidence.length ? directEvidence : ranked).slice(0, 28);
  const sources = unique(evidence.map((item) => item.source)).slice(0, 18);
  const okSources = Object.values(snapshot.status || {}).filter((value) => value === "ok" || value === "configured").length;
  const confidence = clamp(42 + Math.min(24, okSources * 2) + Math.min(20, evidence.filter((item) => item.score > 12 || item.direct).length * 3) + Math.min(8, sources.length), 35, 88);
  const context = buildContext(snapshot, profile, evidence, sources).slice(0, 26000);
  return {
    evidence,
    sources,
    context,
    confidence,
    hasAnyData: Boolean(
      arr(snapshot.news).length ||
      arr(snapshot.events).length ||
      arr(snapshot.markets).length ||
      arr(snapshot.sectors).length ||
      arr(snapshot.commodities).length ||
      arr(snapshot.crypto).length ||
      arr(snapshot.filings).length ||
      arr(snapshot.regulations).length ||
      Object.keys(snapshot.risks || {}).length ||
      Object.keys(snapshot.macro || {}).length
    )
  };
}

function collectEvidence(snapshot: Snapshot, profile: QuestionProfile): Evidence[] {
  const evidence: Evidence[] = [];
  const add = (item: Omit<Evidence, "score" | "direct">) => {
    const direct = isDirect(item, profile);
    evidence.push({ ...item, score: 0, direct });
  };

  for (const [name, value] of Object.entries(snapshot.risks || {})) {
    add({ kind: "risk", title: name, detail: `Current risk score ${value}/100`, source: "Risk engine", category: "Risk" });
  }

  const breadth = snapshot.breadth;
  if (breadth) {
    add({
      kind: "breadth",
      title: "Market breadth",
      detail: `${breadth.riskTone || "Unavailable"}: ${breadth.advancers ?? 0} advancers, ${breadth.decliners ?? 0} decliners, average change ${pct(breadth.averageChange ?? null)}, coverage ${breadth.coverage ?? 0}`,
      source: "Market breadth engine",
      category: "Markets"
    });
  }

  for (const row of [...arr(snapshot.markets), ...arr(snapshot.sectors), ...arr(snapshot.commodities), ...arr(snapshot.crypto)]) {
    add({
      kind: "market",
      title: `${row.symbol} - ${row.name}`,
      detail: `${row.group} price ${money(row.price)}; change ${pct(row.changePercent)}; status ${row.status}${row.note ? `; ${row.note}` : ""}`,
      source: row.source || "Market provider",
      category: row.group.toUpperCase()
    });
  }

  for (const row of arr(snapshot.news)) {
    add({ kind: "news", title: row.title, detail: `${row.category} headline published ${row.publishedAt || "unknown time"}`, source: row.source, url: row.url, category: row.category, severity: row.severity, publishedAt: row.publishedAt });
  }

  for (const row of arr(snapshot.events)) {
    const textLocation = detectLocations(`${row.title} ${row.summary} ${row.impact}`).join(", ");
    const location = textLocation || inferLocationFromCoordinates(row.lat, row.lon) || "Global/unknown";
    add({
      kind: "event",
      title: row.title,
      detail: `${row.category}; layer ${row.layer || "hotspot"}; location ${location}; summary: ${row.summary}; impact: ${row.impact}`,
      source: row.source,
      url: row.url,
      category: row.category,
      severity: row.severity,
      publishedAt: row.publishedAt,
      location
    });
  }

  for (const row of arr(snapshot.filings)) {
    add({ kind: "filing", title: row.title, detail: `${row.category} filed/published ${row.publishedAt || "unknown time"}`, source: row.source, url: row.url, category: row.category, severity: row.severity, publishedAt: row.publishedAt });
  }

  for (const row of arr(snapshot.regulations)) {
    add({ kind: "regulation", title: row.title, detail: `${row.category} published ${row.publishedAt || "unknown time"}`, source: row.source, url: row.url, category: row.category, severity: row.severity, publishedAt: row.publishedAt });
  }

  for (const [name, value] of Object.entries(snapshot.macro || {})) {
    add({ kind: "macro", title: name, detail: String(value || "Unavailable"), source: "Macro data", category: "Economy" });
  }

  for (const row of arr(snapshot.layers)) {
    add({ kind: "layer", title: `Map layer: ${row.layer}`, detail: `${row.count} events, ${row.severe} severe; sources ${row.sources?.join(", ") || "unavailable"}`, source: "Map layer engine", category: row.layer });
  }

  for (const [name, value] of Object.entries(snapshot.insights || {})) {
    add({ kind: "insight", title: name, detail: value, source: "Snapshot insight engine", category: "AI insight" });
  }

  if (profile.topics.provider) {
    for (const [name, value] of Object.entries(snapshot.status || {})) {
      add({ kind: "provider", title: name, detail: `Provider status ${value}`, source: "Provider status", category: "System" });
    }
  }

  return evidence;
}

function isDirect(item: Omit<Evidence, "score" | "direct">, profile: QuestionProfile) {
  const text = `${item.title} ${item.detail} ${item.source} ${item.category || ""} ${item.location || ""}`.toLowerCase();
  if (profile.tickers.some((ticker) => text.includes(ticker.toLowerCase()))) return true;
  if (profile.locations.some((location) => text.includes(location.toLowerCase()))) return true;
  return profile.tokens.some((token) => text.includes(token));
}

function scoreEvidence(item: Evidence, profile: QuestionProfile) {
  const text = `${item.title} ${item.detail} ${item.source} ${item.category || ""} ${item.location || ""}`.toLowerCase();
  let score = item.direct ? 12 : 0;

  for (const token of profile.tokens) {
    if (text.includes(token)) score += token.length > 4 ? 8 : 4;
  }
  for (const ticker of profile.tickers) {
    const lower = ticker.toLowerCase();
    if (text.includes(lower)) score += item.kind === "market" ? 44 : 28;
  }
  for (const location of profile.locations) {
    if (text.includes(location.toLowerCase())) score += item.kind === "event" ? 40 : 22;
  }

  if (profile.topics.market && ["market", "breadth", "risk", "news", "event", "macro"].includes(item.kind)) score += 7;
  if (profile.topics.news && ["news", "event", "regulation", "filing"].includes(item.kind)) score += 8;
  if (profile.topics.country && item.kind === "event") score += 12;
  if (profile.topics.risk && ["risk", "event", "news", "layer", "breadth"].includes(item.kind)) score += 10;
  if (profile.topics.regulation && ["regulation", "filing", "news", "risk"].includes(item.kind)) score += 12;
  if (profile.topics.filing && item.kind === "filing") score += 18;
  if (profile.topics.commodity && /commodity|oil|gas|gold|silver|copper|wheat|corn|energy|metals|opec|lng/.test(text)) score += 15;
  if (profile.topics.crypto && /crypto|bitcoin|btc|ethereum|eth|solana|coin|bnb|xrp|cardano/.test(text)) score += 15;
  if (profile.topics.realEstate && /real estate|housing|mortgage|reit|property|rates/.test(text)) score += 15;
  if (profile.topics.economy && /economy|macro|inflation|cpi|jobs|gdp|fed|treasury|rates|world bank|imf/.test(text)) score += 14;
  if (profile.topics.provider && item.kind === "provider") score += 16;

  score += severityRank(item.severity) * 4;
  score += recentBoost(item.publishedAt);

  if (!profile.tokens.length && !profile.tickers.length && !profile.locations.length) {
    score += ["risk", "breadth", "news", "event"].includes(item.kind) ? 10 : 0;
  }

  return score;
}

function buildContext(snapshot: Snapshot, profile: QuestionProfile, evidence: Evidence[], sources: string[]) {
  const risks = Object.entries(snapshot.risks || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  const missing = Object.entries(snapshot.status || {}).filter(([, value]) => value !== "ok" && value !== "configured").slice(0, 10);
  return [
    `Snapshot generated: ${snapshot.generatedAt || "unavailable"}`,
    `Question: ${profile.original}`,
    `Detected tickers: ${profile.tickers.join(", ") || "none"}`,
    `Detected locations: ${profile.locations.join(", ") || "none"}`,
    `Detected topics: ${Object.entries(profile.topics).filter(([, value]) => value).map(([key]) => key).join(", ") || "general"}`,
    `Live sources used: ${sources.join(", ") || "unavailable"}`,
    `Provider gaps: ${missing.map(([name, value]) => `${name}=${value}`).join(", ") || "none reported"}`,
    `Breadth: ${snapshot.breadth?.riskTone || "Unavailable"}; ${snapshot.breadth?.advancers ?? 0} advancers, ${snapshot.breadth?.decliners ?? 0} decliners, average ${pct(snapshot.breadth?.averageChange ?? null)}`,
    `Risk stack: ${risks.map(([name, value]) => `${name} ${value}/100`).join("; ") || "unavailable"}`,
    "Relevant source-backed evidence:",
    ...evidence.map((item, index) => `${index + 1}. [${item.kind.toUpperCase()}${item.severity ? `/${item.severity}` : ""}] ${item.title}\n   Detail: ${item.detail}\n   Source: ${item.source}${item.url ? ` | URL: ${item.url}` : ""}${item.location ? ` | Location: ${item.location}` : ""}`)
  ].join("\n");
}

function localMemo(snapshot: Snapshot, profile: QuestionProfile, analysis: ReturnType<typeof buildAnalysis>) {
  const evidence = analysis.evidence;
  const topRisks = Object.entries(snapshot.risks || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 4);
  const topEvidence = evidence.slice(0, 8);
  const marketRows = evidence.filter((item) => item.kind === "market").slice(0, 5);
  const eventRows = evidence.filter((item) => item.kind === "event").slice(0, 5);
  const newsRows = evidence.filter((item) => item.kind === "news").slice(0, 5);
  const regulationRows = evidence.filter((item) => item.kind === "regulation" || item.kind === "filing").slice(0, 5);
  const missing = Object.entries(snapshot.status || {}).filter(([, value]) => value !== "ok" && value !== "configured").slice(0, 8);

  return [
    "Bottom line",
    buildBottomLine(profile, snapshot, topEvidence, topRisks),
    "",
    "Evidence",
    topEvidence.length ? topEvidence.map(formatEvidence).join("\n") : "No directly relevant source-backed rows were found. The answer is limited to the broader live snapshot.",
    "",
    "Market/risk meaning",
    buildMeaning(profile, snapshot, { marketRows, eventRows, newsRows, regulationRows, topRisks }),
    "",
    "What to watch",
    buildWatchNext(profile, { marketRows, eventRows, newsRows, regulationRows, topRisks }),
    "",
    `Sources used: ${analysis.sources.join(", ") || "Unavailable"}`,
    `Confidence: ${analysis.confidence}/100 based on live provider coverage, direct evidence matches, severity, and recency.`,
    missing.length ? `Data gaps: ${missing.map(([name, status]) => `${name}=${status}`).join(", ")}.` : "Data gaps: none reported by the current provider status snapshot.",
    "Not financial advice. Treat this as source-backed market intelligence and verify before acting."
  ].join("\n");
}

function buildBottomLine(profile: QuestionProfile, snapshot: Snapshot, evidence: Evidence[], topRisks: Array<[string, number]>) {
  const latest = evidence.find((item) => item.kind === "news" || item.kind === "event" || item.kind === "filing" || item.kind === "regulation");
  const riskLine = topRisks.length ? `${topRisks[0][0]} is the highest current risk score at ${topRisks[0][1]}/100` : "the risk stack is unavailable";
  const breadth = snapshot.breadth ? `${snapshot.breadth.riskTone || "Unavailable"} breadth with ${snapshot.breadth.advancers ?? 0} advancers and ${snapshot.breadth.decliners ?? 0} decliners` : "market breadth is unavailable";

  if (profile.locations.length) {
    const countryRows = evidence.filter((item) => profile.locations.some((location) => `${item.title} ${item.detail} ${item.location || ""}`.toLowerCase().includes(location.toLowerCase())));
    return countryRows.length
      ? `${profile.locations.join(", ")}: current live rows point to ${countryRows[0].category || countryRows[0].kind} risk first. ${riskLine}; ${breadth}.`
      : `${profile.locations.join(", ")}: no direct country-specific row was returned in the current snapshot. Use the broader evidence below cautiously; ${riskLine}; ${breadth}.`;
  }
  if (profile.tickers.length && evidence.some((item) => item.kind === "market")) {
    const row = evidence.find((item) => item.kind === "market");
    return `${profile.tickers.join(", ")}: live quote/context rows are available. ${row?.detail || "Price detail unavailable"}. ${riskLine}.`;
  }
  if (profile.topics.regulation || profile.topics.filing) {
    return latest ? `The most relevant government/filing signal is: ${latest.title} (${latest.source}). ${riskLine}.` : `No directly relevant government or filing item was returned. ${riskLine}.`;
  }
  if (profile.topics.news) {
    return latest ? `The most relevant live headline/event is: ${latest.title} (${latest.source}). ${riskLine}.` : `No directly relevant live headline was returned. ${riskLine}.`;
  }
  return `${latest ? `The lead live signal is ${latest.title} (${latest.source}).` : "The current snapshot has limited direct evidence for this question."} ${riskLine}; ${breadth}.`;
}

function buildMeaning(profile: QuestionProfile, snapshot: Snapshot, rows: { marketRows: Evidence[]; eventRows: Evidence[]; newsRows: Evidence[]; regulationRows: Evidence[]; topRisks: Array<[string, number]> }) {
  const parts: string[] = [];
  if (rows.marketRows.length) {
    parts.push(`Market tape: ${rows.marketRows.map((row) => `${row.title} (${row.detail})`).join("; ")}.`);
  }
  if (rows.eventRows.length) {
    parts.push(`Country/geopolitical read: ${rows.eventRows.map((row) => `${row.title} - ${row.detail}`).join("; ")}.`);
  }
  if (rows.newsRows.length) {
    parts.push(`News read-through: ${rows.newsRows.map((row) => `[${row.severity || "INFO"}] ${row.title} (${row.source})`).join("; ")}.`);
  }
  if (rows.regulationRows.length) {
    parts.push(`Policy/filing read-through: ${rows.regulationRows.map((row) => `${row.title} (${row.source})`).join("; ")}.`);
  }
  if (rows.topRisks.length) {
    parts.push(`Risk stack: ${rows.topRisks.map(([name, value]) => `${name} ${value}/100`).join("; ")}.`);
  }
  if (profile.topics.realEstate) {
    parts.push("Real estate implication: focus on rates, mortgage data, credit stress, regional hazard events, insurance costs, regulation, and REIT/property-linked headlines returned by the live sources.");
  }
  if (profile.topics.commodity) {
    parts.push("Commodity implication: connect the live energy/metals/agriculture moves with shipping chokepoints, weather, sanctions, and conflict layers before drawing a directional view.");
  }
  if (profile.topics.country) {
    parts.push("Country implication: treat mapped events as risk signals for sanctions, logistics, defense, energy corridors, sovereign risk, FX sensitivity, and exposed multinationals, not as a complete country report.");
  }
  if (!parts.length) {
    const breadth = snapshot.breadth;
    parts.push(`Broad read: ${breadth?.riskTone || "market tone unavailable"}; ${breadth?.coverage ?? 0} instruments covered. Use the live evidence list as the boundary for this answer.`);
  }
  return parts.join("\n");
}

function buildWatchNext(profile: QuestionProfile, rows: { marketRows: Evidence[]; eventRows: Evidence[]; newsRows: Evidence[]; regulationRows: Evidence[]; topRisks: Array<[string, number]> }) {
  const items: string[] = [];
  if (rows.topRisks[0]) items.push(`Whether ${rows.topRisks[0][0]} rises above ${Math.min(100, rows.topRisks[0][1] + 10)}/100 or falls as new source rows arrive.`);
  if (rows.eventRows.length) items.push("Follow updated map events, source timestamps, severity changes, and whether multiple sources confirm the same country or corridor signal.");
  if (rows.marketRows.length) items.push("Watch price confirmation across the ticker tape, sector ETFs, rates, commodities, and crypto rather than one isolated move.");
  if (rows.regulationRows.length) items.push("Watch Federal Register, Congress, and SEC items for effective dates, enforcement language, issuer exposure, and industry scope.");
  if (rows.newsRows.length) items.push("Watch whether headlines become cross-source, quantified, and tied to asset prices or policy decisions.");
  if (profile.topics.realEstate) items.push("For real estate, track mortgage rates, Treasury yields, insurance/hazard signals, credit availability, and local regulation.");
  if (!items.length) items.push("Ask a more specific question with a ticker, country, sector, commodity, filing type, or time window to narrow the evidence set.");
  return items.map((item) => `- ${item}`).join("\n");
}

function formatEvidence(item: Evidence) {
  const stamp = item.publishedAt ? ` | ${item.publishedAt}` : "";
  const location = item.location ? ` | ${item.location}` : "";
  const url = item.url ? ` | ${item.url}` : "";
  return `- [${item.kind}${item.severity ? `/${item.severity}` : ""}] ${item.title} - ${item.detail} (${item.source}${stamp}${location}${url})`;
}
