"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SectionDashboard, TickerIntelligence } from "./DashboardDepth";
import { LiveRiskMap } from "./LiveRiskMap";

type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type Group = "index" | "equity" | "sector" | "commodity" | "crypto" | "rates";
type Instrument = { symbol: string; name: string; price: number | null; changePercent: number | null; source: string; status: string; group: Group; note?: string };
type NewsItem = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string };
type EventItem = NewsItem & { lat: number; lon: number; summary: string; impact: string; layer?: string; confidence?: number };
type LayerStat = { layer: string; count: number; severe: number; sources: string[] };
type Snapshot = {
  generatedAt: string;
  status: Record<string, string>;
  markets: Instrument[];
  sectors: Instrument[];
  commodities: Instrument[];
  crypto: Instrument[];
  news: NewsItem[];
  events: EventItem[];
  layers: LayerStat[];
  macro: Record<string, string>;
  filings: NewsItem[];
  regulations: NewsItem[];
  insights: Record<string, string>;
  risks: Record<string, number>;
  breadth: { advancers: number; decliners: number; unchanged: number; averageChange: number | null; riskTone: string; coverage: number };
};
type DcfInputs = { revenue: number; growth: number; ebitMargin: number; taxRate: number; reinvestment: number; wacc: number; terminalGrowth: number; netDebt: number; shares: number };
type DcfLookup = { symbol: string; companyName: string | null; price: number | null; source: string | null; status: "ready" | "unavailable"; sources: Record<string, string> };

const blank: Snapshot = {
  generatedAt: "",
  status: {},
  markets: [],
  sectors: [],
  commodities: [],
  crypto: [],
  news: [],
  events: [],
  layers: [],
  macro: {},
  filings: [],
  regulations: [],
  insights: {},
  risks: {},
  breadth: { advancers: 0, decliners: 0, unchanged: 0, averageChange: null, riskTone: "Unavailable", coverage: 0 }
};
const defaultLayers: LayerStat[] = [
  { layer: "conflicts", count: 0, severe: 0, sources: [] },
  { layer: "military", count: 0, severe: 0, sources: [] },
  { layer: "sanctions", count: 0, severe: 0, sources: [] },
  { layer: "energy", count: 0, severe: 0, sources: [] },
  { layer: "waterways", count: 0, severe: 0, sources: [] },
  { layer: "weather", count: 0, severe: 0, sources: [] },
  { layer: "natural", count: 0, severe: 0, sources: [] },
  { layer: "outages", count: 0, severe: 0, sources: [] },
  { layer: "cloudRegions", count: 0, severe: 0, sources: [] },
  { layer: "techEvents", count: 0, severe: 0, sources: [] },
  { layer: "cybersecurity", count: 0, severe: 0, sources: [] },
  { layer: "economic", count: 0, severe: 0, sources: [] },
  { layer: "regulations", count: 0, severe: 0, sources: [] },
  { layer: "hotspots", count: 0, severe: 0, sources: [] }
];
const layerNames: Record<string, string> = {
  conflicts: "Conflicts",
  bases: "Bases",
  hotspots: "News Hotspots",
  nuclear: "Nuclear",
  sanctions: "Sanctions",
  weather: "Weather",
  economic: "Economic",
  waterways: "Waterways",
  outages: "Outages",
  military: "Military / Airspace",
  natural: "Natural Hazards",
  energy: "Energy",
  regulations: "Regulations",
  cloudRegions: "Cloud / Tech Infra",
  techEvents: "Tech Events",
  cybersecurity: "Cybersecurity",
  newsHotspots: "News Hotspots"
};
const nav = ["Global", "Markets", "Commodities", "News", "Government", "AI"];
const timeRanges = ["1h", "24h", "7d", "30d"];
const regions = ["Global", "US", "Europe", "Asia", "Middle East", "Latin America"];

