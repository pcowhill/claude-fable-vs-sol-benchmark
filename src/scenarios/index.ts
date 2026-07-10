import type { ScenarioDef } from '../sim/types';
import { lunarSouthPole } from './lunarSouthPole';
import { marsTransfer } from './marsTransfer';
import { solarStorm } from './solarStorm';

export const scenarios: ScenarioDef[] = [lunarSouthPole, marsTransfer, solarStorm];

export const DEFAULT_SCENARIO_ID = lunarSouthPole.id;

export function getScenario(id: string): ScenarioDef {
  const found = scenarios.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return found;
}

export function isScenarioId(id: string): boolean {
  return scenarios.some((s) => s.id === id);
}
