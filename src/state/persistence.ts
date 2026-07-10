import type { PlanState } from '../sim/types';
import { getScenario } from '../scenarios';
import type { BaselineRecord } from './importExport';
import { validatePlanState, validateTime } from './validate';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'asterism.v1';

export interface PersistedScenarioState {
  plan: PlanState;
  baseline: BaselineRecord | null;
  timeS: number;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Storage disabled (private mode etc.) — run without persistence.
  }
  return null;
}

let storage: StorageLike | null = defaultStorage();

/** Test hook: swap the backing store. */
export function setStorage(next: StorageLike | null): void {
  storage = next;
}

export function saveScenarioState(
  scenarioId: string,
  state: PersistedScenarioState,
): void {
  if (!storage) return;
  try {
    storage.setItem(`${PREFIX}.scenario.${scenarioId}`, JSON.stringify(state));
    storage.setItem(`${PREFIX}.active`, scenarioId);
  } catch {
    // Quota exceeded — persistence is best-effort.
  }
}

export function loadScenarioState(
  scenarioId: string,
): PersistedScenarioState | null {
  if (!storage) return null;
  const raw = storage.getItem(`${PREFIX}.scenario.${scenarioId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const scenario = getScenario(scenarioId);
    const plan = validatePlanState(scenario, parsed.plan);
    if (!plan.ok || !plan.value) return null;
    let baseline: BaselineRecord | null = null;
    const rawBase = parsed.baseline as Record<string, unknown> | null | undefined;
    if (rawBase && typeof rawBase === 'object') {
      const basePlan = validatePlanState(scenario, rawBase.plan);
      if (basePlan.ok && basePlan.value) {
        baseline = {
          plan: basePlan.value,
          label: typeof rawBase.label === 'string' ? rawBase.label : 'Baseline',
        };
      }
    }
    return { plan: plan.value, baseline, timeS: validateTime(parsed.timeS) };
  } catch {
    return null;
  }
}

export function loadActiveScenarioId(): string | null {
  if (!storage) return null;
  return storage.getItem(`${PREFIX}.active`);
}

export function clearScenarioState(scenarioId: string): void {
  if (!storage) return;
  storage.removeItem(`${PREFIX}.scenario.${scenarioId}`);
}
