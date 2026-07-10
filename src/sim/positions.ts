import type {
  AssetId,
  BodyConfig,
  BodyId,
  EffectiveAsset,
  Placement,
  ScenarioDef,
  Vec2,
} from './types';
import { add, fromAngleDeg, lerp, scale, sub, vec } from './vec';
import { WINDOW_S } from './constants';

export const BODY_RADIUS_KM: Record<BodyId, number> = {
  earth: 6371,
  moon: 1737,
  mars: 3390,
};

/** Physical centers of the three bodies in the mission frame (km). */
export function bodyCenters(cfg: BodyConfig, timeS: number): Record<BodyId, Vec2> {
  const moonAngle =
    cfg.moonPhase0Deg + (timeS / cfg.moonOrbitPeriodS) * 360;
  return {
    earth: vec(0, 0),
    moon: fromAngleDeg(moonAngle, cfg.moonOrbitRadiusKm),
    mars: fromAngleDeg(cfg.marsAngleDeg, cfg.marsRangeKm),
  };
}

export function bodySpinDeg(cfg: BodyConfig, body: BodyId, timeS: number): number {
  switch (body) {
    case 'earth':
      return cfg.earthSpinPhase0Deg + (timeS / cfg.earthSpinPeriodS) * 360;
    case 'mars':
      return cfg.marsSpinPhase0Deg + (timeS / cfg.marsSpinPeriodS) * 360;
    case 'moon':
      // Tidally locked: spin tracks the orbit angle.
      return cfg.moonPhase0Deg + (timeS / cfg.moonOrbitPeriodS) * 360;
  }
}

export function placementPosition(
  placement: Placement,
  cfg: BodyConfig,
  centers: Record<BodyId, Vec2>,
  timeS: number,
): Vec2 {
  switch (placement.type) {
    case 'orbit': {
      const dir = placement.retrograde ? -1 : 1;
      const angle =
        placement.phase0Deg + dir * (timeS / placement.periodS) * 360;
      return add(centers[placement.body], fromAngleDeg(angle, placement.radiusKm));
    }
    case 'surface': {
      const angle = placement.longitudeDeg + bodySpinDeg(cfg, placement.body, timeS);
      return add(
        centers[placement.body],
        fromAngleDeg(angle, BODY_RADIUS_KM[placement.body]),
      );
    }
    case 'transfer': {
      const frac = lerp(
        placement.startFrac,
        placement.endFrac,
        Math.min(1, Math.max(0, timeS / WINDOW_S)),
      );
      const a = centers[placement.from];
      const b = centers[placement.to];
      const along = add(a, scale(sub(b, a), frac));
      // Perpendicular bow peaking mid-transfer gives a curved track.
      const chord = sub(b, a);
      const perp = vec(-chord.y, chord.x);
      const chordLen = Math.hypot(chord.x, chord.y) || 1;
      const bow = scale(perp, (placement.bowKm * Math.sin(Math.PI * frac)) / chordLen);
      return add(along, bow);
    }
  }
}

export function assetPositions(
  scenario: ScenarioDef,
  assets: EffectiveAsset[],
  timeS: number,
): { centers: Record<BodyId, Vec2>; positions: Record<AssetId, Vec2> } {
  const centers = bodyCenters(scenario.bodies, timeS);
  const positions: Record<AssetId, Vec2> = {};
  for (const asset of assets) {
    positions[asset.id] = placementPosition(
      asset.placement,
      scenario.bodies,
      centers,
      timeS,
    );
  }
  return { centers, positions };
}

/** The body a placement is anchored to (for horizon checks), or null. */
export function anchoredBody(placement: Placement): BodyId | null {
  return placement.type === 'surface' ? placement.body : null;
}
