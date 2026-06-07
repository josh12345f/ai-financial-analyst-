"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type EventItem = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string; lat: number; lon: number; summary: string; impact: string; layer?: string; confidence?: number };
type Point = { x: number; y: number };
type Center = { lat: number; lon: number };

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 6;
const HOME_CENTER: Center = { lat: 20, lon: 0 };
const severityOptions = ["All", "INFO", "WATCH", "ALERT", "CRITICAL"] as const;
const layerLabels: Record<string, string> = {
  conflicts: "Conflicts",
  bases: "Bases",
  hotspots: "Hotspots",
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

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function wrapLon(lon: number) { return ((((lon + 180) % 360) + 360) % 360) - 180; }
function project(lat: number, lon: number, zoom: number): Point { const scale = TILE_SIZE * 2 ** zoom; const safeLat = clamp(lat, -85.05112878, 85.05112878); const sin = Math.sin((safeLat * Math.PI) / 180); return { x: ((wrapLon(lon) + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale }; }
function unproject(x: number, y: number, zoom: number): Center { const scale = TILE_SIZE * 2 ** zoom; const lon = (x / scale) * 360 - 180; const n = Math.PI - (2 * Math.PI * y) / scale; const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); return { lat: clamp(lat, -85.05112878, 85.05112878), lon: wrapLon(lon) }; }
function mod(value: number, n: number) { return ((value % n) + n) % n; }
function formatTime(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? "Unavailable" : d.toLocaleString(); }
function sevClass(severity: Severity) { return `sev-${severity.toLowerCase()}`; }
function markerLabel(event: EventItem) { const layer = normalizedLayer(event); if (layer === "weather") return "WX"; if (layer === "natural") return "NAT"; if (layer === "military") return "AIR"; if (layer === "outages") return "OUT"; if (layer === "techEvents" || layer === "cloudRegions") return "TECH"; if (event.severity === "CRITICAL") return "CRIT"; if (event.severity === "ALERT") return "ALRT"; if (event.severity === "WATCH") return "WATCH"; return "INFO"; }
function normalizedLayer(event: EventItem) { return event.layer || inferLayer(event); }
function inferLayer(event: EventItem) { const text = `${event.category} ${event.title}`.toLowerCase(); if (/earthquake|wildfire|volcano|flood|natural/.test(text)) return "natural"; if (/weather|storm|hurricane|tornado|warning|advisory/.test(text)) return "weather"; if (/outage|status|internet|cloudflare|github|openai|vercel|anthropic/.test(text)) return "outages"; if (/aircraft|flight|military|opensky/.test(text)) return "military"; if (/sanction/.test(text)) return "sanctions"; if (/conflict|war|attack|missile/.test(text)) return "conflicts"; if (/shipping|suez|hormuz|canal|waterway/.test(text)) return "waterways"; if (/cloud|datacenter|ai|semiconductor|technology|cyber/.test(text)) return "techEvents"; if (/economy|inflation|rates|fed|gdp/.test(text)) return "economic"; if (/regulation|government|sec filing/.test(text)) return "regulations"; return "hotspots"; }
function layerName(layer: string) { return layerLabels[layer] || layer.replace(/([A-Z])/g, " $1").replace(/^./, (v) => v.toUpperCase()); }
function riskScore(event: EventItem) { const base = event.severity === "CRITICAL" ? 88 : event.severity === "ALERT" ? 72 : event.severity === "WATCH" ? 54 : 28; const layer = normalizedLayer(event); const boost = layer === "conflicts" ? 10 : layer === "energy" ? 8 : layer === "outages" ? 8 : layer === "natural" ? 7 : layer === "military" ? 6 : event.category === "Government" ? 6 : 0; return Math.round(clamp(base + boost, 0, 99)); }
function buildClusters(events: EventItem[]) { const groups = new Map<string, { label: string; count: number; score: number; lat: number; lon: number }>(); for (const event of events) { const label = layerName(normalizedLayer(event)); const row = groups.get(label) || { label, count: 0, score: 0, lat: 0, lon: 0 }; row.count += 1; row.score += riskScore(event); row.lat += event.lat; row.lon += event.lon; groups.set(label, row); } return Array.from(groups.values()).map((row) => ({ ...row, score: Math.round(row.score / Math.max(1, row.count)), lat: row.lat / Math.max(1, row.count), lon: row.lon / Math.max(1, row.count) })).sort((a, b) => b.score * b.count - a.score * a.count); }

export function LiveRiskMap({ events }: { events: EventItem[] }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; center: Center } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [center, setCenter] = useState<Center>(HOME_CENTER);
  const [zoom, setZoom] = useState(3);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<(typeof severityOptions)[number]>("All");
  const [layerFilter, setLayerFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const categories = useMemo(() => ["All", ...Array.from(new Set(events.map((event) => event.category || "Unclassified"))).sort()], [events]);
  const layers = useMemo(() => ["All", ...Array.from(new Set(events.map((event) => normalizedLayer(event)))).sort((a, b) => layerName(a).localeCompare(layerName(b)))], [events]);
  const sources = useMemo(() => ["All", ...Array.from(new Set(events.map((event) => event.source))).sort()], [events]);
  const filteredEvents = useMemo(() => events.filter((event) => (severityFilter === "All" || event.severity === severityFilter) && (layerFilter === "All" || normalizedLayer(event) === layerFilter) && (categoryFilter === "All" || event.category === categoryFilter) && (sourceFilter === "All" || event.source === sourceFilter)), [categoryFilter, events, layerFilter, severityFilter, sourceFilter]);
  const hotspots = useMemo(() => [...filteredEvents].sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 16), [filteredEvents]);
  const clusters = useMemo(() => buildClusters(filteredEvents), [filteredEvents]);

  useEffect(() => { const node = viewportRef.current; if (!node) return; const update = () => setSize({ width: node.clientWidth, height: node.clientHeight }); update(); const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect(); }, []);
  useEffect(() => { const bestIndex = filteredEvents.findIndex((event) => event.severity === "CRITICAL"); setSelectedIndex(bestIndex >= 0 ? bestIndex : 0); }, [filteredEvents]);

  const viewport = useMemo(() => { const centerPx = project(center.lat, center.lon, zoom); return { centerPx, startX: centerPx.x - size.width / 2, startY: centerPx.y - size.height / 2 }; }, [center, zoom, size]);
  const tiles = useMemo(() => { if (!size.width || !size.height) return [] as Array<{ key: string; left: number; top: number; url: string }>; const count = 2 ** zoom; const minX = Math.floor(viewport.startX / TILE_SIZE) - 1; const maxX = Math.floor((viewport.startX + size.width) / TILE_SIZE) + 1; const minY = Math.floor(viewport.startY / TILE_SIZE) - 1; const maxY = Math.floor((viewport.startY + size.height) / TILE_SIZE) + 1; const out = []; for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) { if (y < 0 || y >= count) continue; out.push({ key: `${zoom}-${x}-${y}`, left: x * TILE_SIZE - viewport.startX, top: y * TILE_SIZE - viewport.startY, url: `https://tile.openstreetmap.org/${zoom}/${mod(x, count)}/${y}.png` }); } return out; }, [size, zoom, viewport.startX, viewport.startY]);
  const visibleEvents = useMemo(() => filteredEvents.slice(0, 260).map((event, index) => { const point = project(event.lat, event.lon, zoom); return { event, index, left: point.x - viewport.startX, top: point.y - viewport.startY }; }), [filteredEvents, zoom, viewport.startX, viewport.startY]);
  const selected = filteredEvents[selectedIndex] || filteredEvents[0];
  const selectedPosition = selected ? visibleEvents.find((item) => item.event === selected) : null;

  function zoomBy(delta: number) { setZoom((value) => clamp(value + delta, MIN_ZOOM, MAX_ZOOM)); }
  function goHome() { setCenter(HOME_CENTER); setZoom(3); }
  function focusSelected() { if (!selected) return; setCenter({ lat: selected.lat, lon: selected.lon }); setZoom((value) => Math.max(value, 4)); }
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) { if (event.button !== 0) return; dragRef.current = { x: event.clientX, y: event.clientY, center }; event.currentTarget.setPointerCapture(event.pointerId); }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) { const drag = dragRef.current; if (!drag) return; const origin = project(drag.center.lat, drag.center.lon, zoom); setCenter(unproject(origin.x - (event.clientX - drag.x), origin.y - (event.clientY - drag.y), zoom)); }
  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }
  function onWheel(event: React.WheelEvent<HTMLDivElement>) { event.preventDefault(); zoomBy(event.deltaY > 0 ? -1 : 1); }
  function focusEvent(event: EventItem) { const index = filteredEvents.findIndex((row) => row === event); setSelectedIndex(Math.max(0, index)); setCenter({ lat: event.lat, lon: event.lon }); setZoom((value) => Math.max(value, 4)); }

  return (
    <div className="mapCanvas realMapCanvas">
      <div className="mapToolbar"><b>GLOBAL RISK MAP</b><span>{filteredEvents.length} / {events.length} live events</span><em>OSM TILE MAP | Z{zoom} | {center.lat.toFixed(1)}, {center.lon.toFixed(1)}</em></div>
      <div className="mapFilterBar mapFilterBarExpanded" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
        <select aria-label="Severity filter" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as (typeof severityOptions)[number])}>{severityOptions.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Layer filter" value={layerFilter} onChange={(event) => setLayerFilter(event.target.value)}>{layers.map((item) => <option key={item} value={item}>{item === "All" ? "All Layers" : layerName(item)}</option>)}</select>
        <select aria-label="Category filter" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Source filter" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>{sources.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      <div ref={viewportRef} className="realMapViewport" role="application" aria-label="Interactive OpenStreetMap global risk map" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
        <div className="osmTileLayer" aria-hidden="true">{tiles.map((tile) => <img key={tile.key} className="osmTile" src={tile.url} alt="" draggable={false} style={{ left: tile.left, top: tile.top }} />)}</div>
        <div className="mapGridOverlay" aria-hidden="true" /><div className="mapCrosshair" aria-hidden="true" />
        {visibleEvents.map(({ event, index, left, top }) => { if (left < -44 || top < -44 || left > size.width + 44 || top > size.height + 44) return null; const hot = riskScore(event) >= 72; const layer = normalizedLayer(event); return <button key={`${event.source}-${index}-${event.title}`} className={`mapMarker realMarker layer-${layer} ${sevClass(event.severity)} ${hot ? "riskHot" : ""} ${selectedIndex === index ? "selected" : ""}`} style={{ left, top }} title={`${event.title}\n${event.source}\n${event.impact}`} onClick={(click) => { click.stopPropagation(); setSelectedIndex(index); }}><span className="markerPulse" /><span className="markerCore" /><span className="markerLabel">{markerLabel(event)}</span></button>; })}
        {!events.length ? <div className="emptyState mapEmpty">No mapped events returned yet. Provider status will show unavailable until live feeds respond.</div> : null}
        {events.length && !filteredEvents.length ? <div className="emptyState mapEmpty">No mapped events match the current filters.</div> : null}
      </div>
      <div className="mapHotspotStack" onPointerDown={(event) => event.stopPropagation()}><header><b>Hotspots</b><span>{hotspots.length} ranked</span></header>{hotspots.slice(0, 8).map((event) => <button key={`${event.source}-${event.title}`} onClick={() => focusEvent(event)}><span className={sevClass(event.severity)}>{event.severity}</span><b>{event.title}</b><small>{layerName(normalizedLayer(event))}</small><em>{riskScore(event)}</em></button>)}</div>
      <div className="mapClusterStack" onPointerDown={(event) => event.stopPropagation()}>{clusters.slice(0, 7).map((cluster) => <button key={cluster.label} onClick={() => { setCenter({ lat: cluster.lat, lon: cluster.lon }); setZoom(4); }}><span>{cluster.label}</span><b>{cluster.score}</b><small>{cluster.count} events</small></button>)}</div>
      <div className="osmControls" aria-label="Map controls"><button onClick={() => zoomBy(1)} aria-label="Zoom in">+</button><button onClick={() => zoomBy(-1)} aria-label="Zoom out">-</button><button onClick={goHome} aria-label="Reset map">⌂</button><button onClick={focusSelected} aria-label="Focus selected event">◎</button></div>
      <div className="mapLegend realLegend"><span className="sev-critical">Critical</span><span className="sev-alert">Alert</span><span className="sev-watch">Watch</span><span className="sev-info">Info</span></div>
      <div className="mapReadout"><span>Drag to pan</span><span>Scroll to zoom</span><span>{visibleEvents.filter((item) => item.left >= 0 && item.top >= 0 && item.left <= size.width && item.top <= size.height).length} in view</span></div>
      {selected ? <a className={`mapPopup liveEventPopup ${sevClass(selected.severity)}`} href={selected.url} target="_blank" rel="noreferrer" style={selectedPosition ? { "--pin-x": `${selectedPosition.left}px`, "--pin-y": `${selectedPosition.top}px` } as React.CSSProperties : undefined}><strong>{selected.severity} | {layerName(normalizedLayer(selected))} | Risk {riskScore(selected)}/100</strong><b>{selected.title}</b><small>{selected.source} | {selected.category} | {formatTime(selected.publishedAt)}</small><p>{selected.impact || selected.summary}</p><em>Open source report</em></a> : null}
      <div className="osmAttribution">© OpenStreetMap contributors</div>
    </div>
  );
}
