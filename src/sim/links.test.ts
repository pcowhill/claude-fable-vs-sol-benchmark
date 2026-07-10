import { describe, expect, it } from 'vitest';
import { lunarSouthPole } from '../scenarios/lunarSouthPole';
import { solarStorm } from '../scenarios/solarStorm';
import { computeSnapshot } from './snapshot';
import { emptyPlan } from './plan';
import {
  canLink,
  hasLineOfSight,
  linkScoreDb,
  scoreToQuality,
  stormSeverityDb,
} from './links';
import { effectiveAssets } from './plan';
import type { BodyId, Vec2 } from './types';

const scenario = lunarSouthPole;
const assets = effectiveAssets(scenario, emptyPlan());
const byId = (id: string) => assets.find((a) => a.id === id)!;

const centers: Record<BodyId, Vec2> = {
  earth: { x: 0, y: 0 },
  moon: { x: 384_400, y: 0 },
  mars: { x: 0, y: 2.2e8 },
};

describe('line of sight', () => {
  it('blocks a path that passes through a body', () => {
    const a = byId('argus-1');
    const b = byId('argus-2');
    // Two points on opposite sides of the Moon, segment through its center.
    const pa = { x: 384_400 - 3_237, y: 0 };
    const pb = { x: 384_400 + 3_237, y: 0 };
    expect(hasLineOfSight(a, b, pa, pb, centers)).toBe(false);
  });

  it('allows a clear path', () => {
    const a = byId('argus-1');
    const b = byId('argus-2');
    const pa = { x: 384_400, y: 3_237 };
    const pb = { x: 384_400 + 3_237, y: 400 };
    expect(hasLineOfSight(a, b, pa, pb, centers)).toBe(true);
  });

  it('enforces the surface horizon: targets below elevation mask are cut', () => {
    const station = byId('dss-14');
    const relay = byId('keystone');
    const stationPos = { x: 6_371, y: 0 };
    const above = { x: 42_164, y: 2_000 };
    const behind = { x: -42_164, y: 500 };
    expect(hasLineOfSight(station, relay, stationPos, above, centers)).toBe(true);
    expect(hasLineOfSight(station, relay, stationPos, behind, centers)).toBe(false);
  });
});

describe('link budget', () => {
  const a = byId('argus-1');
  const b = byId('shackleton');

  it('quality increases with transmit power', () => {
    const low = linkScoreDb({ ...a, comms: { ...a.comms, txPowerW: 30 } }, b, 'x', 2_500, 0, 1, 1);
    const high = linkScoreDb({ ...a, comms: { ...a.comms, txPowerW: 380 } }, b, 'x', 2_500, 0, 1, 1);
    expect(high).toBeGreaterThan(low);
    expect(scoreToQuality(high)).toBeGreaterThan(scoreToQuality(low));
  });

  it('quality decreases with distance', () => {
    const near = linkScoreDb(a, b, 'x', 1_800, 0, 1, 1);
    const far = linkScoreDb(a, b, 'x', 5_000, 0, 1, 1);
    expect(near).toBeGreaterThan(far);
  });

  it('storms and poor health attenuate the link', () => {
    const clear = linkScoreDb(a, b, 'x', 2_500, 0, 1, 1);
    const stormy = linkScoreDb(a, b, 'x', 2_500, 12, 1, 1);
    const sick = linkScoreDb(a, b, 'x', 2_500, 0, 0.5, 1);
    expect(stormy).toBeCloseTo(clear - 12, 6);
    expect(sick).toBeLessThan(clear);
  });

  it('quality clamps to [0, 1]', () => {
    expect(scoreToQuality(-40)).toBe(0);
    expect(scoreToQuality(80)).toBe(1);
  });
});

describe('band compatibility', () => {
  it('UHF-only rover cannot link to X/Ka-only ground stations', () => {
    expect(canLink(byId('vireo'), byId('dss-14'))).toBeNull();
  });
  it('prefers the best shared band', () => {
    expect(canLink(byId('dss-14'), byId('keystone'))).toBe('ka');
  });
  it('never links two Earth terminals over RF', () => {
    expect(canLink(byId('dss-14'), byId('dss-63'))).toBeNull();
  });
});

describe('storm model', () => {
  it('ramps deterministically inside the window and is zero outside', () => {
    expect(stormSeverityDb(solarStorm.storms, 8 * 3600)).toBe(0);
    const mid = stormSeverityDb(solarStorm.storms, 12.5 * 3600);
    expect(mid).toBeGreaterThan(20);
    expect(stormSeverityDb(solarStorm.storms, 12.5 * 3600)).toBe(mid);
    expect(stormSeverityDb(solarStorm.storms, 23 * 3600)).toBe(0);
  });

  it('degrades sunward links during the event', () => {
    const plan = emptyPlan();
    const calm = computeSnapshot(solarStorm, plan, 7 * 3600);
    const peak = computeSnapshot(solarStorm, plan, 12.5 * 3600);
    const linkAt = (snap: typeof calm) =>
      snap.links.find(
        (l) => l.id.includes('halo-a') && l.id.includes('dss-43'),
      );
    const calmLink = linkAt(calm);
    const peakLink = linkAt(peak);
    expect(calmLink).toBeDefined();
    expect(peakLink).toBeDefined();
    expect(peakLink!.stormDb).toBeGreaterThan(5);
    expect(peakLink!.scoreDb).toBeLessThan(calmLink!.scoreDb);
  });
});
