"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type EventItem = { title: string; source: string; url: string; category: string; severity: Severity; publishedAt: string; lat: number; lon: number; summary: string; impact: string; layer?: string; confidence?: number };
type Point = { x: number; y: number };
type Center = { lat: number; lon: number };
type Position = [number, number];
type Polygon = Position[][];
type MultiPolygon = Position[][][];
type CountryGeometry = { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: MultiPolygon };
type CountryFeature = { type: "Feature"; properties: Record<string, unknown>; geometry: CountryGeometry | null };
type CountryCollection = { type: "FeatureCollection"; features: CountryFeature[] };
type Selection = { type: "event"; key: string } | { type: "country"; name: string } | null;
type CountrySummary = {
  name: string;
  centroid: Center | null;
  events: EventItem[];
  score: number | null;
  severity: Severity;
  sources: string[];
  categories: Array<{ label: string; count: number }>;
  affectedAssets: string[];
  conflictCount: number;
  resourceCount: number;
  regulationCount: number;
  infrastructureCount: number;
  confidence: number | null;
  impact: string;
};

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 6;
const HOME_CENTER: Center = { lat: 20, lon: 0 };
const severityOptions = ["All", "INFO", "WATCH", "ALERT", "CRITICAL"] as const;
const countryGeoJsonUrls = [
  "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json",
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
];
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
function eventKey(event: EventItem) { return `${event.source}|${event.publishedAt}|${event.title}|${event.lat.toFixed(2)}|${event.lon.toFixed(2)}`; }
function affectedAssets(event: EventItem) { const text = `${event.category} ${event.layer || ""} ${event.title} ${event.impact}`.toLowerCase(); if (/energy|oil|gas|hormuz|opec/.test(text)) return ["USO", "XLE", "XOM", "CVX", "UNG"]; if (/chip|semiconductor|taiwan|technology|ai|cloud/.test(text)) return ["QQQ", "SMH", "NVDA", "TSM", "MSFT"]; if (/rate|fed|inflation|mortgage|housing|real estate/.test(text)) return ["TLT", "IYR", "XLRE", "XHB", "KRE"]; if (/conflict|war|missile|sanction|military/.test(text)) return ["GLD", "USO", "ITA", "TLT", "SPY"]; if (/shipping|waterway|suez|panama|supply/.test(text)) return ["IYT", "XLI", "USO", "DBA"]; return ["SPY", "QQQ"]; }

function buildClusters(events: EventItem[]) { const groups = new Map<string, { label: string; count: number; score: number; lat: number; lon: number }>(); for (const event of events) { const label = layerName(normalizedLayer(event)); const row = groups.get(label) || { label, count: 0, score: 0, lat: 0, lon: 0 }; row.count += 1; row.score += riskScore(event); row.lat += event.lat; row.lon += event.lon; groups.set(label, row); } return Array.from(groups.values()).map((row) => ({ ...row, score: Math.round(row.score / Math.max(1, row.count)), lat: row.lat / Math.max(1, row.count), lon: row.lon / Math.max(1, row.count) })).sort((a, b) => b.score * b.count - a.score * a.count); }

