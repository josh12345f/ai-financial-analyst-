"use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type Group = "index" | "equity" | "sector" | "commodity" | "crypto" | "rates";
type Instrument = { symbol: string; name: string; price: number | null; changePercent: number | null; source: string; status: string; group: Group; note?: string };
type NewsItem = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string };
type EventItem = NewsItem & { lat: number; lon: number; summary: string; impact: string };
type Snapshot = {
  generatedAt: string;
  status: Record<string, string>;
  markets: Instrument[];
  sectors: Instrument[];
  commodities: Instrument[];
  crypto: Instrument[];
  news: NewsItem[];
  events: EventItem[];
  macro: Record<string, string>;
  filings: NewsItem[];
  regulations: NewsItem[];
  insights: Record<string, string>;
  risks: Record<string, number>;
  breadth: { advancers: number; decliners: number; unchanged: number; averageChange: number | null; riskTone: string; coverage: number };
};
type Candle = { date: string; open: number | null; high: number | null; low: number | null; close: number | null; volume: number | null };
type TickerRisk = { label: string; score: number | null; summary: string; sources: string[] };
type WatchRow = { label: string; value: string; source: string; url?: string | null };
type TickerData = {
  symbol: string;
  generatedAt: string;
  status: "ready" | "unavailable";
  quote: { price: number | null; change: number | null; changePercent: number | null; high: number | null; low: number | null; open: number | null; previousClose: number | null; timestamp: string } | null;
  profile: { name: string | null; exchange: string | null; country: string | null; currency: string | null; industry: string | null; sector: string | null; marketCap: number | null; shareOutstanding: number | null; logo: string | null; weburl: string | null; description: string | null; ipo?: string | null };
  fundamentals: Record<string, number | null>;
  candles: Candle[];
  news: Array<{ title: string; source: string; url: string; publishedAt: string; summary: string; category?: string; severity?: Severity }>;
  filings?: NewsItem[];
  regulations?: NewsItem[];
  riskFactors?: TickerRisk[];
  upcomingWatch?: WatchRow[];
  sources: Record<string, string>;
};

const categories = ["All", "Markets", "Geopolitics", "Government", "Energy", "Real Estate", "Technology", "Conflict", "Economy", "SEC Filing"];
const severities = ["All", "INFO", "WATCH", "ALERT", "CRITICAL"] as const;

