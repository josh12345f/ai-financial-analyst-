"use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type NewsItem = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string };
type Market = { symbol: string; name: string; price: number | null; changePercent: number | null; source: string; status: string };
type EventItem = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string; lat: number; lon: number; summary: string; impact: string };
type Snapshot = { generatedAt: string; status: Record<string,string>; markets: Market[]; news: NewsItem[]; events: EventItem[]; macro: Record<string,string>; filings: NewsItem[]; regulations: NewsItem[]; insights: Record<string,string>; risks: Record<string,number> };

const layers = ["Conflicts","Military activity","Sanctions","Energy","Commodities","Market stress","Natural disasters","Supply chain","Regulations","Elections","Central banks","Inflation","Real estate","Cybersecurity","Social sentiment","News hotspots"];
const tabs = ["Global Dashboard","Watchlist","Predictions","DCF Valuation","News Monitor","Government","AI Research"];
const watch = ["SPY","QQQ","AAPL","MSFT","NVDA","TSLA","BTC","ETH","GLD","USO"];
const blank: Snapshot = { generatedAt: "", status: {}, markets: [], news: [], events: [], macro: {}, filings: [], regulations: [], insights: {}, risks: {} };

function sevClass(sev: Severity){ return `sev-${sev.toLowerCase()}`; }
function pct(v: number | null){ if(v === null || Number.isNaN(v)) return "Unavailable"; return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }
function money(v: number | null){ if(v === null || Number.isNaN(v)) return "Unavailable"; return v > 1000 ? `$${v.toLocaleString(undefined,{maximumFractionDigits:0})}` : `$${v.toFixed(2)}`; }
function when(v: string){ if(!v) return "Unavailable"; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : d.toLocaleString(); }
function markerPos(lat:number, lon:number){ return { left: `${((lon + 180) / 360) * 100}%`, top: `${((90 - lat) / 180) * 100}%` }; }

export default function Home(){
  const [snapshot,setSnapshot] = useState<Snapshot>(blank);
  const [active,setActive] = useState(tabs[0]);
  const [loading,setLoading] = useState(true);
  const [question,setQuestion] = useState("What matters today?");
  const [answer,setAnswer] = useState("Ask the assistant about markets, laws, filings, real estate, geopolitical risk, or your watchlist.");

  async function refresh(){
    setLoading(true);
    const res = await fetch("/api/snapshot", { cache: "no-store" });
    setSnapshot(await res.json());
    setLoading(false);
  }
  useEffect(()=>{ refresh(); const id = setInterval(refresh, 300000); return ()=>clearInterval(id); },[]);

  async function ask(){
    setAnswer("Analyzing live ingested data...");
    const res = await fetch("/api/assistant", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ question, snapshot }) });
    const data = await res.json();
    setAnswer(data.answer || "No answer available.");
  }

  const topRisk = useMemo(()=>Object.entries(snapshot.risks).sort((a,b)=>b[1]-a[1])[0], [snapshot.risks]);
  const statusRows = Object.entries(snapshot.status);

  return <main className="app">
    <header className="topbar">
      <div className="brand">WORLD MARKET WATCHER</div>
      <input className="search" placeholder="Search markets, laws, filings, countries, commodities, watchlist" />
      <div className="status"><span className="badge live">LIVE</span><span className="badge">{loading ? "REFRESHING" : "READY"}</span><span className="badge">{snapshot.generatedAt ? when(snapshot.generatedAt) : "NO SNAPSHOT"}</span><button className="refresh" onClick={refresh}>Refresh</button></div>
    </header>
    <section className="main">
      <aside className="panel left"><h2>Layers</h2><div className="tabs">{tabs.map(t=><button key={t} className={`tab ${active===t?"active":""}`} onClick={()=>setActive(t)}>{t}</button>)}</div><div className="layers">{layers.map(l=><label className="layer" key={l}><input type="checkbox" defaultChecked />{l}</label>)}</div><h2>Provider Status</h2><div className="content">{statusRows.length ? statusRows.map(([k,v])=><div className="metric" key={k}><span>{k}</span><span className={v==="ok"?"green":v==="missing_key"?"yellow":"red"}>{v}</span></div>) : <div className="muted">Loading provider status...</div>}</div></aside>
      <section className="panel map"><h2>Global Situation Map</h2><div className="mapgrid">{snapshot.events.length ? snapshot.events.slice(0,60).map((e,i)=><a key={`${e.source}-${i}-${e.title}`} href={e.url} target="_blank" className={`marker ${sevClass(e.severity)}`} style={markerPos(e.lat,e.lon)} title={`${e.title}\n${e.source}\n${e.impact}`}></a>) : <div className="content muted">No live events available from configured providers. Add GDELT, NewsAPI, Congress, Federal Register, and SEC settings in Vercel.</div>}</div></section>
      <aside className="panel right"><h2>AI Insights</h2><div className="content feed">{Object.entries(snapshot.insights).map(([k,v])=><div className="item" key={k}><div className="headline">{k}</div><div className="meta">{v}</div></div>)}<div className="item"><div className="headline">Top Risk: {topRisk?.[0] || "Unavailable"}</div><div className="riskbar"><i style={{width:`${topRisk?.[1] || 0}%`}} /></div><div className="meta">Scores are source-backed heuristics, not financial advice.</div></div><h2>AI Assistant</h2><div className="assistant"><div className="chat">{answer}</div><div className="ask"><input value={question} onChange={e=>setQuestion(e.target.value)} /><button onClick={ask}>Ask</button></div></div></div></aside>
      <section className="bottom">
        <div className="panel"><h2>Live News Feed</h2><div className="content feed">{snapshot.news.length ? snapshot.news.map((n,i)=><article className="item" key={`${n.source}-${i}-${n.title}`}><a className="headline" href={n.url} target="_blank">{n.title}</a><div className="meta">{n.source} | {n.category} | {n.severity} | {when(n.publishedAt)}</div></article>) : <div className="muted">Live news unavailable until provider keys are set or APIs respond.</div>}</div></div>
        <div className="panel"><h2>Market Watchlist</h2><div className="content">{(snapshot.markets.length?snapshot.markets:watch.map(symbol=>({symbol,name:symbol,price:null,changePercent:null,source:"Unavailable",status:"missing"}))).map(m=><div className="metric" key={m.symbol}><span><b>{m.symbol}</b><br/><span className="muted small">{m.name} | {m.source}</span></span><span className={(m.changePercent||0)>=0?"green":"red"}>{money(m.price)}<br/>{pct(m.changePercent)}</span></div>)}</div></div>
        <div className="panel"><h2>{active}</h2><div className="content">{active.includes("DCF") ? <Dcf markets={snapshot.markets}/> : active.includes("Prediction") ? <Predictions risks={snapshot.risks} news={snapshot.news}/> : active.includes("Government") ? <Feed title="Regulations" items={[...snapshot.regulations,...snapshot.filings]}/> : active.includes("Watchlist") ? <Watchlist markets={snapshot.markets} news={snapshot.news}/> : <Macro snapshot={snapshot}/>}</div></div>
      </section>
    </section>
  </main>;
}

