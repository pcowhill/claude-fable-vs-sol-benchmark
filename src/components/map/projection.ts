import type {
  BodyId,
  EffectiveAsset,
  ScenarioDef,
  SimSnapshot,
  Vec2,
} from '../../sim/types';

/** Map plane is drawn as if viewed ~25° above the orbital plane. */
export const TILT = 0.42;
export const VIEW_W = 1600;
export const VIEW_H = 900;

export interface DisplayContext {
  scenario: ScenarioDef;
  snapshot: SimSnapshot;
}

/** Piecewise-linear in log(radius) between scenario control points. */
export function ringPx(scenario: ScenarioDef, body: BodyId, radiusKm: number): number {
  const points = scenario.layout.orbitRingsPx[body];
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0][1];
  const lr = Math.log(Math.max(radiusKm, 1));
  const first = points[0];
  const last = points[points.length - 1];
  if (radiusKm <= first[0]) return first[1];
  if (radiusKm >= last[0]) {
    const [k0, p0] = points[points.length - 2];
    const t = (lr - Math.log(last[0])) / (Math.log(last[0]) - Math.log(k0));
    return last[1] + t * (last[1] - p0);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const [k0, p0] = points[i];
    const [k1, p1] = points[i + 1];
    if (radiusKm >= k0 && radiusKm <= k1) {
      const t = (lr - Math.log(k0)) / (Math.log(k1) - Math.log(k0));
      return p0 + t * (p1 - p0);
    }
  }
  return last[1];
}

/** Place a point at `angleRad` on a tilted ring around a display center. */
export const onRing = (center: Vec2, angleRad: number, rPx: number): Vec2 => ({
  x: center.x + Math.cos(angleRad) * rPx,
  y: center.y - Math.sin(angleRad) * rPx * TILT,
});

export function bodyCenterPx(ctx: DisplayContext, body: BodyId): Vec2 {
  const { scenario, snapshot } = ctx;
  const { layout } = scenario;
  if (body === 'earth') return layout.earthPx;
  if (body === 'mars') return layout.marsPx ?? { x: -9999, y: -9999 };
  const moonPhys = snapshot.bodyCenters.moon;
  const angle = Math.atan2(moonPhys.y, moonPhys.x);
  return onRing(layout.earthPx, angle, layout.moonOrbitPx);
}

export function bodyRadiusPx(scenario: ScenarioDef, body: BodyId): number {
  if (body === 'earth') return scenario.layout.earthRPx;
  if (body === 'moon') return scenario.layout.moonRPx;
  return scenario.layout.marsRPx;
}

/** Angle of an asset around its anchor body, from physical positions. */
function angleAround(ctx: DisplayContext, assetId: string, body: BodyId): number {
  const pos = ctx.snapshot.positions[assetId];
  const center = ctx.snapshot.bodyCenters[body];
  return Math.atan2(pos.y - center.y, pos.x - center.x);
}

const dist2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Log-eased progress along a transfer chord (display parameter 0..1). */
export function transferParam(ctx: DisplayContext, asset: EffectiveAsset): number {
  if (asset.placement.type !== 'transfer') return 0;
  const pos = ctx.snapshot.positions[asset.id];
  const from = ctx.snapshot.bodyCenters[asset.placement.from];
  const to = ctx.snapshot.bodyCenters[asset.placement.to];
  const scaleKm = 1e5;
  const a = Math.log(1 + dist2(pos, from) / scaleKm);
  const b = Math.log(1 + dist2(pos, to) / scaleKm);
  return a + b === 0 ? 0 : a / (a + b);
}

export function transferTrack(
  ctx: DisplayContext,
  asset: EffectiveAsset,
): { p0: Vec2; p1: Vec2; control: Vec2 } | null {
  if (asset.placement.type !== 'transfer') return null;
  const p0 = bodyCenterPx(ctx, asset.placement.from);
  const p1 = bodyCenterPx(ctx, asset.placement.to);
  const chord = { x: p1.x - p0.x, y: p1.y - p0.y };
  const chordLen = Math.hypot(chord.x, chord.y) || 1;
  const bowPx = chordLen * 0.13 * Math.sign(asset.placement.bowKm || 1);
  const control = {
    x: (p0.x + p1.x) / 2 + (-chord.y / chordLen) * bowPx * 2,
    y: (p0.y + p1.y) / 2 + (chord.x / chordLen) * bowPx * 2,
  };
  return { p0, p1, control };
}

const bezier = (p0: Vec2, c: Vec2, p1: Vec2, t: number): Vec2 => ({
  x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x,
  y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y,
});

/** Display position of any asset (px in the 1600×900 view space). */
export function assetPx(ctx: DisplayContext, asset: EffectiveAsset): Vec2 {
  const { scenario } = ctx;
  switch (asset.placement.type) {
    case 'orbit': {
      const body = asset.placement.body;
      const center = bodyCenterPx(ctx, body);
      const angle = angleAround(ctx, asset.id, body);
      return onRing(center, angle, ringPx(scenario, body, asset.placement.radiusKm));
    }
    case 'surface': {
      const body = asset.placement.body;
      const center = bodyCenterPx(ctx, body);
      const angle = angleAround(ctx, asset.id, body);
      return onRing(center, angle, bodyRadiusPx(scenario, body));
    }
    case 'transfer': {
      const track = transferTrack(ctx, asset);
      if (!track) return { x: 0, y: 0 };
      return bezier(track.p0, track.control, track.p1, transferParam(ctx, asset));
    }
  }
}

/** All asset display positions, computed once per frame. */
export function allAssetPx(ctx: DisplayContext): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  for (const asset of ctx.snapshot.assets) out[asset.id] = assetPx(ctx, asset);
  return out;
}

/** Direction of the sun in display space (unit vector). */
export function sunDirPx(scenario: ScenarioDef): Vec2 {
  const rad = (scenario.sunDirectionDeg * Math.PI) / 180;
  const v = { x: Math.cos(rad), y: -Math.sin(rad) * TILT };
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}
