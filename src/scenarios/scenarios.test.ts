import { describe, expect, it } from 'vitest';
import { scenarios, getScenario, isScenarioId } from './index';
import { computeSnapshot } from '../sim/snapshot';
import { computeMetrics } from '../sim/metrics';
import { emptyPlan } from '../sim/plan';

describe('scenario catalogue', () => {
  it('ships the three required scenarios', () => {
    expect(scenarios.map((s) => s.id)).toEqual([
      'lunar-south-pole',
      'mars-transfer',
      'solar-storm',
    ]);
  });

  it('rejects unknown ids', () => {
    expect(() => getScenario('nope')).toThrow();
    expect(isScenarioId('mars-transfer')).toBe(true);
    expect(isScenarioId('x')).toBe(false);
  });

  it('every scenario is internally consistent', () => {
    for (const s of scenarios) {
      const ids = new Set(s.assets.map((a) => a.id));
      expect(ids.size).toBe(s.assets.length);
      expect(s.assets.some((a) => a.isEarthTerminal)).toBe(true);
      expect(s.assets.some((a) => a.critical)).toBe(true);
      expect(s.regions.length).toBeGreaterThanOrEqual(2);
      expect(s.missionWindows.length).toBeGreaterThanOrEqual(3);
      for (const w of s.missionWindows) {
        expect(ids.has(w.assetId)).toBe(true);
        expect(w.endS).toBeGreaterThan(w.startS);
      }
      for (const d of s.degradations) expect(ids.has(d.assetId)).toBe(true);
      for (const r of s.regions) {
        expect(r.comms.minPowerW).toBeLessThan(r.comms.maxPowerW);
        expect(r.comms.defaultPowerW).toBeGreaterThanOrEqual(r.comms.minPowerW);
        expect(r.comms.defaultPowerW).toBeLessThanOrEqual(r.comms.maxPowerW);
      }
    }
  });

  it('scenarios present meaningfully different problems', () => {
    const metrics = scenarios.map((s) => computeMetrics(s, emptyPlan()));
    // Mars runs at interplanetary latency; the lunar scenarios do not.
    expect(metrics[1].meanLatencyS).toBeGreaterThan(300);
    expect(metrics[0].meanLatencyS).toBeLessThan(5);
    expect(metrics[2].meanLatencyS).toBeLessThan(5);
    // Asset sets differ.
    const sets = scenarios.map((s) => s.assets.map((a) => a.id).join(','));
    expect(new Set(sets).size).toBe(3);
    // Only the storm scenario has storms.
    expect(scenarios[0].storms).toHaveLength(0);
    expect(scenarios[2].storms.length).toBeGreaterThan(0);
  });

  it('every scenario opens with at least one connected critical asset', () => {
    for (const s of scenarios) {
      const snap = computeSnapshot(s, emptyPlan(), s.defaultTimeS);
      const connected = snap.assets.filter(
        (a) => a.critical && snap.routes[a.id]?.connected,
      );
      expect(connected.length).toBeGreaterThan(0);
    }
  });
});
