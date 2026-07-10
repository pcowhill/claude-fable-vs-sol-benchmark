import { describe, expect, it } from 'vitest';
import { parseImport, serializePlan } from './importExport';
import type { PlanState } from '../sim/types';

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
  overrides: { 'argus-1': { txPowerW: 200 } },
  preferredRelay: { shackleton: 'argus-1' },
};

describe('export → import round trip', () => {
  it('preserves the full envelope', () => {
    const text = serializePlan({
      scenarioId: 'lunar-south-pole',
      timeS: 14_400,
      plan,
      baseline: { plan, label: 'Baseline A' },
    });
    const res = parseImport(text);
    expect(res.ok).toBe(true);
    expect(res.value!.scenarioId).toBe('lunar-south-pole');
    expect(res.value!.timeS).toBe(14_400);
    expect(res.value!.plan).toEqual(plan);
    expect(res.value!.baseline!.label).toBe('Baseline A');
  });
});

describe('import validation', () => {
  it('rejects non-JSON with a parse message', () => {
    const res = parseImport('this is not json {');
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/not valid json/i);
  });

  it('rejects wrong format identifiers', () => {
    const res = parseImport(JSON.stringify({ format: 'other.thing', version: 1 }));
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/unrecognized format/i);
  });

  it('rejects unsupported versions', () => {
    const res = parseImport(
      JSON.stringify({ format: 'asterism.plan', version: 99, scenarioId: 'lunar-south-pole', plan }),
    );
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/version/i);
  });

  it('rejects unknown scenarios', () => {
    const res = parseImport(
      JSON.stringify({ format: 'asterism.plan', version: 1, scenarioId: 'jupiter-dive', plan }),
    );
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/unknown scenario/i);
  });

  it('rejects structurally broken plans with precise messages', () => {
    const res = parseImport(
      JSON.stringify({
        format: 'asterism.plan',
        version: 1,
        scenarioId: 'lunar-south-pole',
        timeS: 0,
        plan: {
          userRelays: [{ id: 'x', name: 'BAD', regionId: 'mars-low', phaseDeg: 12, txPowerW: 100, enabled: true }],
          overrides: { 'not-an-asset': { enabled: false } },
          preferredRelay: {},
        },
        baseline: null,
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/not a deployment region/i);
    expect(res.errors.join(' ')).toMatch(/unknown asset/i);
  });

  it('clamps out-of-range numeric fields instead of corrupting state', () => {
    const res = parseImport(
      JSON.stringify({
        format: 'asterism.plan',
        version: 1,
        scenarioId: 'lunar-south-pole',
        timeS: 5_000_000,
        plan: {
          userRelays: [
            { id: 'u1', name: 'HOT', regionId: 'lunar-orbit-1500', phaseDeg: 10, txPowerW: 100_000, enabled: true },
          ],
          overrides: {},
          preferredRelay: {},
        },
        baseline: null,
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.value!.timeS).toBe(86_400);
    expect(res.value!.plan.userRelays[0].txPowerW).toBe(380);
  });

  it('rejects baselines that fail plan validation', () => {
    const res = parseImport(
      JSON.stringify({
        format: 'asterism.plan',
        version: 1,
        scenarioId: 'lunar-south-pole',
        timeS: 0,
        plan: { userRelays: [], overrides: {}, preferredRelay: {} },
        baseline: { plan: { userRelays: 'nope' }, label: 'bad' },
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/baseline/i);
  });
});