export function LiveRiskMap({ events }: { events: EventItem[] }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; center: Center } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [center, setCenter] = useState<Center>(HOME_CENTER);
  const [zoom, setZoom] = useState(3);
  const [selection, setSelection] = useState<Selection>(null);
  const [severityFilter, setSeverityFilter] = useState<(typeof severityOptions)[number]>("All");
  const [layerFilter, setLayerFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [countryFeatures, setCountryFeatures] = useState<CountryFeature[]>([]);
  const [countryLayerStatus, setCountryLayerStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  const categories = useMemo(() => ["All", ...Array.from(new Set(events.map((event) => event.category || "Unclassified"))).sort()], [events]);
  const layers = useMemo(() => ["All", ...Array.from(new Set(events.map((event) => normalizedLayer(event)))).sort((a, b) => layerName(a).localeCompare(layerName(b)))], [events]);
  const sources = useMemo(() => ["All", ...Array.from(new Set(events.map((event) => event.source))).sort()], [events]);
  const filteredEvents = useMemo(() => events.filter((event) => (severityFilter === "All" || event.severity === severityFilter) && (layerFilter === "All" || normalizedLayer(event) === layerFilter) && (categoryFilter === "All" || event.category === categoryFilter) && (sourceFilter === "All" || event.source === sourceFilter)), [categoryFilter, events, layerFilter, severityFilter, sourceFilter]);
  const eventCountries = useMemo(() => buildEventCountryMap(filteredEvents, countryFeatures), [countryFeatures, filteredEvents]);
  const countrySummaries = useMemo(() => buildCountrySummaries(countryFeatures, filteredEvents, eventCountries), [countryFeatures, eventCountries, filteredEvents]);
  const countryList = useMemo(() => Array.from(countrySummaries.values()), [countrySummaries]);
  const hotspots = useMemo(() => [...filteredEvents].sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 16), [filteredEvents]);
  const clusters = useMemo(() => buildClusters(filteredEvents), [filteredEvents]);
  const countryClusters = useMemo(() => countryList.filter((country) => country.events.length).sort((a, b) => (b.score || 0) * b.events.length - (a.score || 0) * a.events.length), [countryList]);

  useEffect(() => { const node = viewportRef.current; if (!node) return; const update = () => setSize({ width: node.clientWidth, height: node.clientHeight }); update(); const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect(); }, []);
  useEffect(() => { let active = true; const controller = new AbortController(); async function loadCountries() { setCountryLayerStatus("loading"); for (const url of countryGeoJsonUrls) { try { const response = await fetch(url, { cache: "force-cache", signal: controller.signal }); if (!response.ok) continue; const data = await response.json() as CountryCollection; if (active && Array.isArray(data.features) && data.features.length) { setCountryFeatures(data.features.filter((feature) => Boolean(feature.geometry))); setCountryLayerStatus("ready"); return; } } catch { if (controller.signal.aborted) return; } } if (active) setCountryLayerStatus("unavailable"); } void loadCountries(); return () => { active = false; controller.abort(); }; }, []);
  useEffect(() => { const preferred = filteredEvents.find((event) => event.severity === "CRITICAL") || filteredEvents[0]; setSelection(preferred ? { type: "event", key: eventKey(preferred) } : null); }, [filteredEvents]);

  const viewport = useMemo(() => { const centerPx = project(center.lat, center.lon, zoom); return { centerPx, startX: centerPx.x - size.width / 2, startY: centerPx.y - size.height / 2 }; }, [center, zoom, size]);
  const tiles = useMemo(() => { if (!size.width || !size.height) return [] as Array<{ key: string; left: number; top: number; url: string }>; const count = 2 ** zoom; const minX = Math.floor(viewport.startX / TILE_SIZE) - 1; const maxX = Math.floor((viewport.startX + size.width) / TILE_SIZE) + 1; const minY = Math.floor(viewport.startY / TILE_SIZE) - 1; const maxY = Math.floor((viewport.startY + size.height) / TILE_SIZE) + 1; const out = []; for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) { if (y < 0 || y >= count) continue; out.push({ key: `${zoom}-${x}-${y}`, left: x * TILE_SIZE - viewport.startX, top: y * TILE_SIZE - viewport.startY, url: `https://tile.openstreetmap.org/${zoom}/${mod(x, count)}/${y}.png` }); } return out; }, [size, zoom, viewport.startX, viewport.startY]);
  const countryShapes = useMemo(() => { if (!size.width || !size.height || !countryFeatures.length) return []; return countryFeatures.map((feature, index) => { const name = countryName(feature); const d = feature.geometry ? geometryToPath(feature.geometry, zoom, viewport) : ""; if (!name || !d) return null; const summary = countrySummaries.get(name); return { key: `${name}-${index}`, name, d, className: `countryShape ${countryRiskClass(summary)} ${selection?.type === "country" && selection.name === name ? "selected" : ""}` }; }).filter((shape): shape is { key: string; name: string; d: string; className: string } => Boolean(shape)); }, [countryFeatures, countrySummaries, selection, size, viewport, zoom]);
  const visibleEvents = useMemo(() => filteredEvents.slice(0, 260).map((event) => { const point = project(event.lat, event.lon, zoom); return { event, key: eventKey(event), country: eventCountries.get(eventKey(event)) || "Unknown", left: point.x - viewport.startX, top: point.y - viewport.startY }; }), [eventCountries, filteredEvents, zoom, viewport.startX, viewport.startY]);
  const selectedEvent = selection?.type === "event" ? filteredEvents.find((event) => eventKey(event) === selection.key) || null : null;
  const selectedCountryName = selection?.type === "country" ? selection.name : selectedEvent ? eventCountries.get(eventKey(selectedEvent)) || null : null;
  const selectedCountry = selectedCountryName ? countrySummaries.get(selectedCountryName) || null : null;

  function zoomBy(delta: number) { setZoom((value) => clamp(value + delta, MIN_ZOOM, MAX_ZOOM)); }
  function goHome() { setCenter(HOME_CENTER); setZoom(3); }
  function focusSelected() { if (selectedEvent) { setCenter({ lat: selectedEvent.lat, lon: selectedEvent.lon }); setZoom((value) => Math.max(value, 4)); return; } if (selectedCountry?.centroid) { setCenter(selectedCountry.centroid); setZoom((value) => Math.max(value, 4)); } }
  function selectCountry(name: string) { const summary = countrySummaries.get(name); setSelection({ type: "country", name }); if (summary?.centroid) setCenter(summary.centroid); }
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) { if (event.button !== 0) return; dragRef.current = { x: event.clientX, y: event.clientY, center }; event.currentTarget.setPointerCapture(event.pointerId); }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) { const drag = dragRef.current; if (!drag) return; const origin = project(drag.center.lat, drag.center.lon, zoom); setCenter(unproject(origin.x - (event.clientX - drag.x), origin.y - (event.clientY - drag.y), zoom)); }
  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }
  function onWheel(event: React.WheelEvent<HTMLDivElement>) { event.preventDefault(); zoomBy(event.deltaY > 0 ? -1 : 1); }
  function onCountryClick(event: ReactMouseEvent<SVGPathElement>, name: string) { event.stopPropagation(); selectCountry(name); }
  function focusEvent(event: EventItem) { setSelection({ type: "event", key: eventKey(event) }); setCenter({ lat: event.lat, lon: event.lon }); setZoom((value) => Math.max(value, 4)); }

  return (
    <div className="mapCanvas realMapCanvas countryMapCanvas">
      <div ref={viewportRef} className="realMapViewport countryMapViewport" role="application" aria-label="Interactive OpenStreetMap global risk map" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
        <div className="mapToolbar countryMapToolbar"><b>GLOBAL RISK MAP</b><span>{filteredEvents.length} / {events.length} live events</span><em>{countryLayerStatus === "ready" ? `${countryFeatures.length} countries clickable` : `country layer ${countryLayerStatus}`}</em><em>OSM | Z{zoom} | {center.lat.toFixed(1)}, {center.lon.toFixed(1)}</em></div>
        <div className="mapFilterBar mapFilterBarExpanded countryMapFilters" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
          <select aria-label="Severity filter" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as (typeof severityOptions)[number])}>{severityOptions.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Layer filter" value={layerFilter} onChange={(event) => setLayerFilter(event.target.value)}>{layers.map((item) => <option key={item} value={item}>{item === "All" ? "All Layers" : layerName(item)}</option>)}</select>
          <select aria-label="Category filter" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Source filter" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>{sources.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <div className="osmTileLayer" aria-hidden="true">{tiles.map((tile) => <img key={tile.key} className="osmTile" src={tile.url} alt="" draggable={false} style={{ left: tile.left, top: tile.top }} />)}</div>
        <div className="mapGridOverlay" aria-hidden="true" />
        {countryShapes.length ? <svg className="countryLayer" viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`} aria-label="Clickable country risk layer">{countryShapes.map((shape) => <path key={shape.key} d={shape.d} className={shape.className} role="button" tabIndex={0} aria-label={`Inspect ${shape.name}`} onClick={(event) => onCountryClick(event, shape.name)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectCountry(shape.name); } }} />)}</svg> : null}
        <div className="countryMapVignette" aria-hidden="true" />
        {visibleEvents.map(({ event, key, country, left, top }) => { if (left < -44 || top < -44 || left > size.width + 44 || top > size.height + 44) return null; const hot = riskScore(event) >= 72; const layer = normalizedLayer(event); return <button key={key} className={`mapMarker realMarker layer-${layer} ${sevClass(event.severity)} ${hot ? "riskHot" : ""} ${selectedEvent && eventKey(selectedEvent) === key ? "selected" : ""}`} style={{ left, top }} title={`${event.title}\n${country}\n${event.source}`} onClick={(click) => { click.stopPropagation(); setSelection({ type: "event", key }); }}><span className="markerPulse" /><span className="markerCore" /><span className="markerLabel">{markerLabel(event)}</span></button>; })}
        {!events.length ? <div className="emptyState mapEmpty">No mapped events returned yet. Provider status will show unavailable until live feeds respond.</div> : null}
        {events.length && !filteredEvents.length ? <div className="emptyState mapEmpty">No mapped events match the current filters.</div> : null}
        <div className="osmControls" aria-label="Map controls"><button onClick={() => zoomBy(1)} aria-label="Zoom in">+</button><button onClick={() => zoomBy(-1)} aria-label="Zoom out">-</button><button onClick={goHome} aria-label="Reset map">HOME</button><button onClick={focusSelected} aria-label="Focus selected item">FOCUS</button></div>
        <div className="mapLegend realLegend countryLegend"><span className="sev-critical">Critical</span><span className="sev-alert">Alert</span><span className="sev-watch">Watch</span><span className="sev-info">Info</span></div>
        <div className="mapReadout"><span>Drag to pan</span><span>Scroll to zoom</span><span>{visibleEvents.filter((item) => item.left >= 0 && item.top >= 0 && item.left <= size.width && item.top <= size.height).length} in view</span></div>
        <div className="osmAttribution">OpenStreetMap contributors | country boundaries from public GeoJSON</div>
      </div>
      <section className="countryMapDock" aria-label="Selected country and event intelligence">
        <CountryInspector country={selectedCountry} countryName={selectedCountryName} event={selectedEvent} />
        <div className="mapHotspotStack dockHotspots"><header><b>Hotspots</b><span>{hotspots.length} ranked</span></header>{hotspots.slice(0, 6).map((event) => <button key={eventKey(event)} onClick={() => focusEvent(event)}><span className={sevClass(event.severity)}>{event.severity}</span><b>{event.title}</b><small>{layerName(normalizedLayer(event))}</small><em>{riskScore(event)}</em></button>)}</div>
        <div className="mapClusterStack dockCountries"><header><b>Country Risk</b><span>{countryClusters.length} active</span></header>{countryClusters.slice(0, 6).map((country) => <button key={country.name} onClick={() => { setSelection({ type: "country", name: country.name }); if (country.centroid) { setCenter(country.centroid); setZoom(4); } }}><span>{country.name}</span><b>{country.score ?? "N/A"}</b><small>{country.events.length} events | {country.sources.slice(0, 2).join(", ") || "source unavailable"}</small></button>)}{!countryClusters.length ? <p className="emptyState">No active country clusters from live events.</p> : null}</div>
      </section>
    </div>
  );
}

function CountryInspector({ country, countryName, event }: { country: CountrySummary | null; countryName: string | null; event: EventItem | null }) {
  if (!countryName) return <aside className="countryInspector"><p className="emptyState">Click a country or live marker to inspect source-backed country risk.</p></aside>;
  const lead = event || country?.events[0] || null;
  return <aside className="countryInspector"><header><div><small>{event ? "Marker + country summary" : "Country summary"}</small><b>{countryName}</b></div><SeverityBadge severity={lead?.severity || country?.severity || "INFO"} /></header>{lead ? <section className="selectedCountryEvent"><div><span>{lead.category}</span><small>{formatTime(lead.publishedAt)}</small></div><b>{lead.title}</b><p>{lead.summary || lead.impact}</p><a href={lead.url} target="_blank" rel="noreferrer">Open source report</a></section> : <p className="emptyState">No live source-backed events returned for this country in the current filters.</p>}<section className="countrySignalGrid"><Metric label="Risk" value={country?.score == null ? "Unavailable" : `${country.score}/100`} /><Metric label="Conflict" value={country?.conflictCount ?? "Unavailable"} /><Metric label="Resources" value={country?.resourceCount ?? "Unavailable"} /><Metric label="Regulation" value={country?.regulationCount ?? "Unavailable"} /><Metric label="Infra" value={country?.infrastructureCount ?? "Unavailable"} /><Metric label="Sources" value={country?.sources.length ?? "Unavailable"} /></section><section className="countryImpact"><b>Market impact</b><p>{country?.impact || "Unavailable until live country events return market-impact metadata."}</p><span>{country?.affectedAssets.length ? country.affectedAssets.join(", ") : "Affected assets unavailable"}</span></section><section className="countryEventList"><b>Latest country events</b>{country?.events.length ? country.events.slice(0, 4).map((item) => <a href={item.url} target="_blank" rel="noreferrer" key={eventKey(item)}><SeverityBadge severity={item.severity} /><span>{item.title}</span><small>{item.source} | {formatTime(item.publishedAt)}</small></a>) : <p className="emptyState">No country-level events returned by the active filters.</p>}</section></aside>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <article><span>{label}</span><b>{value}</b></article>; }
function SeverityBadge({ severity }: { severity: Severity }) { return <span className={`severityBadge ${sevClass(severity)}`}>{severity}</span>; }

function buildEventCountryMap(events: EventItem[], features: CountryFeature[]) { const out = new Map<string, string>(); for (const event of events) { const match = resolveEventCountry(event, features); if (match) out.set(eventKey(event), match); } return out; }
function buildCountrySummaries(features: CountryFeature[], events: EventItem[], eventCountries: Map<string, string>) { const summaries = new Map<string, CountrySummary>(); for (const feature of features) { const name = countryName(feature); if (!name || summaries.has(name)) continue; summaries.set(name, emptyCountrySummary(name, featureCentroid(feature))); } for (const event of events) { const name = eventCountries.get(eventKey(event)) || "Unknown"; const current = summaries.get(name) || emptyCountrySummary(name, { lat: event.lat, lon: event.lon }); current.events.push(event); if (!current.centroid) current.centroid = { lat: event.lat, lon: event.lon }; summaries.set(name, current); } for (const summary of summaries.values()) enrichCountrySummary(summary); return summaries; }
function emptyCountrySummary(name: string, centroid: Center | null): CountrySummary { return { name, centroid, events: [], score: null, severity: "INFO", sources: [], categories: [], affectedAssets: [], conflictCount: 0, resourceCount: 0, regulationCount: 0, infrastructureCount: 0, confidence: null, impact: "No live source-backed risk events returned for this country in the current filters." }; }
function enrichCountrySummary(summary: CountrySummary) { if (!summary.events.length) return; summary.events = [...summary.events].sort((a, b) => riskScore(b) - riskScore(a)); const categories = new Map<string, number>(); const sources = new Set<string>(); const assets = new Set<string>(); let confidenceTotal = 0; let confidenceCount = 0; for (const event of summary.events) { categories.set(event.category || "Unclassified", (categories.get(event.category || "Unclassified") || 0) + 1); sources.add(event.source); affectedAssets(event).forEach((asset) => assets.add(asset)); if (event.confidence != null) { confidenceTotal += event.confidence; confidenceCount += 1; } } summary.score = Math.round(summary.events.reduce((sum, event) => sum + riskScore(event), 0) / summary.events.length); summary.severity = summary.events[0]?.severity || "INFO"; summary.categories = Array.from(categories.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count); summary.sources = Array.from(sources).sort(); summary.affectedAssets = Array.from(assets).sort(); summary.conflictCount = summary.events.filter((event) => /conflict|war|missile|attack|sanction/i.test(`${event.category} ${event.layer || ""} ${event.title}`)).length; summary.resourceCount = summary.events.filter((event) => /energy|oil|gas|commodity|mining|resource|waterway|shipping/i.test(`${event.category} ${event.layer || ""} ${event.title} ${event.impact}`)).length; summary.regulationCount = summary.events.filter((event) => /regulation|government|law|sec|congress|federal/i.test(`${event.category} ${event.layer || ""} ${event.title}`)).length; summary.infrastructureCount = summary.events.filter((event) => /outage|cloud|infrastructure|weather|natural|airspace|military|cyber/i.test(`${event.category} ${event.layer || ""} ${event.title}`)).length; summary.confidence = confidenceCount ? Math.round(confidenceTotal / confidenceCount) : null; summary.impact = summary.events.find((event) => event.impact)?.impact || "Live events are present, but market-impact metadata is unavailable from sources."; }
function countryRiskClass(summary: CountrySummary | undefined) { if (!summary || summary.score == null) return "countryRiskEmpty"; if (summary.score >= 82) return "countryRiskCritical"; if (summary.score >= 66) return "countryRiskAlert"; if (summary.score >= 46) return "countryRiskWatch"; return "countryRiskInfo"; }
function resolveEventCountry(event: EventItem, features: CountryFeature[]) { if (!features.length) return null; for (const feature of features) if (feature.geometry && pointInGeometry(event.lon, event.lat, feature.geometry)) return countryName(feature); return null; }
function geometryToPath(geometry: CountryGeometry, zoom: number, viewport: { startX: number; startY: number }) { const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates; const commands: string[] = []; for (const polygon of polygons) for (const ring of polygon) { if (ring.length < 3) continue; const projected = ring.map(([lon, lat]) => { const point = project(lat, lon, zoom); return { x: point.x - viewport.startX, y: point.y - viewport.startY }; }); commands.push(`M${projected.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join("L")}Z`); } return commands.join(""); }
function pointInGeometry(lon: number, lat: number, geometry: CountryGeometry) { const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates; return polygons.some((polygon) => polygon.length > 0 && pointInRing(lon, lat, polygon[0])); }
function pointInRing(lon: number, lat: number, ring: Position[]) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) { const [xi, yi] = ring[i]; const [xj, yj] = ring[j]; const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi; if (crosses) inside = !inside; } return inside; }
function featureCentroid(feature: CountryFeature): Center | null { if (!feature.geometry) return null; const positions: Position[] = []; const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates; for (const polygon of polygons) for (const point of polygon[0] || []) positions.push(point); if (!positions.length) return null; const lon = positions.reduce((total, [value]) => total + value, 0) / positions.length; const lat = positions.reduce((total, [, value]) => total + value, 0) / positions.length; return { lat: clamp(lat, -85, 85), lon: wrapLon(lon) }; }
function countryName(feature: CountryFeature) { return propertyText(feature.properties, ["name", "NAME", "ADMIN", "NAME_EN", "sovereignt", "SOVEREIGNT"]) || "Unknown"; }
function propertyText(properties: Record<string, unknown>, keys: string[]) { for (const key of keys) { const value = properties[key]; if (typeof value === "string" && value && value !== "-99") return value; } return ""; }
