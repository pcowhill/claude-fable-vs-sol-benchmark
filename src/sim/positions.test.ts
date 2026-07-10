import { describe, expect, it } from 'vitest';
import { lunarSouthPole } from '../scenarios/lunarSouthPole';
import { assetPositions, bodyCenters, BODY_RADIUS_KM } from './positions';
import { effectiveAssets } from './plan';
import { emptyPlan } from './plan';
import { dist } from './vec';

const scenario = lunarSouthPole;
const assets = effectiveAssets(scenario, emptyPlan());

describe('positions', () => {
  it('is deterministic: same time → identical output', () => {
    const a = assetPositions(scenario, assets, 12_345);
    const b = assetPositions(scenario, assets, 12_345);
    expect(a).toEqual(b);
  });

  it('orbits return to start after one period', () => {
    const argus = assets.find((a) => a.id === 'argus-1')!;
    if (argus.placement.type !== 'orbit') throw new Error('expected orbit');
    const period = argus.placement.periodS;
    const p0 = assetPositions(scenario, assets, 0);
    const p1 = assetPositions(scenario, assets, period);
    // Anchor body barely moves in one relay period; compare relative offset.
    const rel0 = dist(p0.positions['argus-1'], p0.centers.moon);
    const rel1 = dist(p1.positions['argus-1'], p1.centers.moon);
    expect(rel0).toBeCloseTo(argus.placement.radiusKm, 6);
    expect(rel1).toBeCloseTo(argus.placement.radiusKm, 6);
    const a0 = Math.atan2(
      p0.positions['argus-1'].y - p0.centers.moon.y,
      p0.positions['argus-1'].x - p0.centers.moon.x,
    );
    const a1 = Math.atan2(
      p1.positions['argus-1'].y - p1.centers.moon.y,
      p1.positions['argus-1'].x - p1.centers.moon.x,
    );
    expect(Math.abs(a1 - a0)).toBeLessThan(0.02);
  });

  it('surface stations stay on the body surface while it spins', () => {
    for (const t of [0, 3600, 40_000, 86_400]) {
      const { centers, positions } = assetPositions(scenario, assets, t);
      const r = dist(positions['dss-14'], centers.earth);
      expect(r).toBeCloseTo(BODY_RADIUS_KM.earth, 6);
    }
    // Half an Earth day rotates the station to the far side (~2R apart).
    const early = assetPositions(scenario, assets, 0).positions['dss-14'];
    const later = assetPositions(scenario, assets, 43_082).positions['dss-14'];
    expect(dist(early, later)).toBeGreaterThan(BODY_RADIUS_KM.earth * 1.9);
  });

  it('transfer vehicles progress monotonically toward the target', () => {
    const dAt = (t: number) => {
      const { centers, positions } = assetPositions(scenario, assets, t);
      return dist(positions['pelican-6'], centers.moon);
    };
    const samples = [0, 6 * 3600, 12 * 3600, 18 * 3600, 24 * 3600].map(dAt);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThan(samples[i - 1]);
    }
  });

  it('moon orbits Earth at the configured radius', () => {
    for (const t of [0, 20_000, 80_000]) {
      const centers = bodyCenters(scenario.bodies, t);
      expect(dist(centers.moon, centers.earth)).toBeCloseTo(
        scenario.bodies.moonOrbitRadiusKm,
        4,
      );
    }
  });
});
