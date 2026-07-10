import { useMemo } from 'react';
import { useScenario, useStore } from './store';
import { computeSnapshot } from '../sim/snapshot';
import { computeMetricsCached } from '../sim/metrics';
import { deriveEventsCached } from '../sim/events';
import type { PlanMetrics, MissionEvent, SimSnapshot } from '../sim/types';

/** Current-moment simulation state (recomputed as the clock moves). */
export function useSnapshot(): SimSnapshot {
  const scenario = useScenario();
  const plan = useStore((s) => s.plan);
  const timeS = useStore((s) => s.timeS);
  return useMemo(
    () => computeSnapshot(scenario, plan, timeS),
    [scenario, plan, timeS],
  );
}

/** 24 h metrics for the working plan (cached on plan identity). */
export function useMetrics(): PlanMetrics {
  const scenario = useScenario();
  const plan = useStore((s) => s.plan);
  return useMemo(() => computeMetricsCached(scenario, plan), [scenario, plan]);
}

/** 24 h metrics for the saved baseline, if any. */
export function useBaselineMetrics(): PlanMetrics | null {
  const scenario = useScenario();
  const baseline = useStore((s) => s.baseline);
  return useMemo(
    () => (baseline ? computeMetricsCached(scenario, baseline.plan) : null),
    [scenario, baseline],
  );
}

/** Derived mission event timeline for the working plan. */
export function useEvents(): MissionEvent[] {
  const scenario = useScenario();
  const plan = useStore((s) => s.plan);
  return useMemo(() => deriveEventsCached(scenario, plan), [scenario, plan]);
}