function Feed({items}:{title:string;items:NewsItem[]}){ return <div className="feed">{items.length?items.map((n,i)=><div className="item" key={`${n.source}-${i}-${n.title}`}><a className="headline" href={n.url} target="_blank">{n.title}</a><div className="meta">{n.source} | {n.category} | {n.severity}</div></div>):<div className="muted">Data unavailable.</div>}</div>; }
function Macro({snapshot}:{snapshot:Snapshot}){ return <div className="grid2"><div className="tile"><b>Economic Indicators</b>{Object.entries(snapshot.macro).map(([k,v])=><div className="metric" key={k}><span>{k}</span><span>{v}</span></div>)}</div><div className="tile"><b>Source Coverage</b><div className="meta source">Sources used: {Object.keys(snapshot.status).filter(k=>snapshot.status[k]==="ok").join(", ") || "No live providers returned data yet."}</div></div></div>; }
function Watchlist({markets,news}:{markets:Market[];news:NewsItem[]}){ return <div className="feed"><div className="item"><b>How global events affect my watchlist</b><div className="meta">The app links watchlist exposure to live news categories and provider status. Add more ticker-specific keys for deeper coverage.</div></div>{markets.map(m=><div className="item" key={m.symbol}><div className="headline">{m.symbol}: {pct(m.changePercent)} daily move</div><div className="meta">Related live headlines available: {news.filter(n=>n.title.toUpperCase().includes(m.symbol)).length}</div></div>)}</div>; }
function Predictions({risks,news}:{risks:Record<string,number>;news:NewsItem[]}){ const r=Object.entries(risks).sort((a,b)=>b[1]-a[1]); return <div className="feed"><div className="item"><b>Probabilistic intelligence, not financial advice.</b><div className="meta">Generated from live provider coverage and severity counts.</div></div>{r.map(([k,v])=><div className="item" key={k}><div className="headline">{k}: {v >= 70 ? "Elevated" : v >= 45 ? "Watch" : "Normal"}</div><div className="meta">Probability band: {v}% | Evidence headlines: {news.filter(n=>n.category.toLowerCase().includes(k.toLowerCase().split(" ")[0])).length}</div></div>)}</div>; }
function Dcf({markets}:{markets:Market[]}){ const first=markets.find(m=>m.price); const price=first?.price || null; return <div className="feed"><div className="item"><b>DCF Valuation Workbench</b><div className="meta">Select a ticker in the full local app for detailed SEC-backed assumptions. This deployed panel shows live-price availability and model readiness.</div></div><div className="metric"><span>Current ticker</span><span>{first?.symbol || "Unavailable"}</span></div><div className="metric"><span>Market price</span><span>{money(price)}</span></div><div className="metric"><span>Base case</span><span>{price?money(price*1.05):"Unavailable"}</span></div><div className="metric"><span>Downside case</span><span>{price?money(price*.75):"Unavailable"}</span></div><div className="metric"><span>Growth case</span><span>{price?money(price*1.35):"Unavailable"}</span></div></div>; }
