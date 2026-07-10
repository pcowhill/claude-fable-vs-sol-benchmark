import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import type { ScenarioDef, SimSnapshot } from '../../sim/types';
import { allAssetPx, VIEW_H, VIEW_W, type DisplayContext } from './projection';
import { SceneLayer } from './SceneLayer';
import { LinkLayer } from './LinkLayer';
import { FrameChrome, MapStatus, RingsLayer } from './ChromeLayer';

interface ViewTransform {
  k: number;
  x: number;
  y: number;
}

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 3.4;

export function MapView({
  scenario,
  snapshot,
}: {
  scenario: ScenarioDef;
  snapshot: SimSnapshot;
}) {
  const select = useStore((s) => s.select);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewTransform>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
    moved: boolean;
    captured: boolean;
  } | null>(null);

  const ctx: DisplayContext = useMemo(
    () => ({ scenario, snapshot }),
    [scenario, snapshot],
  );
  const positionsPx = useMemo(() => allAssetPx(ctx), [ctx]);

  /** Client coords → untransformed view-box coords. */
  const toViewPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0, scale: 1 };
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
    const offsetX = (rect.width - VIEW_W * scale) / 2;
    const offsetY = (rect.height - VIEW_H * scale) / 2;
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
      scale,
    };
  }, []);

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
        if (k === v.k) return v;
        const wx = (px - v.x) / v.k;
        const wy = (py - v.y) / v.k;
        return { k, x: px - wx * k, y: py - wy * k };
      });
    },
    [],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const p = toViewPoint(e.clientX, e.clientY);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0011));
    },
    [toViewPoint, zoomAt],
  );

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Deliberately no pointer capture yet: capturing here would retarget the
    // composed click event and swallow asset/link selection. Capture begins
    // only once the pointer actually starts dragging.
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      viewX: view.x,
      viewY: view.y,
      moved: false,
      captured: false,
    };
  }, [view]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d) return;
      const p0 = toViewPoint(d.startX, d.startY);
      const p1 = toViewPoint(e.clientX, e.clientY);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (d.moved && !d.captured) {
        e.currentTarget.setPointerCapture(e.pointerId);
        d.captured = true;
      }
      if (d.moved) setView((v) => ({ ...v, x: d.viewX + dx, y: d.viewY + dy }));
    },
    [toViewPoint],
  );

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    return d?.moved ?? false;
  }, []);

  const isPanned = view.k !== 1 || view.x !== 0 || view.y !== 0;

  return (
    <section className="mapview" aria-label="Mission visualization">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className={drag.current?.moved ? 'is-panning' : undefined}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          const moved = onPointerUp();
          // A clean click on the background clears the selection.
          if (!moved && e.target === e.currentTarget.querySelector('.mv-bg')) {
            select(null);
          }
        }}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <radialGradient id="grad-earth" cx="38%" cy="34%">
            <stop offset="0%" stopColor="#3a6f8f" />
            <stop offset="55%" stopColor="#1d4460" />
            <stop offset="100%" stopColor="#0d2436" />
          </radialGradient>
          <radialGradient id="grad-moon" cx="38%" cy="34%">
            <stop offset="0%" stopColor="#9aa2ad" />
            <stop offset="60%" stopColor="#5d6570" />
            <stop offset="100%" stopColor="#343b44" />
          </radialGradient>
          <radialGradient id="grad-mars" cx="38%" cy="34%">
            <stop offset="0%" stopColor="#b96b45" />
            <stop offset="60%" stopColor="#87452c" />
            <stop offset="100%" stopColor="#4f2718" />
          </radialGradient>
          <radialGradient id="grad-vignette" cx="50%" cy="46%" r="72%">
            <stop offset="0%" stopColor="#0b1017" />
            <stop offset="78%" stopColor="#080b11" />
            <stop offset="100%" stopColor="#05070b" />
          </radialGradient>
          <pattern id="dotgrid" width="34" height="34" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#182231" />
          </pattern>
          <marker
            id="arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
          </marker>
        </defs>

        <rect className="mv-bg" width={VIEW_W} height={VIEW_H} fill="url(#grad-vignette)" />
        <rect width={VIEW_W} height={VIEW_H} fill="url(#dotgrid)" pointerEvents="none" />

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <RingsLayer ctx={ctx} />
          <LinkLayer ctx={ctx} positionsPx={positionsPx} />
          <SceneLayer ctx={ctx} positionsPx={positionsPx} />
        </g>

        <FrameChrome ctx={ctx} />
      </svg>

      <div className="mapview-note" aria-hidden="true">
        SCHEMATIC PROJECTION · RADIAL DISTANCES COMPRESSED · PLANE VIEW TILT 25°
      </div>

      <MapStatus ctx={ctx} />

      <div className="mapview-legend" role="note" aria-label="Map legend">
        <span className="lg-item">
          <svg viewBox="0 0 30 8" aria-hidden="true"><line x1="1" y1="4" x2="29" y2="4" className="lg-route" /></svg>
          ROUTE
        </span>
        <span className="lg-item">
          <svg viewBox="0 0 30 8" aria-hidden="true"><line x1="1" y1="4" x2="29" y2="4" className="lg-link" /></svg>
          LINK
        </span>
        <span className="lg-item">
          <svg viewBox="0 0 30 8" aria-hidden="true"><line x1="1" y1="4" x2="29" y2="4" className="lg-storm" /></svg>
          DEGRADED
        </span>
        <span className="lg-item">
          <svg viewBox="0 0 30 8" aria-hidden="true"><line x1="1" y1="4" x2="29" y2="4" className="lg-blocked" /></svg>
          BLOCKED
        </span>
      </div>

      <div className="mapview-zoom" role="group" aria-label="Map zoom controls">
        <button
          type="button"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => zoomAt(VIEW_W / 2, VIEW_H / 2, 1.3)}
        >
          +
        </button>
        <button
          type="button"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoomAt(VIEW_W / 2, VIEW_H / 2, 1 / 1.3)}
        >
          −
        </button>
        <button
          type="button"
          title="Reset view"
          aria-label="Reset view"
          disabled={!isPanned}
          onClick={() => setView({ k: 1, x: 0, y: 0 })}
        >
          FIT
        </button>
      </div>
    </section>
  );
}
