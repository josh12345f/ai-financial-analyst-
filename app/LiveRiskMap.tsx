"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Severity = "INFO" | "WATCH" | "ALERT" | "CRITICAL";
type EventItem = {
  title: string;
  source: string;
  url: string;
  category: string;
  severity: Severity;
  publishedAt: string;
  lat: number;
  lon: number;
  summary: string;
  impact: string;
};
type Point = { x: number; y: number };
type Center = { lat: number; lon: number };

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 6;
const HOME_CENTER: Center = { lat: 22, lon: 12 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function wrapLon(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
function project(lat: number, lon: number, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom;
  const safeLat = clamp(lat, -85.05112878, 85.05112878);
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((wrapLon(lon) + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  };
}
function unproject(x: number, y: number, zoom: number): Center {
  const scale = TILE_SIZE * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat: clamp(lat, -85.05112878, 85.05112878), lon: wrapLon(lon) };
}
function mod(value: number, n: number) {
  return ((value % n) + n) % n;
}
function formatTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Unavailable" : d.toLocaleString();
}
function sevClass(severity: Severity) {
  return `sev-${severity.toLowerCase()}`;
}
function markerLabel(severity: Severity) {
  if (severity === "CRITICAL") return "CRIT";
  if (severity === "ALERT") return "ALRT";
  if (severity === "WATCH") return "WATCH";
  return "INFO";
}

export function LiveRiskMap({ events }: { events: EventItem[] }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; center: Center } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [center, setCenter] = useState<Center>(HOME_CENTER);
  const [zoom, setZoom] = useState(3);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const bestIndex = events.findIndex((event) => event.severity === "CRITICAL");
    setSelectedIndex(bestIndex >= 0 ? bestIndex : 0);
  }, [events]);

  const viewport = useMemo(() => {
    const centerPx = project(center.lat, center.lon, zoom);
    return {
      centerPx,
      startX: centerPx.x - size.width / 2,
      startY: centerPx.y - size.height / 2
    };
  }, [center, zoom, size]);

  const tiles = useMemo(() => {
    if (!size.width || !size.height) return [] as Array<{ key: string; x: number; y: number; left: number; top: number; url: string }>;
    const count = 2 ** zoom;
    const minX = Math.floor(viewport.startX / TILE_SIZE) - 1;
    const maxX = Math.floor((viewport.startX + size.width) / TILE_SIZE) + 1;
    const minY = Math.floor(viewport.startY / TILE_SIZE) - 1;
    const maxY = Math.floor((viewport.startY + size.height) / TILE_SIZE) + 1;
    const out = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        if (y < 0 || y >= count) continue;
        const wrappedX = mod(x, count);
        out.push({
          key: `${zoom}-${x}-${y}`,
          x,
          y,
          left: x * TILE_SIZE - viewport.startX,
          top: y * TILE_SIZE - viewport.startY,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`
        });
      }
    }
    return out;
  }, [size, zoom, viewport.startX, viewport.startY]);

  const visibleEvents = useMemo(() => {
    return events.slice(0, 120).map((event, index) => {
      const point = project(event.lat, event.lon, zoom);
      return {
        event,
        index,
        left: point.x - viewport.startX,
        top: point.y - viewport.startY
      };
    });
  }, [events, zoom, viewport.startX, viewport.startY]);

  const selected = events[selectedIndex] || events[0];
  const selectedPosition = selected ? visibleEvents.find((item) => item.event === selected) : null;

  function zoomBy(delta: number) {
    setZoom((value) => clamp(value + delta, MIN_ZOOM, MAX_ZOOM));
  }
  function goHome() {
    setCenter(HOME_CENTER);
    setZoom(3);
  }
  function focusSelected() {
    if (!selected) return;
    setCenter({ lat: selected.lat, lon: selected.lon });
    setZoom((value) => Math.max(value, 4));
  }
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, center };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const origin = project(drag.center.lat, drag.center.lon, zoom);
    const next = unproject(origin.x - (event.clientX - drag.x), origin.y - (event.clientY - drag.y), zoom);
    setCenter(next);
  }
  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -1 : 1);
  }

  return (
    <div className="mapCanvas realMapCanvas">
      <div className="mapToolbar">
        <b>GLOBAL RISK MAP</b>
        <span>{events.length} live events</span>
        <em>OSM TILE MAP | Z{zoom} | {center.lat.toFixed(1)}, {center.lon.toFixed(1)}</em>
      </div>

      <div
        ref={viewportRef}
        className="realMapViewport"
        role="application"
        aria-label="Interactive OpenStreetMap global risk map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div className="osmTileLayer" aria-hidden="true">
          {tiles.map((tile) => (
            <img
              key={tile.key}
              className="osmTile"
              src={tile.url}
              alt=""
              draggable={false}
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
        </div>
        <div className="mapGridOverlay" aria-hidden="true" />
        <div className="mapCrosshair" aria-hidden="true" />

        {visibleEvents.map(({ event, index, left, top }) => {
          const outside = left < -40 || top < -40 || left > size.width + 40 || top > size.height + 40;
          if (outside) return null;
          return (
            <button
              key={`${event.source}-${index}-${event.title}`}
              className={`mapMarker realMarker ${sevClass(event.severity)} ${selectedIndex === index ? "selected" : ""}`}
              style={{ left, top }}
              title={`${event.title}\n${event.source}\n${event.impact}`}
              onClick={(click) => {
                click.stopPropagation();
                setSelectedIndex(index);
              }}
            >
              <span className="markerPulse" />
              <span className="markerCore" />
              <span className="markerLabel">{markerLabel(event.severity)}</span>
            </button>
          );
        })}

        {!events.length ? (
          <div className="emptyState mapEmpty">No mapped events returned yet. Provider status will show unavailable until live feeds respond.</div>
        ) : null}
      </div>

      <div className="osmControls" aria-label="Map controls">
        <button onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomBy(-1)} aria-label="Zoom out">-</button>
        <button onClick={goHome} aria-label="Reset map">⌂</button>
        <button onClick={focusSelected} aria-label="Focus selected event">◎</button>
      </div>

      <div className="mapLegend realLegend">
        <span className="sev-critical">Critical</span>
        <span className="sev-alert">Alert</span>
        <span className="sev-watch">Watch</span>
        <span className="sev-info">Info</span>
      </div>

      <div className="mapReadout">
        <span>Drag to pan</span>
        <span>Scroll to zoom</span>
        <span>{visibleEvents.filter((item) => item.left >= 0 && item.top >= 0 && item.left <= size.width && item.top <= size.height).length} in view</span>
      </div>

      {selected ? (
        <a
          className={`mapPopup liveEventPopup ${sevClass(selected.severity)}`}
          href={selected.url}
          target="_blank"
          rel="noreferrer"
          style={selectedPosition ? { "--pin-x": `${selectedPosition.left}px`, "--pin-y": `${selectedPosition.top}px` } as React.CSSProperties : undefined}
        >
          <strong>{selected.severity} | {selected.category}</strong>
          <b>{selected.title}</b>
          <small>{selected.source} | {formatTime(selected.publishedAt)}</small>
          <p>{selected.impact || selected.summary}</p>
          <em>Open source report</em>
        </a>
      ) : null}

      <div className="osmAttribution">© OpenStreetMap contributors</div>
    </div>
  );
}