function cls(sev: Severity) { return `sev-${sev.toLowerCase()}`; }
function pct(v: number | null) { return v === null || Number.isNaN(v) ? "Unavailable" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function money(v: number | null) { return v === null || Number.isNaN(v) ? "Unavailable" : v > 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`; }
function compact(v: number) { return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}M`; }
function when(v: string) { const d = new Date(v); return Number.isNaN(d.getTime()) ? "Unavailable" : d.toLocaleString(); }
function moveClass(v: number | null) { return (v || 0) >= 0 ? "green" : "red"; }
function validTicker(v: string) { return /^[A-Z0-9.-]{1,15}$/.test(v.trim().toUpperCase()); }
function layerLabel(layer: string) { return layerNames[layer] || layer.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()); }
function severityRank(sev: Severity) { return sev === "CRITICAL" ? 4 : sev === "ALERT" ? 3 : sev === "WATCH" ? 2 : 1; }
function avgRisk(risks: Record<string, number>) { const values = Object.values(risks); return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }

export default function Home() {
  const [snapshot, setSnapshot] = useState<Snapshot>(blank);
  const [active, setActive] = useState("Global");
  const [timeRange, setTimeRange] = useState("24h");
  const [region, setRegion] = useState("Global");
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("What matters today for markets and my watchlist?");
  const [answer, setAnswer] = useState("Ask the AI analyst about market risk, DCF, SEC filings, commodities, laws, geopolitics, or watchlist exposure.");

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/snapshot", { cache: "no-store" });
      setSnapshot(await res.json());
    } finally {
      setLoading(false);
    }
  }
  async function ask() {
    setAnswer("Analyzing live app data and source context...");
    const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, snapshot }) });
    const data = await res.json();
    setAnswer(data.answer || "No AI answer available.");
  }
  useEffect(() => { refresh(); const id = setInterval(refresh, 300000); return () => clearInterval(id); }, []);

  const allInstruments = useMemo(() => [...snapshot.markets, ...snapshot.sectors, ...snapshot.commodities, ...snapshot.crypto], [snapshot]);
  const tickerTape = useMemo(() => [...allInstruments, ...allInstruments], [allInstruments]);
  const liveLayers = useMemo(() => (snapshot.layers?.length ? snapshot.layers : defaultLayers), [snapshot.layers]);
  const topRisk = useMemo(() => Object.entries(snapshot.risks).sort((a, b) => b[1] - a[1])[0], [snapshot.risks]);
  const liveSources = Object.values(snapshot.status).filter((v) => v === "ok" || v === "configured").length;
  const alerts = useMemo(() => [...snapshot.events, ...snapshot.news, ...snapshot.regulations, ...snapshot.filings].filter((x) => x.severity !== "INFO").sort((a, b) => severityRank(b.severity) - severityRank(a.severity)), [snapshot]);
  const topLayer = liveLayers.slice().sort((a, b) => b.severe - a.severe || b.count - a.count)[0];
  const bestMover = allInstruments.filter((x) => x.changePercent !== null).sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))[0];
  const worstMover = allInstruments.filter((x) => x.changePercent !== null).sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0))[0];

  return <main className="terminal">
    <header className="commandbar commandbarUpgraded">
      <div className="brandBlock"><span className="brandMark">WM</span><div><b>WORLD MARKET WATCHER</b><small>AI financial intelligence terminal</small></div></div>
      <div className="commandSearchCluster">
        <input className="commandInput" placeholder="Search tickers, filings, laws, macro series, commodities, risks" />
        <div className="commandControlRow">
          <span>Range</span>{timeRanges.map((range) => <button key={range} className={timeRange === range ? "selected" : ""} onClick={() => setTimeRange(range)}>{range}</button>)}
          <select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </div>
      <div className="commandStats"><span className="liveDot">LIVE</span><span>{loading ? "Refreshing" : "Synced"}</span><span>{snapshot.events.length} events</span><span>{alerts.length} alerts</span><span>{allInstruments.length} instruments</span><span>{snapshot.generatedAt ? when(snapshot.generatedAt) : "No snapshot"}</span><button onClick={refresh}>Refresh</button></div>
    </header>

    <section className="workspace workspaceUpgraded">
      <aside className="leftRail leftRailUpgraded">
        <div className="railNav">{nav.map((n) => <button key={n} className={active === n ? "selected" : ""} onClick={() => setActive(n)}>{n}</button>)}</div>
        <Panel title="Live Layers"><div className="layerGrid">{liveLayers.map((layer, index) => <label key={`${layer.layer}-${index}`}><span><input type="checkbox" defaultChecked />{layerLabel(layer.layer)}</span><small>{layer.count} events / {layer.severe} severe</small></label>)}</div></Panel>
        <Panel title="Provider Status"><div className="statusList">{Object.entries(snapshot.status).map(([k, v]) => <div key={k}><span>{k}</span><b className={v === "ok" || v === "configured" ? "green" : v === "missing_key" ? "yellow" : "red"}>{v}</b></div>)}</div></Panel>
        <Panel title="Market Breadth"><div className="breadth"><b>{snapshot.breadth.riskTone}</b><span>{snapshot.breadth.advancers} up / {snapshot.breadth.decliners} down</span><Meter value={snapshot.breadth.coverage ? (snapshot.breadth.advancers / snapshot.breadth.coverage) * 100 : 0} /></div></Panel>
        <QuickCommandPanel active={active} setActive={setActive} />
      </aside>

      <section className="centerStage centerStageDeep centerStageUpgraded">
        <div className="tickerStrip tickerTape" aria-label="Live sliding market ticker tape">
          <div className="tickerLoop">
            {tickerTape.map((m, index) => <div className="ticker" key={`${m.group}-${m.symbol}-${index}`}><span>{m.symbol}</span><b>{money(m.price)}</b><em className={moveClass(m.changePercent)}>{pct(m.changePercent)}</em></div>)}
          </div>
        </div>
        <MissionPulse snapshot={snapshot} alerts={alerts} liveSources={liveSources} topRisk={topRisk} topLayer={topLayer} bestMover={bestMover} worstMover={worstMover} setActive={setActive} timeRange={timeRange} region={region} />
        <div className="heroGrid heroGridUpgraded">
          <Panel title="Global Risk Map" className="mapPanel"><LiveRiskMap events={snapshot.events} /></Panel>
          <Panel title="AI Analyst Panel" className="riskPanel"><RiskStack risks={snapshot.risks} /></Panel>
        </div>
        <TickerIntelligence snapshot={snapshot} />
        <SectionDashboard active={active} snapshot={snapshot} />
        <DcfWorkbench snapshot={snapshot} />
      </section>

      <aside className="rightRail rightRailUpgraded">
        <Panel title="AI Executive Intelligence"><div className="insightList">{Object.entries(snapshot.insights).map(([k, v]) => <article key={k}><b>{k}</b><p>{v}</p></article>)}</div></Panel>
        <SignalStack alerts={alerts} />
        <Panel title="Alert Center"><div className="alertList">{alerts.slice(0, 16).map((x, i) => <a href={x.url} target="_blank" rel="noreferrer" key={`${x.source}-${i}-${x.title}`}><span className={cls(x.severity)}>{x.severity}</span><b>{x.title}</b><small>{x.source} | {x.category}</small></a>)}</div></Panel>
        <Panel title="AI Assistant"><div className="assistant"><div className="chatBox">{answer}</div><div className="askBox"><input value={question} onChange={(e) => setQuestion(e.target.value)} /><button onClick={ask}>Ask</button></div></div></Panel>
      </aside>
    </section>

    <section className="bottomDock bottomDockUpgraded">
      <Feed title="Live News Feed" items={snapshot.news} />
      <Feed title="SEC Filings Monitor" items={snapshot.filings} />
      <Feed title="Government & Regulation Feed" items={snapshot.regulations} />
      <MacroPanel snapshot={snapshot} liveSources={liveSources} topRisk={topRisk} />
    </section>
  </main>;
}

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><header><h2>{title}</h2><span>LIVE</span></header><div className="panelBody">{children}</div></section>;
}
function Meter({ value }: { value: number }) { return <div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }
function RiskStack({ risks }: { risks: Record<string, number> }) {
  const score = avgRisk(risks);
  return <div className="riskStack upgradedRiskStack"><div className="riskDial"><b>{score}</b><span>Composite risk</span><Meter value={score} /></div>{Object.entries(risks).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k}><div><b>{k}</b><span>{v} /100</span></div><Meter value={v} /></div>)}</div>;
}
function Feed({ title, items }: { title: string; items: NewsItem[] }) {
  return <section className="feedPanel"><h2>{title}</h2><div>{items.length ? items.slice(0, 12).map((n, i) => <a href={n.url} target="_blank" rel="noreferrer" key={`${n.source}-${i}-${n.title}`}><span className={cls(n.severity)}>{n.severity}</span><b>{n.title}</b><small>{n.source} | {n.category} | {when(n.publishedAt)}</small></a>) : <p className="emptyState">Unavailable from configured providers.</p>}</div></section>;
}
function MacroPanel({ snapshot, liveSources, topRisk }: { snapshot: Snapshot; liveSources: number; topRisk?: [string, number] }) {
  return <section className="feedPanel"><h2>Data Status & System Health</h2><div className="macroGrid"><div><b>{liveSources}</b><span>Live Sources</span></div><div><b>{topRisk?.[0] || "Unavailable"}</b><span>Top Risk</span></div>{Object.entries(snapshot.macro).map(([k, v]) => <div key={k}><b>{v}</b><span>{k}</span></div>)}</div></section>;
}
function QuickCommandPanel({ active, setActive }: { active: string; setActive: (value: string) => void }) {
  const items = ["Global", "Markets", "Commodities", "News", "Government", "AI"];
  return <Panel title="Quick Commands"><div className="quickCommandGrid">{items.map((item) => <button key={item} className={active === item ? "selected" : ""} onClick={() => setActive(item)}>{item}</button>)}<a href="#dcf">DCF Workbench</a><a href="#top">Top</a></div></Panel>;
}
function MissionPulse(props: { snapshot: Snapshot; alerts: NewsItem[]; liveSources: number; topRisk?: [string, number]; topLayer?: LayerStat; bestMover?: Instrument; worstMover?: Instrument; setActive: (value: string) => void; timeRange: string; region: string }) {
  const riskScore = avgRisk(props.snapshot.risks);
  const severe = props.alerts.filter((item) => item.severity === "CRITICAL" || item.severity === "ALERT").length;
  const tiles = [
    { label: "Composite risk", value: `${riskScore}/100`, detail: props.topRisk ? props.topRisk[0] : "No risk stack", tone: riskScore > 70 ? "red" : riskScore > 45 ? "orange" : "green", action: "AI" },
    { label: "Severe alerts", value: String(severe), detail: `${props.alerts.length} total watch items`, tone: severe ? "orange" : "green", action: "News" },
    { label: "Dominant layer", value: props.topLayer ? layerLabel(props.topLayer.layer) : "Unavailable", detail: props.topLayer ? `${props.topLayer.count} events, ${props.topLayer.severe} severe` : "No mapped layer", tone: props.topLayer?.severe ? "yellow" : "green", action: "Global" },
    { label: "Market tape", value: props.snapshot.breadth.riskTone, detail: `${props.snapshot.breadth.advancers} up / ${props.snapshot.breadth.decliners} down`, tone: props.snapshot.breadth.averageChange && props.snapshot.breadth.averageChange < 0 ? "red" : "green", action: "Markets" },
    { label: "Best / worst", value: props.bestMover ? props.bestMover.symbol : "N/A", detail: `${pct(props.bestMover?.changePercent ?? null)} | ${props.worstMover?.symbol || "N/A"} ${pct(props.worstMover?.changePercent ?? null)}`, tone: "blue", action: "Markets" },
    { label: "Coverage", value: `${props.liveSources} live`, detail: `${props.region} | ${props.timeRange} view`, tone: "green", action: "Government" }
  ];
  return <section className="missionPulse" id="top">{tiles.map((tile) => <button key={tile.label} onClick={() => props.setActive(tile.action)}><span>{tile.label}</span><b className={tile.tone}>{tile.value}</b><small>{tile.detail}</small><i /></button>)}</section>;
}
function SignalStack({ alerts }: { alerts: NewsItem[] }) {
  const [filter, setFilter] = useState<"All" | Severity>("All");
  const rows = alerts.filter((item) => filter === "All" || item.severity === filter).slice(0, 9);
  return <Panel title="Signal Stack"><div className="signalStack"><div className="signalTabs">{["All", "WATCH", "ALERT", "CRITICAL"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item as "All" | Severity)}>{item}</button>)}</div>{rows.length ? rows.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={`${item.source}-${index}-${item.title}`}><span className={cls(item.severity)}>{item.severity}</span><b>{item.title}</b><small>{item.source} | {item.category} | {when(item.publishedAt)}</small></a>) : <p className="emptyState">No live signals match this filter.</p>}</div></Panel>;
}

