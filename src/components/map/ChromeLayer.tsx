import type { BodyId } from '../../sim/types';
import { useStore } from '../../state/store';
import { fmtDb } from '../../lib/format';
import {
  bodyCenterPx,
  onRing,
  ringPx,
  sunDirPx,
  transferTrack,
  VIEW_H,
  VIEW_W,
  type DisplayContext,
} from './projection';

const intFmt = new Intl.NumberFormat('en-US');

/** Orbit rings, moon track, transfer tracks, ghost preview, range labels. */
export function RingsLayer({ ctx }: { ctx: DisplayContext }) {
  const planDraft = useStore((s) => s.planDraft);
  const { scenario, snapshot } = ctx;
  const rings: Array<{ body: BodyId; radiusKm: number; label?: string }> = [];
  const seen = new Set<string>();
  for (const asset of snapshot.assets) {
    if (asset.placement.type !== 'orbit') continue;
    const key = `${asset.placement.body}:${asset.placement.radiusKm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rings.push({
      body: asset.placement.body,
      radiusKm: asset.placement.radiusKm,
      label:
        asset.placement.body !== 'moon'
          ? `${intFmt.format(asset.placement.radiusKm)} km`
          : undefined,
    });
  }

  const earth = bodyCenterPx(ctx, 'earth');
  const draftRegion = planDraft
    ? scenario.regions.find((r) => r.id === planDraft.regionId)
    : null;

  const ships = snapshot.assets.filter((a) => a.placement.type === 'transfer');

  return (
    <g className="mv-rings">
      {/* Moon's orbit around Earth */}
      <ellipse
        cx={earth.x}
        cy={earth.y}
        rx={scenario.layout.moonOrbitPx}
        ry={scenario.layout.moonOrbitPx * 0.42}
        className="mv-ring mv-ring-moon-track"
      />
      <text
        x={earth.x + scenario.layout.moonOrbitPx * 0.72}
        y={earth.y + scenario.layout.moonOrbitPx * 0.42 * 0.78}
        className="mv-ring-label"
      >
        LUNAR TRACK · 384,400 km
      </text>
      {rings.map((ring) => {
        const center = bodyCenterPx(ctx, ring.body);
        const r = ringPx(scenario, ring.body, ring.radiusKm);
        const labelAngle = ring.body === 'earth' ? 236 : -58;
        const labelPos = onRing(center, (labelAngle * Math.PI) / 180, r);
        return (
          <g key={`${ring.body}:${ring.radiusKm}`}>
            <ellipse
              cx={center.x}
              cy={center.y}
              rx={r}
              ry={r * 0.42}
              className="mv-ring"
            />
            {ring.label && (
              <text
                x={labelPos.x}
                y={labelPos.y + 11}
                className="mv-ring-label"
                textAnchor={ring.body === 'earth' ? 'end' : 'start'}
              >
                {ring.label}
              </text>
            )}
          </g>
        );
      })}
      {ships.map((ship) => {
        const track = transferTrack(ctx, ship);
        if (!track) return null;
        return (
          <path
            key={ship.id}
            d={`M ${track.p0.x} ${track.p0.y} Q ${track.control.x} ${track.control.y} ${track.p1.x} ${track.p1.y}`}
            className="mv-transfer-track"
          />
        );
      })}
      {draftRegion && (
        <GhostRelay ctx={ctx} regionId={draftRegion.id} phaseDeg={planDraft!.phaseDeg} />
      )}
    </g>
  );
}

/** Dashed preview of a relay being configured in the plan form. */
function GhostRelay({
  ctx,
  regionId,
  phaseDeg,
}: {
  ctx: DisplayContext;
  regionId: string;
  phaseDeg: number;
}) {
  const region = ctx.scenario.regions.find((r) => r.id === regionId);
  if (!region) return null;
  const center = bodyCenterPx(ctx, region.body);
  const r = ringPx(ctx.scenario, region.body, region.radiusKm);
  const angleDeg = phaseDeg + (ctx.snapshot.timeS / region.periodS) * 360;
  const pos = onRing(center, (angleDeg * Math.PI) / 180, r);
  return (
    <g className="mv-ghost">
      <ellipse cx={center.x} cy={center.y} rx={r} ry={r * 0.42} className="mv-ring is-ghost" />
      <g transform={`translate(${pos.x},${pos.y})`}>
        <circle r={9} className="mv-ghost-ring" />
        <path d="M0,-5 L4,0 L0,5 L-4,0 Z" className="mv-ghost-hull" />
        <text x={13} y={4} className="mv-ghost-label">
          PENDING DEPLOY
        </text>
      </g>
    </g>
  );
}

/** Fixed chrome: frame ticks, sun vector, storm wash. Not pan/zoomed. */
export function FrameChrome({ ctx }: { ctx: DisplayContext }) {
  const { scenario, snapshot } = ctx;
  const sun = sunDirPx(scenario);
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  // Anchor the sun marker where the sun direction leaves the frame.
  const tEdge = Math.min(
    sun.x > 0 ? (VIEW_W - 90 - cx) / sun.x : sun.x < 0 ? (90 - cx) / sun.x : Infinity,
    sun.y > 0 ? (VIEW_H - 90 - cy) / sun.y : sun.y < 0 ? (90 - cy) / sun.y : Infinity,
  );
  const sx = cx + sun.x * tEdge;
  const sy = cy + sun.y * tEdge;
  const perp = { x: -sun.y, y: sun.x };
  const storm = snapshot.stormDb;

  const ticks: React.ReactNode[] = [];
  for (let x = 100; x < VIEW_W; x += 100) {
    ticks.push(<line key={`t${x}`} x1={x} y1={0} x2={x} y2={6} className="mv-frame-tick" />);
    ticks.push(
      <line key={`b${x}`} x1={x} y1={VIEW_H - 6} x2={x} y2={VIEW_H} className="mv-frame-tick" />,
    );
  }
  for (let y = 100; y < VIEW_H; y += 100) {
    ticks.push(<line key={`l${y}`} x1={0} y1={y} x2={6} y2={y} className="mv-frame-tick" />);
    ticks.push(
      <line key={`r${y}`} x1={VIEW_W - 6} y1={y} x2={VIEW_W} y2={y} className="mv-frame-tick" />,
    );
  }

  return (
    <g className="mv-chrome">
      {ticks}
      {storm > 0.5 && (
        <g className="mv-stormrays" style={{ opacity: Math.min(0.85, storm / 26) }}>
          {[-3, -2, -1, 0, 1, 2, 3].map((i) => {
            const ox = sx + perp.x * i * 92;
            const oy = sy + perp.y * i * 92;
            return (
              <line
                key={i}
                x1={ox}
                y1={oy}
                x2={ox - sun.x * 2000}
                y2={oy - sun.y * 2000}
                className="mv-stormray"
              />
            );
          })}
        </g>
      )}
      <g className="mv-sun" transform={`translate(${sx},${sy})`}>
        <circle r={7} className="mv-sun-disc" />
        <line
          x1={-sun.x * 14}
          y1={-sun.y * 14}
          x2={-sun.x * 30}
          y2={-sun.y * 30}
          className="mv-sun-ray"
          markerEnd="url(#arrow)"
        />
        <text x={0} y={24} textAnchor="middle" className="mv-sun-label">
          SUN
        </text>
      </g>
    </g>
  );
}

/** Live custody/status readout (HTML overlay, top-right of the map). */
export function MapStatus({ ctx }: { ctx: DisplayContext }) {
  const { snapshot } = ctx;
  const critical = snapshot.assets.filter((a) => a.critical && a.enabled);
  const connected = critical.filter((a) => snapshot.routes[a.id]?.connected);
  const relaysUp = snapshot.assets.filter(
    (a) => a.kind === 'relay' && a.enabled,
  ).length;
  const linksUp = snapshot.links.filter((l) => l.available).length;
  const custodyOk = connected.length === critical.length;
  return (
    <div className="mapview-status" role="status" aria-label="Network status">
      <div className={`ms-item ${custodyOk ? '' : 'is-alarm'}`}>
        <span className="ms-key">CUSTODY</span>
        <span className="ms-val">
          {connected.length}/{critical.length}
        </span>
      </div>
      <div className="ms-item">
        <span className="ms-key">LINKS UP</span>
        <span className="ms-val">{linksUp}</span>
      </div>
      <div className="ms-item">
        <span className="ms-key">RELAYS</span>
        <span className="ms-val">{relaysUp}</span>
      </div>
      {snapshot.stormDb > 0.5 && (
        <div className="ms-item is-storm">
          <span className="ms-key">SOLAR EVENT</span>
          <span className="ms-val">{fmtDb(-snapshot.stormDb, 1)}</span>
        </div>
      )}
    </div>
  );
}
