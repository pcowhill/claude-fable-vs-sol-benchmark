import type { PlanState, ScenarioDef, UserRelay } from '../sim/types';
import { WINDOW_S } from '../sim/constants';

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

export const MAX_USER_RELAYS = 6;
export const MAX_NAME_LENGTH = 24;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function validateRelayDraft(
  scenario: ScenarioDef,
  draft: { name: string; regionId: string; phaseDeg: number; txPowerW: number },
  existingNames: string[],
  existingCount: number,
  editingId?: string,
): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('Relay needs a designation.');
  else if (name.length > MAX_NAME_LENGTH)
    errors.push(`Designation is limited to ${MAX_NAME_LENGTH} characters.`);
  if (
    name &&
    existingNames.some((n) => n.toLowerCase() === name.toLowerCase())
  ) {
    errors.push(`“${name}” is already in use — designations must be unique.`);
  }
  const region = scenario.regions.find((r) => r.id === draft.regionId);
  if (!region) {
    errors.push('Choose a deployment region.');
  } else {
    if (
      draft.txPowerW < region.comms.minPowerW ||
      draft.txPowerW > region.comms.maxPowerW
    ) {
      errors.push(
        `TX power for ${region.label} must stay within ${region.comms.minPowerW}–${region.comms.maxPowerW} W.`,
      );
    }
  }
  if (!isFiniteNumber(draft.phaseDeg) || draft.phaseDeg < 0 || draft.phaseDeg >= 360) {
    errors.push('Orbit phase must be within 0–359°.');
  }
  if (!editingId && existingCount >= MAX_USER_RELAYS) {
    errors.push(`Deployment budget reached — at most ${MAX_USER_RELAYS} operator relays.`);
  }
  return errors;
}

function validateUserRelay(
  scenario: ScenarioDef,
  value: unknown,
  index: number,
): ValidationResult<UserRelay> {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: [`plan.userRelays[${index}] is not an object.`] };
  }
  if (typeof value.id !== 'string' || !value.id)
    errors.push(`plan.userRelays[${index}].id must be a non-empty string.`);
  if (typeof value.name !== 'string' || !value.name.trim())
    errors.push(`plan.userRelays[${index}].name must be a non-empty string.`);
  if (typeof value.regionId !== 'string' ||
    !scenario.regions.some((r) => r.id === value.regionId))
    errors.push(
      `plan.userRelays[${index}].regionId “${String(value.regionId)}” is not a deployment region of this scenario.`,
    );
  if (!isFiniteNumber(value.phaseDeg) || value.phaseDeg < 0 || value.phaseDeg >= 360)
    errors.push(`plan.userRelays[${index}].phaseDeg must be a number in [0, 360).`);
  if (!isFiniteNumber(value.txPowerW) || value.txPowerW <= 0)
    errors.push(`plan.userRelays[${index}].txPowerW must be a positive number.`);
  if (typeof value.enabled !== 'boolean')
    errors.push(`plan.userRelays[${index}].enabled must be a boolean.`);
  if (errors.length) return { ok: false, errors };
  const region = scenario.regions.find((r) => r.id === value.regionId)!;
  const power = Math.min(
    Math.max(value.txPowerW as number, region.comms.minPowerW),
    region.comms.maxPowerW,
  );
  return {
    ok: true,
    errors: [],
    value: {
      id: value.id as string,
      name: (value.name as string).trim().slice(0, MAX_NAME_LENGTH),
      regionId: value.regionId as string,
      phaseDeg: value.phaseDeg as number,
      txPowerW: power,
      enabled: value.enabled as boolean,
    },
  };
}

/** Deep-validate an untrusted PlanState (imports, storage). */
export function validatePlanState(
  scenario: ScenarioDef,
  value: unknown,
): ValidationResult<PlanState> {
  if (!isRecord(value)) return { ok: false, errors: ['plan is not an object.'] };
  const errors: string[] = [];
  const relays: UserRelay[] = [];
  if (!Array.isArray(value.userRelays)) {
    errors.push('plan.userRelays must be an array.');
  } else {
    if (value.userRelays.length > MAX_USER_RELAYS)
      errors.push(`plan.userRelays exceeds the limit of ${MAX_USER_RELAYS}.`);
    value.userRelays.forEach((r, i) => {
      const res = validateUserRelay(scenario, r, i);
      if (res.ok && res.value) relays.push(res.value);
      else errors.push(...res.errors);
    });
    const ids = new Set(relays.map((r) => r.id));
    if (ids.size !== relays.length) errors.push('plan.userRelays contains duplicate ids.');
  }

  const overrides: PlanState['overrides'] = {};
  if (value.overrides !== undefined) {
    if (!isRecord(value.overrides)) {
      errors.push('plan.overrides must be an object.');
    } else {
      for (const [assetId, o] of Object.entries(value.overrides)) {
        const asset = scenario.assets.find((a) => a.id === assetId);
        if (!asset) {
          errors.push(`plan.overrides references unknown asset “${assetId}”.`);
          continue;
        }
        if (!isRecord(o)) {
          errors.push(`plan.overrides.${assetId} is not an object.`);
          continue;
        }
        const entry: PlanState['overrides'][string] = {};
        if (o.enabled !== undefined) {
          if (typeof o.enabled !== 'boolean') {
            errors.push(`plan.overrides.${assetId}.enabled must be a boolean.`);
          } else entry.enabled = o.enabled;
        }
        if (o.txPowerW !== undefined) {
          if (!isFiniteNumber(o.txPowerW)) {
            errors.push(`plan.overrides.${assetId}.txPowerW must be a number.`);
          } else {
            entry.txPowerW = Math.min(
              Math.max(o.txPowerW, asset.comms.minPowerW),
              asset.comms.maxPowerW,
            );
          }
        }
        overrides[assetId] = entry;
      }
    }
  }

  const preferredRelay: PlanState['preferredRelay'] = {};
  if (value.preferredRelay !== undefined) {
    if (!isRecord(value.preferredRelay)) {
      errors.push('plan.preferredRelay must be an object.');
    } else {
      const knownIds = new Set([
        ...scenario.assets.map((a) => a.id),
        ...relays.map((r) => r.id),
      ]);
      for (const [assetId, relayId] of Object.entries(value.preferredRelay)) {
        if (!knownIds.has(assetId)) {
          errors.push(`plan.preferredRelay references unknown asset “${assetId}”.`);
          continue;
        }
        if (typeof relayId !== 'string' || !knownIds.has(relayId)) {
          errors.push(`plan.preferredRelay.${assetId} references unknown relay.`);
          continue;
        }
        preferredRelay[assetId] = relayId;
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], value: { userRelays: relays, overrides, preferredRelay } };
}

export function validateTime(value: unknown): number {
  if (!isFiniteNumber(value)) return 0;
  return Math.min(Math.max(value, 0), WINDOW_S);
}
