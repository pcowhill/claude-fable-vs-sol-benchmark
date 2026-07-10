import type { PlanState } from '../sim/types';
import { getScenario, isScenarioId } from '../scenarios';
import { validatePlanState, validateTime } from './validate';

export const EXPORT_FORMAT = 'asterism.plan';
export const EXPORT_VERSION = 1;

export interface BaselineRecord {
  plan: PlanState;
  label: string;
}

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  scenarioId: string;
  timeS: number;
  plan: PlanState;
  baseline: BaselineRecord | null;
}

export function serializePlan(env: {
  scenarioId: string;
  timeS: number;
  plan: PlanState;
  baseline: BaselineRecord | null;
}): string {
  const out: ExportEnvelope = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    scenarioId: env.scenarioId,
    timeS: Math.round(env.timeS),
    plan: env.plan,
    baseline: env.baseline,
  };
  return JSON.stringify(out, null, 2);
}

export interface ImportResult {
  ok: boolean;
  errors: string[];
  value?: {
    scenarioId: string;
    timeS: number;
    plan: PlanState;
    baseline: BaselineRecord | null;
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parse + deep-validate an exported plan file. Never throws. */
export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      errors: [`Not valid JSON — ${e instanceof Error ? e.message : 'parse error'}.`],
    };
  }
  if (!isRecord(raw)) return { ok: false, errors: ['File root must be a JSON object.'] };
  if (raw.format !== EXPORT_FORMAT) {
    return {
      ok: false,
      errors: [
        `Unrecognized format “${String(raw.format ?? 'none')}” — expected “${EXPORT_FORMAT}”.`,
      ],
    };
  }
  if (raw.version !== EXPORT_VERSION) {
    return {
      ok: false,
      errors: [
        `Unsupported format version ${String(raw.version)} — this build reads version ${EXPORT_VERSION}.`,
      ],
    };
  }
  if (typeof raw.scenarioId !== 'string' || !isScenarioId(raw.scenarioId)) {
    return {
      ok: false,
      errors: [
        `Unknown scenario “${String(raw.scenarioId)}”. This build ships: lunar-south-pole, mars-transfer, solar-storm.`,
      ],
    };
  }
  const scenario = getScenario(raw.scenarioId);
  const planRes = validatePlanState(scenario, raw.plan);
  if (!planRes.ok || !planRes.value) return { ok: false, errors: planRes.errors };

  let baseline: BaselineRecord | null = null;
  if (raw.baseline !== null && raw.baseline !== undefined) {
    if (!isRecord(raw.baseline)) {
      return { ok: false, errors: ['baseline must be an object or null.'] };
    }
    const basePlan = validatePlanState(scenario, raw.baseline.plan);
    if (!basePlan.ok || !basePlan.value) {
      return {
        ok: false,
        errors: ['baseline.plan failed validation:', ...basePlan.errors],
      };
    }
    baseline = {
      plan: basePlan.value,
      label:
        typeof raw.baseline.label === 'string' && raw.baseline.label.trim()
          ? raw.baseline.label.trim().slice(0, 48)
          : 'Imported baseline',
    };
  }

  return {
    ok: true,
    errors: [],
    value: {
      scenarioId: raw.scenarioId,
      timeS: validateTime(raw.timeS),
      plan: planRes.value,
      baseline,
    },
  };
}
