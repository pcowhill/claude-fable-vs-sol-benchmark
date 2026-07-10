import type { ReactElement } from 'react';
import type { BodyId, EffectiveAsset, Vec2 } from '../../sim/types';
import { useStore } from '../../state/store';
import {
  bodyCenterPx,
  bodyRadiusPx,
  ringPx,
  sunDirPx,
  type DisplayContext,
} from './projection';
import { bodySpinDeg } from '../../sim/positions';
import { AssetSymbol, Reticle } from './glyphs';

const BODY_LABELS: Record<BodyId, string> = {
  earth: 'EARTH',
  moon: 'MOON',
  mars: 'MARS',
};

function BodyGlyph({
  ctx,
  body,
  center,
}: {
  ctx: DisplayContext;
  body: BodyId;
  center: Vec2;
}) {
  const r = bodyRadiusPx(ctx.scenario, body);
  if (r <= 0) return null;
  const sun = sunDirPx(ctx.scenario);
  const shadeAngle = (Math.atan2(-sun.y, -sun.x) * 180) / Math.PI;
  const spin = bodySpinDeg(ctx.scenario.bodies, body, ctx.snapshot.timeS);
  const spinRad = (spin * Math.PI) / 180;
  const tick = {
    x1: center.x + Math.cos(spinRad) * r * 0.82,
    y1: center.y - Math.sin(spinRad) * r * 0.82 * 0.42,
    x2: center.x + Math.cos(spinRad) * r * 1.0,
    y2: center.y - Math.sin(spinRad) * r * 1.0 * 0.42,
  };
  return (
    <g className={`mv-body mv-body-${body}`}>
      <circle cx={center.x} cy={center.y} r={r} fill={`url(#grad-${body})`} />
      <path
        d={`M ${center.x} ${center.y - r} A ${r} ${r} 0 0 1 ${center.x} ${center.y + r} Z`}
        className="mv-body-shade"
        transform={`rotate(${shadeAngle + 90} ${center.x} ${center.y})`}
      />
      <circle cx={center.x} cy={center.y} r={r} className="mv-body-limb" />
      {body !== 'moon' && (
        <line {...tick} className="mv-body-tick">
          <title>Prime meridian (body rotation)</title>
        </line>
      )}
      <text
        x={center.x}
        y={center.y + r + 15}
        className="mv-body-label"
        textAnchor="middle"
      >
        {BODY_LABELS[body]}
      </text>
    </g>
  );
}

function AssetNode({
  ctx,
  asset,
  pos,
}: {
  ctx: DisplayContext;
  asset: EffectiveAsset;
  pos: Vec2;
}) {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const selected = selection?.kind === 'asset' && selection.id === asset.id;
  const route = ctx.snapshot.routes[asset.id];
  const noRoute = asset.critical && asset.enabled && route && !route.connected;
  // Anchored assets label radially outward so text clears the disc and
  // neighbouring markers fan apart instead of stacking.
  let labelX = 16;
  let labelY = 4;
  let anchor: 'start' | 'end' | 'middle' = 'start';
  if (asset.placement.type === 'orbit' || asset.placement.type === 'surface') {
    const center = bodyCenterPx(ctx, asset.placement.body);
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = dx / len;
    const oy = dy / len;
    // Surface labels sit farther out than orbiter labels so neighbouring
    // markers in the same sector occupy different text radii.
    const reach = asset.placement.type === 'surface' ? 31 : 17;
    labelX = ox * reach;
    labelY = oy * (reach - 2) + 4;
    anchor = ox < -0.3 ? 'end' : ox > 0.3 ? 'start' : 'middle';
  } else if (pos.x > 1430) {
    labelX = -16;
    anchor = 'end';
  }
  const mapLabel =
    asset.shortName ??
    (asset.kind === 'ground-station' ? asset.name.split(' ')[0] : asset.name);
  const classes = [
    'mv-asset',
    `mv-asset-${asset.kind}`,
    asset.enabled ? '' : 'is-disabled',
    selected ? 'is-selected' : '',
    asset.userCreated ? 'is-user' : '',
    noRoute ? 'is-noroute' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <g
      transform={`translate(${pos.x},${pos.y})`}
      className={classes}
      role="button"
      tabIndex={-1}
      aria-label={`${asset.name} — ${asset.kind}${selected ? ', selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'asset', id: asset.id });
      }}
    >
      <circle r={13} className="mv-asset-hit" />
      {asset.userCreated && <circle r={10.5} className="mv-asset-userring" />}
      <AssetSymbol kind={asset.kind} />
      {!asset.enabled && <path d="M-8,8 L8,-8" className="mv-asset-slash" />}
      {noRoute && (
        <g className="mv-noroute" transform="translate(9,-10)">
          <path d="M0,-4.5 L4.5,3.5 H-4.5 Z" />
          <rect x={-0.6} y={-2.2} width={1.2} height={2.8} />
          <rect x={-0.6} y={1.4} width={1.2} height={1.2} />
          <title>No route to Earth</title>
        </g>
      )}
      <text x={labelX} y={labelY} textAnchor={anchor} className="mv-asset-label">
        {mapLabel.toUpperCase()}
      </text>
      {selected && <Reticle r={15} />}
      <title>{`${asset.name} · ${asset.role}`}</title>
    </g>
  );
}

/** Trailing arc showing recent travel of an orbiting asset. */
function TrailArc({ ctx, asset }: { ctx: DisplayContext; asset: EffectiveAsset }) {
  if (asset.placement.type !== 'orbit') return null;
  const body = asset.placement.body;
  const center = bodyCenterPx(ctx, body);
  const rPx = ringPx(ctx.scenario, body, asset.placement.radiusKm);
  const pos = ctx.snapshot.positions[asset.id];
  const bc = ctx.snapshot.bodyCenters[body];
  const angle = Math.atan2(pos.y - bc.y, pos.x - bc.x);
  const dir = asset.placement.retrograde ? -1 : 1;
  const span = (26 * Math.PI) / 180;
  const steps = 6;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = angle - dir * span * (1 - i / steps);
    pts.push(
      `${center.x + Math.cos(a) * rPx},${center.y - Math.sin(a) * rPx * 0.42}`,
    );
  }
  return <polyline points={pts.join(' ')} className="mv-trail" />;
}

/** Bodies and assets painter-sorted by display Y so nearer occludes farther. */
export function SceneLayer({
  ctx,
  positionsPx,
}: {
  ctx: DisplayContext;
  positionsPx: Record<string, Vec2>;
}) {
  const items: Array<{ y: number; key: string; el: ReactElement }> = [];
  const bodies: BodyId[] = ['earth', 'moon'];
  if (ctx.scenario.layout.marsPx) bodies.push('mars');
  for (const body of bodies) {
    const center = bodyCenterPx(ctx, body);
    items.push({
      y: center.y,
      key: `body-${body}`,
      el: <BodyGlyph ctx={ctx} body={body} center={center} />,
    });
  }
  for (const asset of ctx.snapshot.assets) {
    const pos = positionsPx[asset.id];
    if (!pos) continue;
    items.push({
      y: pos.y,
      key: asset.id,
      el: <AssetNode ctx={ctx} asset={asset} pos={pos} />,
    });
  }
  items.sort((a, b) => a.y - b.y);
  return (
    <g>
      <g className="mv-trails">
        {ctx.snapshot.assets.map((a) => (
          <TrailArc key={a.id} ctx={ctx} asset={a} />
        ))}
      </g>
      {items.map((i) => (
        <g key={i.key}>{i.el}</g>
      ))}
    </g>
  );
}