function DcfWorkbench({ snapshot }: { snapshot: Snapshot }) {
  const candidates = snapshot.markets.filter((m) => m.group === "equity" || m.group === "index");
  const [symbol, setSymbol] = useState("AAPL");
  const [lookup, setLookup] = useState<DcfLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const fallback = candidates.find((m) => m.symbol === symbol) || candidates[0] || null;
  const price = lookup?.price ?? fallback?.price ?? null;
  const displaySymbol = lookup?.symbol || symbol;
  const company = lookup?.companyName || fallback?.name || "Public company";
  const [inputs, setInputs] = useState<DcfInputs>({ revenue: 100000, growth: 7, ebitMargin: 24, taxRate: 21, reinvestment: 5, wacc: 9.5, terminalGrowth: 2.5, netDebt: 0, shares: 1000 });
  const cases = useMemo(() => buildDcf(inputs, price), [inputs, price]);
  const relatedFilings = snapshot.filings.filter((f) => f.title.toUpperCase().includes(displaySymbol));
  const relatedNews = snapshot.news.filter((n) => n.title.toUpperCase().includes(displaySymbol)).slice(0, 4);

  async function runTicker(next = symbol) {
    const clean = next.trim().toUpperCase();
    if (!validTicker(clean)) return;
    setSymbol(clean);
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/dcf?symbol=${encodeURIComponent(clean)}`, { cache: "no-store" });
      setLookup(await res.json());
    } finally {
      setLookupLoading(false);
    }
  }

  return <section className="dcfSection" id="dcf">
    <div className="dcfHeader"><div><h2>DCF Valuation Workbench</h2><p>Type any public ticker. Live price and company data load server-side when provider APIs return data.</p></div><form className="dcfTickerSearch" onSubmit={(e) => { e.preventDefault(); runTicker(); }}><label><span>Ticker</span><input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL, MSFT, BRK.B, TSM" /></label><button disabled={!validTicker(symbol) || lookupLoading}>{lookupLoading ? "Loading" : "Analyze"}</button></form></div>
    <div className="dcfQuickRow">{["AAPL", "MSFT", "NVDA", "TSLA", "BRK.B", "JPM", "XOM", "TSM", "SHOP"].map((item) => <button key={item} onClick={() => runTicker(item)}>{item}</button>)}<span>Not financial advice. Source-backed fields show unavailable when APIs do not return data.</span></div>
    <div className="dcfGrid">
      <div className="assumptions">
        <h3>{displaySymbol} Model Inputs</h3>
        <div className="inputGrid">
          <NumberField label="Revenue ($M)" value={inputs.revenue} onChange={(v) => setInputs({ ...inputs, revenue: v })} />
          <NumberField label="Revenue Growth %" value={inputs.growth} onChange={(v) => setInputs({ ...inputs, growth: v })} />
          <NumberField label="EBIT Margin %" value={inputs.ebitMargin} onChange={(v) => setInputs({ ...inputs, ebitMargin: v })} />
          <NumberField label="Tax Rate %" value={inputs.taxRate} onChange={(v) => setInputs({ ...inputs, taxRate: v })} />
          <NumberField label="Reinvestment %" value={inputs.reinvestment} onChange={(v) => setInputs({ ...inputs, reinvestment: v })} />
          <NumberField label="WACC %" value={inputs.wacc} onChange={(v) => setInputs({ ...inputs, wacc: v })} />
          <NumberField label="Terminal Growth %" value={inputs.terminalGrowth} onChange={(v) => setInputs({ ...inputs, terminalGrowth: v })} />
          <NumberField label="Net Debt ($M)" value={inputs.netDebt} onChange={(v) => setInputs({ ...inputs, netDebt: v })} />
          <NumberField label="Shares (M)" value={inputs.shares} onChange={(v) => setInputs({ ...inputs, shares: v })} />
        </div>
        <div className="sourceBox"><b>Source status</b><span>Company: {company}</span><span>Market price: {price ? `${money(price)} from ${lookup?.source || fallback?.source || "provider"}` : "Unavailable"}</span><span>API status: {lookup?.status || fallback?.status || "waiting"}</span><span>SEC filings linked: {relatedFilings.length}</span><span>Related ticker news: {relatedNews.length}</span></div>
      </div>
      <div className="valuationOutput">
        <h3>Scenario Output</h3>
        <table><thead><tr><th>Case</th><th>EV</th><th>Equity</th><th>Value/Share</th><th>Upside</th></tr></thead><tbody>{cases.map((c) => <tr key={c.name}><td><b>{c.name}</b><small>{c.note}</small></td><td>{compact(c.enterpriseValue)}</td><td>{compact(c.equityValue)}</td><td>{money(c.valuePerShare)}</td><td className={moveClass(c.upside)}>{pct(c.upside)}</td></tr>)}</tbody></table>
        <h3>Sensitivity</h3><div className="sensitivity">{[inputs.wacc - 1, inputs.wacc, inputs.wacc + 1].map((w) => [inputs.terminalGrowth - .5, inputs.terminalGrowth, inputs.terminalGrowth + .5].map((g) => { const v = singleDcf({ ...inputs, wacc: w, terminalGrowth: g }, price, "Sens", ""); return <div key={`${w}-${g}`}><b>{money(v.valuePerShare)}</b><span>{w.toFixed(1)}% WACC / {g.toFixed(1)}% g</span></div>; }))}</div>
      </div>
      <div className="memoBox"><h3>AI Investment Memo Inputs</h3><p>The DCF accepts typed public ticker symbols. It pulls live quote/profile data when available and keeps assumptions editable instead of inventing missing financial statements.</p><ul><li>Verify revenue, margin, capex, working capital, debt, and shares from SEC filings.</li><li>Compare valuation against live price and current risk stack.</li><li>Use AI assistant to summarize source-backed risks before acting.</li></ul></div>
    </div>
  </section>;
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <label className="numberField"><span>{label}</span><input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}
function buildDcf(inputs: DcfInputs, currentPrice: number | null) {
  return [
    singleDcf({ ...inputs, growth: Math.max(0, inputs.growth - 4), ebitMargin: Math.max(1, inputs.ebitMargin - 4), wacc: inputs.wacc + 1, terminalGrowth: Math.max(0, inputs.terminalGrowth - .5) }, currentPrice, "Bear", "lower growth / margin"),
    singleDcf(inputs, currentPrice, "Base", "current assumptions"),
    singleDcf({ ...inputs, growth: inputs.growth + 4, ebitMargin: inputs.ebitMargin + 3, wacc: Math.max(1, inputs.wacc - .75), terminalGrowth: inputs.terminalGrowth + .5 }, currentPrice, "Bull", "higher growth / margin")
  ];
}
function singleDcf(inputs: DcfInputs, currentPrice: number | null, name: string, note: string) {
  const wacc = Math.max(inputs.wacc / 100, .01);
  const terminalGrowth = Math.min(inputs.terminalGrowth / 100, wacc - .005);
  let revenue = inputs.revenue;
  let pv = 0;
  let fcf = 0;
  for (let year = 1; year <= 5; year++) {
    revenue *= 1 + inputs.growth / 100;
    const ebit = revenue * (inputs.ebitMargin / 100);
    fcf = ebit * (1 - inputs.taxRate / 100) - revenue * (inputs.reinvestment / 100);
    pv += fcf / Math.pow(1 + wacc, year);
  }
  const terminalValue = (fcf * (1 + terminalGrowth)) / Math.max(.005, wacc - terminalGrowth);
  const enterpriseValue = pv + terminalValue / Math.pow(1 + wacc, 5);
  const equityValue = enterpriseValue - inputs.netDebt;
  const valuePerShare = inputs.shares > 0 ? equityValue / inputs.shares : null;
  const upside = valuePerShare !== null && currentPrice ? ((valuePerShare - currentPrice) / currentPrice) * 100 : null;
  return { name, note, enterpriseValue, equityValue, valuePerShare, upside };
}
