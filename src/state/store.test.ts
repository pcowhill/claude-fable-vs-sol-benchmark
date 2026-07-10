import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { emptyPlan } from '../sim/plan';
import { computeMetrics } from '../sim/metrics';
import { getScenario } from '../scenarios';

function resetStore() {
  useStore.setState({
    scenarioId: 'lunar-south-pole',
    timeS: 0,
    playing: false,
    speed: 300,
    selection: null,
    rightTab: 'inspect',
    dialog: null,
    plan: emptyPlan(),
    baseline: null,
    relayCounter: 1,
    toasts: [],
    planDraft: null,
  });
}

beforeEach(resetStore);

const validDraft = {
  name: 'KESTREL-3',
  regionId: 'lunar-orbit-1500',
  phaseDeg: 30,
  txPowerW: 126,
};

describe('relay editing', () => {
  it('adds a relay and selects it', () => {
    const res = useStore.getState().addRelay(validDraft);
    expect(res.ok).toBe(true);
    const s = useStore.getState();
    expect(s.plan.userRelays).toHaveLength(1);
    expect(s.plan.userRelays[0].name).toBe('KESTREL-3');
    expect(s.selection).toEqual({ kind: 'asset', id: res.id });
  });

  it('rejects duplicate names, bad phases and out-of-range power', () => {
    useStore.getState().addRelay(validDraft);
    const dup = useStore.getState().addRelay({ ...validDraft });
    expect(dup.ok).toBe(false);
    expect(dup.errors.join(' ')).toMatch(/already in use/i);

    const badPhase = useStore
      .getState()
      .addRelay({ ...validDraft, name: 'OTHER', phaseDeg: 720 });
    expect(badPhase.ok).toBe(false);
    expect(badPhase.errors.join(' ')).toMatch(/phase/i);

    const badPower = useStore
      .getState()
      .addRelay({ ...validDraft, name: 'OTHER-2', txPowerW: 9_999 });
    expect(badPower.ok).toBe(false);
    expect(badPower.errors.join(' ')).toMatch(/power/i);

    const noRegion = useStore
      .getState()
      .addRelay({ ...validDraft, name: 'OTHER-3', regionId: 'not-a-region' });
    expect(noRegion.ok).toBe(false);
    expect(useStore.getState().plan.userRelays).toHaveLength(1);
  });

  it('enforces the deployment budget', () => {
    for (let i = 0; i < 6; i++) {
      const res = useStore
        .getState()
        .addRelay({ ...validDraft, name: `R-${i}`, phaseDeg: i * 30 });
      expect(res.ok).toBe(true);
    }
    const overflow = useStore
      .getState()
      .addRelay({ ...validDraft, name: 'ONE-TOO-MANY' });
    expect(overflow.ok).toBe(false);
    expect(overflow.errors.join(' ')).toMatch(/budget/i);
  });

  it('edits an existing relay with validation', () => {
    const { id } = useStore.getState().addRelay(validDraft);
    const ok = useStore.getState().updateRelay(id!, { txPowerW: 300, phaseDeg: 90 });
    expect(ok.ok).toBe(true);
    expect(useStore.getState().plan.userRelays[0].txPowerW).toBe(300);
    const bad = useStore.getState().updateRelay(id!, { name: '' });
    expect(bad.ok).toBe(false);
  });

  it('removes a relay and supports undo via the toast action', () => {
    const { id } = useStore.getState().addRelay(validDraft);
    useStore.getState().removeRelay(id!);
    expect(useStore.getState().plan.userRelays).toHaveLength(0);
    const undoToast = useStore.getState().toasts.find((t) => t.undo);
    expect(undoToast).toBeDefined();
    undoToast!.undo!();
    expect(useStore.getState().plan.userRelays).toHaveLength(1);
    expect(useStore.getState().plan.userRelays[0].name).toBe('KESTREL-3');
  });

  it('relay edits change computed mission metrics', () => {
    const scenario = getScenario('lunar-south-pole');
    const before = computeMetrics(scenario, useStore.getState().plan);
    useStore.getState().addRelay(validDraft);
    const after = computeMetrics(scenario, useStore.getState().plan);
    expect(after.coveragePct).toBeGreaterThan(before.coveragePct);
    expect(after.energyKWh).toBeGreaterThan(before.energyKWh);
  });
});

describe('baseline comparison behaviour', () => {
  it('captures, diffs and restores the baseline plan', () => {
    const scenario = getScenario('lunar-south-pole');
    useStore.getState().saveBaseline();
    const baseline = useStore.getState().baseline;
    expect(baseline).not.toBeNull();

    useStore.getState().addRelay(validDraft);
    const baseMetrics = computeMetrics(scenario, baseline!.plan);
    const curMetrics = computeMetrics(scenario, useStore.getState().plan);
    expect(curMetrics.coveragePct).toBeGreaterThan(baseMetrics.coveragePct);

    // Baseline is a snapshot — unaffected by later edits.
    expect(baseline!.plan.userRelays).toHaveLength(0);

    useStore.getState().restoreBaseline();
    expect(useStore.getState().plan.userRelays).toHaveLength(0);
  });

  it('clearBaseline removes the capture', () => {
    useStore.getState().saveBaseline();
    useStore.getState().clearBaseline();
    expect(useStore.getState().baseline).toBeNull();
  });
});

describe('scenario switching', () => {
  it('swaps assets, resets clock and clears selection', () => {
    useStore.getState().select({ kind: 'asset', id: 'argus-1' });
    useStore.getState().setTime(12_345);
    useStore.getState().setScenario('mars-transfer');
    const s = useStore.getState();
    expect(s.scenarioId).toBe('mars-transfer');
    expect(s.selection).toBeNull();
    expect(s.timeS).toBe(getScenario('mars-transfer').defaultTimeS);
    expect(getScenario(s.scenarioId).assets.some((a) => a.id === 'mule-2')).toBe(true);
  });

  it('keeps per-scenario plans separate', () => {
    useStore.getState().addRelay(validDraft);
    useStore.getState().setScenario('mars-transfer');
    expect(useStore.getState().plan.userRelays).toHaveLength(0);
  });

  it('ignores unknown scenario ids', () => {
    useStore.getState().setScenario('fake-scenario');
    expect(useStore.getState().scenarioId).toBe('lunar-south-pole');
  });
});

describe('time control', () => {
  it('clamps to the 24 h window and pauses at the end', () => {
    useStore.getState().setTime(999_999);
    expect(useStore.getState().timeS).toBe(86_400);
    useStore.setState({ playing: true, timeS: 86_395, speed: 1800 });
    useStore.getState().tick(1);
    expect(useStore.getState().timeS).toBe(86_400);
    expect(useStore.getState().playing).toBe(false);
  });

  it('tick advances time by speed × wall dt', () => {
    useStore.setState({ playing: true, timeS: 0, speed: 300 });
    useStore.getState().tick(2);
    expect(useStore.getState().timeS).toBe(600);
  });
});