function money(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "Unavailable";
  if (Math.abs(v) >= 1_000_000_000_000) return `$${(v / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(v) >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (Math.abs(v) < 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
function pct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "Unavailable";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function moveClass(v: number | null | undefined) { return (v || 0) >= 0 ? "green" : "red"; }
function sevClass(sev: Severity) { return `sev-${sev.toLowerCase()}`; }
function when(v: string | null | undefined) { const d = new Date(v || ""); return Number.isNaN(d.getTime()) ? "Unavailable" : d.toLocaleString(); }
function validTicker(v: string) { return /^[A-Z0-9.-]{1,15}$/.test(v.trim().toUpperCase()); }
function formatNumber(v: number | null | undefined) { return v == null || Number.isNaN(v) ? "Unavailable" : v.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function severityRank(sev: Severity) { return sev === "CRITICAL" ? 4 : sev === "ALERT" ? 3 : sev === "WATCH" ? 2 : 1; }
function sourceCount(snapshot: Snapshot) { return Object.values(snapshot.status).filter((status) => status === "ok" || status === "configured").length; }
function categoryRows(snapshot: Snapshot, category: string) { return snapshot.news.filter((item) => item.category.toLowerCase() === category.toLowerCase()); }
function topAlerts(snapshot: Snapshot) {
  return [...snapshot.events, ...snapshot.news, ...snapshot.regulations, ...snapshot.filings]
    .filter((item) => item.severity !== "INFO")
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}
function filterNews(items: NewsItem[], filters: { category: string; severity: string; source: string; query: string }) {
  const q = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    const category = filters.category === "All" || item.category === filters.category;
    const severity = filters.severity === "All" || item.severity === filters.severity;
    const source = filters.source === "All" || item.source === filters.source;
    const query = !q || `${item.title} ${item.source} ${item.category}`.toLowerCase().includes(q);
    return category && severity && source && query;
  });
}

export function TickerIntelligence({ snapshot }: { snapshot: Snapshot }) {
  const [symbol, setSymbol] = useState("AAPL");
  const [data, setData] = useState<TickerData | null>(null);
  const [loading, setLoading] = useState(false);
  const fallback = snapshot.markets.find((row) => row.symbol === symbol) ?? null;
  const quotePrice = data?.quote?.price ?? fallback?.price ?? null;
  const quoteChange = data?.quote?.changePercent ?? fallback?.changePercent ?? null;
  const company = data?.profile?.name || fallback?.name || "Ticker intelligence";
  const needles = [symbol, company, data?.profile?.sector, data?.profile?.industry].filter(Boolean).map((value) => String(value).toLowerCase());
  const relatedNews = useMemo(() => {
    const local = snapshot.news.filter((item) => needles.some((needle) => `${item.title} ${item.source} ${item.category}`.toLowerCase().includes(needle))).slice(0, 10);
    const remote = (data?.news || []).map((item) => ({ title: item.title, source: item.source, url: item.url, category: item.category || "Ticker", severity: item.severity || "WATCH" as Severity, publishedAt: item.publishedAt }));
    return [...remote, ...local].filter((item, index, arr) => item.title && arr.findIndex((other) => other.title === item.title) === index).slice(0, 12);
  }, [data?.news, needles, snapshot.news]);
  const filings = useMemo(() => (data?.filings?.length ? data.filings : snapshot.filings.filter((item) => needles.some((needle) => item.title.toLowerCase().includes(needle))).slice(0, 8)), [data?.filings, needles, snapshot.filings]);
  const regulations = useMemo(() => (data?.regulations?.length ? data.regulations : snapshot.regulations.filter((item) => needles.some((needle) => item.title.toLowerCase().includes(needle))).slice(0, 8)), [data?.regulations, needles, snapshot.regulations]);
  const risks = data?.riskFactors?.length ? data.riskFactors : fallbackTickerRisks(snapshot, relatedNews, filings, regulations);

  async function load(next = symbol) {
    const clean = next.trim().toUpperCase();
    if (!validTicker(clean)) return;
    setSymbol(clean);
    setLoading(true);
    try {
      const response = await fetch(`/api/ticker?symbol=${encodeURIComponent(clean)}`, { cache: "no-store" });
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load("AAPL"); }, []);

  return (
    <section className="tickerWorkbench tickerWorkbenchExpanded">
      <header className="tickerWorkbenchHeader">
        <div>
          <h2>Ticker Intelligence Workbench</h2>
          <p>Search any public ticker for quote, chart, fundamentals, news, SEC, government risk, valuation context, and things to watch.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); load(); }}>
          <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="AAPL, MSFT, BRK.B, TSM" />
          <button disabled={!validTicker(symbol) || loading}>{loading ? "Loading" : "Analyze"}</button>
        </form>
      </header>
      <div className="tickerQuickRow">
        {["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "JPM", "XOM", "GLD", "TSM", "BRK.B", "SHOP"].map((item) => <button key={item} onClick={() => load(item)}>{item}</button>)}
        <span>{data?.status === "ready" ? `Updated ${when(data.generatedAt)}` : "Provider-backed data only. Unavailable fields stay labeled."}</span>
      </div>
      <div className="tickerWorkbenchGrid tickerDeepGrid">
        <div className="tickerQuoteCard">
          <div><span>{symbol}</span><strong>{company}</strong><small>{[data?.profile?.exchange || fallback?.source, data?.profile?.sector, data?.profile?.industry].filter(Boolean).join(" | ") || "Provider pending"}</small></div>
          <b>{money(quotePrice)}</b><em className={moveClass(quoteChange)}>{pct(quoteChange)}</em>
          <dl><div><dt>Open</dt><dd>{money(data?.quote?.open)}</dd></div><div><dt>High</dt><dd>{money(data?.quote?.high)}</dd></div><div><dt>Low</dt><dd>{money(data?.quote?.low)}</dd></div><div><dt>Prev Close</dt><dd>{money(data?.quote?.previousClose)}</dd></div></dl>
        </div>
        <div className="tickerChartCard"><PriceChart candles={data?.candles || []} fallbackPrice={quotePrice} /></div>
        <div className="tickerFundamentals">
          <Metric label="Market Cap" value={money(data?.profile?.marketCap ? data.profile.marketCap * 1_000_000 : data?.fundamentals?.marketCap)} />
          <Metric label="P/E" value={formatNumber(data?.fundamentals?.peRatio)} />
          <Metric label="Beta" value={formatNumber(data?.fundamentals?.beta)} />
          <Metric label="EPS" value={formatNumber(data?.fundamentals?.eps)} />
          <Metric label="Revenue TTM" value={money(data?.fundamentals?.revenueTtm)} />
          <Metric label="Profit Margin" value={pct((data?.fundamentals?.profitMargin || 0) * 100)} />
          <Metric label="52W High" value={money(data?.fundamentals?.week52High)} />
          <Metric label="52W Low" value={money(data?.fundamentals?.week52Low)} />
        </div>
        <RiskFactorPanel risks={risks} />
        <ContextPanel title="Upcoming / Things To Watch" rows={data?.upcomingWatch || []} empty="No upcoming earnings, filing, regulation, or event rows returned." />
        <NewsContextPanel title="Related News" rows={relatedNews} />
        <NewsContextPanel title="SEC Filings" rows={filings} />
        <NewsContextPanel title="Government / Regulation" rows={regulations} />
        <a className="tickerDcfLink" href={`#dcf`}><strong>DCF Valuation</strong><span>Use this ticker in the DCF workbench below. Missing financial statement fields remain unavailable instead of fabricated.</span></a>
      </div>
    </section>
  );
}

