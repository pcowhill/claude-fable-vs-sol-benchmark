import { describe, expect, it } from 'vitest';
import { lunarSouthPole } from '../scenarios/lunarSouthPole';
import { computeMetrics } from './metrics';
import { emptyPlan } from './plan';
import type { PlanState } from './types';

const scenario = lunarSouthPole;

describe('plan metrics', () => {
  it('is deterministic for identical inputs', () => {
    const a = computeMetrics(scenario, emptyPlan());
    const b = computeMetrics(scenario, emptyPlan());
    expect(a).toEqual(b);
  });

  it('reports the seeded lunar plan with known gaps', () => {
    const m = computeMetrics(scenario, emptyPlan());
    expect(m.coveragePct).toBeGreaterThan(50);
    expect(m.coveragePct).toBeLessThan(85);
    expect(m.uncoveredWindows).toBe(2);
    expect(m.totalWindows).toBe(3);
    expect(m.activeRelays).toBe(3);
    expect(m.samples.length).toBe(289);
  });

  it('adding a relay improves coverage but costs energy (tradeoff)', () => {
    const base = computeMetrics(scenario, emptyPlan());
    const plan: PlanState = {
      userRelays: [
        {
          id: 'user-relay-1',
          name: 'KESTREL-3',
          regionId: 'lunar-orbit-1500',
          phaseDeg: 30,
          txPowerW: 126,
          enabled: true,
        },
      ],
      overrides: {},
      preferredRelay: {},
    };
    const improved = computeMetrics(scenario, plan);
    expect(improved.coveragePct).toBeGreaterThan(base.coveragePct + 5);
    expect(improved.energyKWh).toBeGreaterThan(base.energyKWh + 1);
    expect(improved.uncoveredWindows).toBeLessThan(base.uncoveredWindows);
    expect(improved.activeRelays).toBe(base.activeRelays + 1);
  });

  it('raising transmit power raises energy without hurting coverage', () => {
    const base = computeMetrics(scenario, emptyPlan());
    const boosted: PlanState = {
      userRelays: [],
      overrides: { 'argus-1': { txPowerW: 380 } },
      preferredRelay: {},
    };
    const m = computeMetrics(scenario, boosted);
    expect(m.energyKWh).toBeGreaterThan(base.energyKWh);
    expect(m.coveragePct).toBeGreaterThanOrEqual(base.coveragePct);
  });

  it('disabling a relay reduces energy and coverage', () => {
    const base = computeMetrics(scenario, emptyPlan());
    const plan: PlanState = {
      userRelays: [],
      overrides: { 'argus-1': { enabled: false } },
      preferredRelay: {},
    };
    const m = computeMetrics(scenario, plan);
    expect(m.energyKWh).toBeLessThan(base.energyKWh);
    expect(m.coveragePct).toBeLessThan(base.coveragePct);
    expect(m.activeRelays).toBe(base.activeRelays - 1);
  });

  it('mean latency stays physically plausible for the Earth–Moon system', () => {
    const m = computeMetrics(scenario, emptyPlan());
    expect(m.meanLatencyS).toBeGreaterThan(1);
    expect(m.meanLatencyS).toBeLessThan(4);
  });
});