function PriceChart({ candles, fallbackPrice }: { candles: Candle[]; fallbackPrice: number | null }) {
  const points = candles.filter((row) => row.close != null).slice(-90);
  const values = points.map((row) => row.close as number);
  const min = values.length ? Math.min(...values) : fallbackPrice ?? 0;
  const max = values.length ? Math.max(...values) : fallbackPrice ?? 1;
  const range = Math.max(max - min, 0.0001);
  const path = values.length ? values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") : "";
  const change = values.length > 1 ? ((values[values.length - 1] - values[0]) / values[0]) * 100 : null;
  return <div className="priceChart"><header><span>Price Chart</span><strong className={moveClass(change)}>{pct(change)}</strong></header>{path ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Ticker price chart"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.28" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><path d={`${path} L100,100 L0,100 Z`} fill="url(#chartFill)" /><path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg> : <div className="chartUnavailable">Chart unavailable from configured providers.</div>}<footer><span>{points[0]?.date || "No start"}</span><span>{points[points.length - 1]?.date || "No end"}</span></footer></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function RiskFactorPanel({ risks }: { risks: TickerRisk[] }) { return <section className="depthModule tickerRiskFactors"><h3>Ticker Risk Stack</h3>{risks.map((risk) => <div key={risk.label}><header><span>{risk.label}</span><b>{risk.score ?? "N/A"}/100</b></header><i><b style={{ width: `${Math.max(0, Math.min(100, risk.score ?? 0))}%` }} /></i><p>{risk.summary}</p><small>{risk.sources.join(", ") || "No source"}</small></div>)}</section>; }
function ContextPanel({ title, rows, empty }: { title: string; rows: WatchRow[]; empty: string }) { return <section className="depthModule tickerContextModule"><h3>{title}</h3>{rows.length ? rows.slice(0, 10).map((row, index) => <a href={row.url || undefined} target="_blank" rel="noreferrer" key={`${title}-${index}-${row.value}`}><span>{row.label}</span><b>{row.value}</b><small>{row.source}</small></a>) : <p className="emptyState">{empty}</p>}</section>; }
function NewsContextPanel({ title, rows }: { title: string; rows: NewsItem[] }) { return <section className="depthModule tickerContextModule"><h3>{title}</h3>{rows.length ? rows.slice(0, 10).map((row, index) => <a href={row.url} target="_blank" rel="noreferrer" key={`${title}-${index}-${row.title}`}><span className={sevClass(row.severity)}>{row.severity}</span><b>{row.title}</b><small>{row.source} | {row.category} | {when(row.publishedAt)}</small></a>) : <p className="emptyState">Unavailable from current providers.</p>}</section>; }
function fallbackTickerRisks(snapshot: Snapshot, news: NewsItem[], filings: NewsItem[], regs: NewsItem[]): TickerRisk[] { return [{ label: "News risk", score: Math.min(95, news.filter((n) => n.severity !== "INFO").length * 12 + 20), summary: `${news.length} related headlines are available from the current snapshot.`, sources: [...new Set(news.map((n) => n.source))] }, { label: "Regulatory / SEC risk", score: Math.min(95, filings.length * 8 + regs.length * 8 + 20), summary: `${filings.length} SEC rows and ${regs.length} government rows matched the ticker context.`, sources: [...new Set([...filings, ...regs].map((n) => n.source))] }, { label: "Macro / geopolitical risk", score: Math.min(95, snapshot.events.filter((e) => e.severity !== "INFO").length * 4 + 30), summary: "Score uses mapped event severity and current macro/news risk density.", sources: [...new Set(snapshot.events.map((e) => e.source))] }]; }

export function SectionDashboard({ active, snapshot }: { active: string; snapshot: Snapshot }) {
  const [newsCategory, setNewsCategory] = useState("All");
  const [newsSeverity, setNewsSeverity] = useState("All");
  const [newsSource, setNewsSource] = useState("All");
  const [newsQuery, setNewsQuery] = useState("");
  const all = [...snapshot.markets, ...snapshot.sectors, ...snapshot.commodities, ...snapshot.crypto];
  const movers = all.filter((row) => row.changePercent != null).sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
  const alerts = topAlerts(snapshot);
  const sources = ["All", ...Array.from(new Set(snapshot.news.map((item) => item.source))).sort()];
  const filteredNews = filterNews(snapshot.news, { category: newsCategory, severity: newsSeverity, source: newsSource, query: newsQuery });
  const context = active.toLowerCase();

  if (context === "markets") return <section className="sectionDashboard marketsView"><MarketModule title="Major Index, Rates & Equity Board" rows={snapshot.markets} /><MarketModule title="Top Movers" rows={movers.slice(0, 12)} /><MarketModule title="Top Laggards" rows={movers.slice(-12).reverse()} /><RiskBars risks={snapshot.risks} title="Market Risk Stack" /></section>;
  if (context === "commodities") return <section className="sectionDashboard commoditiesView"><MarketModule title="Energy / Metals / Agriculture" rows={snapshot.commodities} /><MarketModule title="Crypto Cross-Market Tape" rows={snapshot.crypto} /><NewsCluster title="Energy & Commodity News" items={[...categoryRows(snapshot, "Energy"), ...snapshot.news.filter((item) => /oil|gas|gold|copper|commodity|crypto/i.test(item.title))].slice(0, 14)} /><CommodityPressure rows={snapshot.commodities} /></section>;
  if (context === "news") return <section className="sectionDashboard newsView"><NewsFilterModule category={newsCategory} severity={newsSeverity} source={newsSource} query={newsQuery} sources={sources} setCategory={setNewsCategory} setSeverity={setNewsSeverity} setSource={setNewsSource} setQuery={setNewsQuery} total={snapshot.news.length} filtered={filteredNews.length} /><AlertMatrix items={filteredNews.filter((x) => x.severity !== "INFO").slice(0, 18)} /><CategoryMatrix snapshot={snapshot} /><NewsCluster title="Live Multi-Source News" items={filteredNews.slice(0, 24)} wide /></section>;
  if (context === "government") return <section className="sectionDashboard governmentView"><NewsCluster title="Federal Register & Congress" items={snapshot.regulations.slice(0, 16)} /><NewsCluster title="SEC Filing Monitor" items={snapshot.filings.slice(0, 16)} /><RiskBars risks={{ "Regulatory Risk": snapshot.risks["Regulatory Risk"] || 0, "Market Risk": snapshot.risks["Market Risk"] || 0, "Real Estate Risk": snapshot.risks["Real Estate Risk"] || 0 }} title="Policy Impact" /><ProviderMatrix snapshot={snapshot} /></section>;
  if (context === "ai") return <section className="sectionDashboard aiView"><InsightGrid snapshot={snapshot} /><RiskBars risks={snapshot.risks} title="AI Risk Scores" /><AlertMatrix items={alerts.slice(0, 14)} /><ProviderMatrix snapshot={snapshot} /></section>;
  return <section className="sectionDashboard globalView"><MarketModule title="Major Markets & Stocks" rows={snapshot.markets} /><MarketModule title="Sector Heatmap" rows={snapshot.sectors} heatmap /><MarketModule title="Commodities / Metals / Energy" rows={snapshot.commodities} /><MarketModule title="Cryptocurrencies" rows={snapshot.crypto} /><LayerLoad snapshot={snapshot} /><AlertMatrix items={alerts.slice(0, 12)} /><ProviderMatrix snapshot={snapshot} /></section>;
}

function MarketModule({ title, rows, heatmap = false }: { title: string; rows: Instrument[]; heatmap?: boolean }) { if (!rows.length) return <section className="depthModule"><h3>{title}</h3><p className="emptyState">Unavailable from configured providers.</p></section>; if (heatmap) return <section className="depthModule"><h3>{title}</h3><div className="depthHeatmap">{rows.slice(0, 14).map((row) => <article className={moveClass(row.changePercent)} key={`${row.group}-${row.symbol}`}><span>{row.symbol}</span><b>{row.name}</b><em>{pct(row.changePercent)}</em></article>)}</div></section>; return <section className="depthModule"><h3>{title}</h3><table className="depthTable"><thead><tr><th>Symbol</th><th>Last</th><th>Move</th><th>Source</th></tr></thead><tbody>{rows.slice(0, 16).map((row) => <tr key={`${row.group}-${row.symbol}`}><td><b>{row.symbol}</b><span>{row.name}</span></td><td>{money(row.price)}</td><td className={moveClass(row.changePercent)}>{pct(row.changePercent)}</td><td>{row.source}</td></tr>)}</tbody></table></section>; }
function AlertMatrix({ items }: { items: NewsItem[] }) { return <section className="depthModule alertMatrix"><h3>Alert Matrix</h3>{items.length ? items.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={`${index}-${item.title}`}><span className={sevClass(item.severity)}>{item.severity}</span><b>{item.title}</b><small>{item.source} | {item.category} | {when(item.publishedAt)}</small></a>) : <p className="emptyState">No active alerts returned.</p>}</section>; }
function NewsCluster({ title, items, wide = false }: { title: string; items: NewsItem[]; wide?: boolean }) { return <section className={`depthModule newsCluster ${wide ? "wide" : ""}`}><h3>{title}</h3>{items.length ? items.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={`${index}-${item.title}`}><span className={sevClass(item.severity)}>{item.severity}</span><b>{item.title}</b><small>{item.source} | {item.category} | {when(item.publishedAt)}</small></a>) : <p className="emptyState">No matching live news returned.</p>}</section>; }
function RiskBars({ risks, title }: { risks: Record<string, number>; title: string }) { return <section className="depthModule riskDepth"><h3>{title}</h3>{Object.entries(risks).map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i><em>{value}/100</em></div>)}</section>; }
function CategoryMatrix({ snapshot }: { snapshot: Snapshot }) { const rows = categories.filter((x) => x !== "All"); return <section className="depthModule categoryMatrix"><h3>News Category Load</h3>{rows.map((cat) => { const items = cat === "SEC Filing" ? snapshot.filings : categoryRows(snapshot, cat); const severe = items.filter((row) => row.severity === "ALERT" || row.severity === "CRITICAL").length; return <article key={cat}><span>{cat}</span><b>{items.length}</b><em className={severe ? "red" : "green"}>{severe} severe</em></article>; })}</section>; }
function CommodityPressure({ rows }: { rows: Instrument[] }) { return <section className="depthModule pressureModule"><h3>Commodity Pressure</h3>{rows.slice(0, 10).map((row) => <div key={row.symbol}><span>{row.symbol}</span><i><b className={moveClass(row.changePercent)} style={{ width: `${Math.min(100, Math.abs(row.changePercent || 0) * 10 + 8)}%` }} /></i><em className={moveClass(row.changePercent)}>{pct(row.changePercent)}</em></div>)}</section>; }
function InsightGrid({ snapshot }: { snapshot: Snapshot }) { return <section className="depthModule insightDepth"><h3>AI Analyst Notes</h3>{Object.entries(snapshot.insights).map(([label, value]) => <article key={label}><span>{label}</span><p>{value}</p></article>)}</section>; }
function ProviderMatrix({ snapshot }: { snapshot: Snapshot }) { return <section className="depthModule providerMatrix"><h3>Data Health</h3><article><span>Live Sources</span><b>{sourceCount(snapshot)}</b><em>{Object.keys(snapshot.status).length} total</em></article><article><span>News Rows</span><b>{snapshot.news.length}</b><em>multi-source feeds</em></article><article><span>Mapped Events</span><b>{snapshot.events.length}</b><em>geo risk</em></article><article><span>SEC Filings</span><b>{snapshot.filings.length}</b><em>EDGAR</em></article></section>; }
function NewsFilterModule(props: { category: string; severity: string; source: string; query: string; sources: string[]; total: number; filtered: number; setCategory: (v: string) => void; setSeverity: (v: string) => void; setSource: (v: string) => void; setQuery: (v: string) => void }) { return <section className="depthModule newsFilterModule"><h3>News Filters & Analysis</h3><div className="newsFilterControls"><input value={props.query} onChange={(e) => props.setQuery(e.target.value)} placeholder="Search all loaded headlines" /><select value={props.category} onChange={(e) => props.setCategory(e.target.value)}>{categories.map((x) => <option key={x}>{x}</option>)}</select><select value={props.severity} onChange={(e) => props.setSeverity(e.target.value)}>{severities.map((x) => <option key={x}>{x}</option>)}</select><select value={props.source} onChange={(e) => props.setSource(e.target.value)}>{props.sources.map((x) => <option key={x}>{x}</option>)}</select></div><div className="newsFilterStats"><Metric label="All News" value={String(props.total)} /><Metric label="Filtered" value={String(props.filtered)} /><Metric label="Sources" value={String(props.sources.length - 1)} /></div></section>; }
function LayerLoad({ snapshot }: { snapshot: Snapshot }) { const rows = [{ label: "Conflicts", value: snapshot.events.filter((e) => e.category === "Conflict").length }, { label: "Market Stress", value: topAlerts(snapshot).length }, { label: "News Hotspots", value: snapshot.news.length }, { label: "Regulations", value: snapshot.regulations.length }, { label: "SEC Filings", value: snapshot.filings.length }, { label: "Energy", value: snapshot.news.filter((n) => n.category === "Energy").length }, { label: "Real Estate", value: snapshot.news.filter((n) => n.category === "Real Estate").length }, { label: "Technology", value: snapshot.news.filter((n) => n.category === "Technology").length }]; return <section className="depthModule layerLoadModule"><h3>Live Layer Exposure</h3>{rows.map((row) => <article key={row.label}><span>{row.label}</span><b>{row.value}</b><i><em style={{ width: `${Math.min(100, row.value * 7)}%` }} /></i></article>)}</section>; }
