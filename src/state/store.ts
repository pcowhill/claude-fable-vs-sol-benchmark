import { create } from 'zustand';
import type { PlanState, UserRelay } from '../sim/types';
import { WINDOW_S } from '../sim/constants';
import { emptyPlan } from '../sim/plan';
import { DEFAULT_SCENARIO_ID, getScenario, isScenarioId } from '../scenarios';
import {
  clearScenarioState,
  loadActiveScenarioId,
  loadScenarioState,
  saveScenarioState,
} from './persistence';
import { parseImport, serializePlan, type BaselineRecord } from './importExport';
import { validateRelayDraft } from './validate';

export type Selection =
  | { kind: 'asset'; id: string }
  | { kind: 'link'; id: string };

export type RightTab = 'inspect' | 'plan' | 'compare';
export type DialogId = 'shortcuts' | 'import' | 'reset-confirm' | null;

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'success';
  undoLabel?: string;
  undo?: () => void;
}

export interface RelayDraft {
  name: string;
  regionId: string;
  phaseDeg: number;
  txPowerW: number;
}

/** Ghost preview of a relay being placed (rendered on the map). */
export interface PlanDraftPreview {
  regionId: string;
  phaseDeg: number;
}

export interface AsterismState {
  scenarioId: string;
  timeS: number;
  playing: boolean;
  /** Sim seconds per wall-clock second. */
  speed: number;
  selection: Selection | null;
  rightTab: RightTab;
  dialog: DialogId;
  plan: PlanState;
  baseline: BaselineRecord | null;
  relayCounter: number;
  toasts: Toast[];
  reducedMotion: boolean;
  planDraft: PlanDraftPreview | null;
  setPlanDraft(draft: PlanDraftPreview | null): void;

  setScenario(id: string): void;
  setTime(timeS: number): void;
  stepTime(deltaS: number): void;
  tick(wallDtS: number): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): void;
  setSpeed(speed: number): void;
  select(sel: Selection | null): void;
  setRightTab(tab: RightTab): void;
  setDialog(dialog: DialogId): void;

  addRelay(draft: RelayDraft): { ok: boolean; errors: string[]; id?: string };
  updateRelay(id: string, patch: Partial<Omit<UserRelay, 'id'>>): {
    ok: boolean;
    errors: string[];
  };
  removeRelay(id: string): void;
  setAssetEnabled(assetId: string, enabled: boolean): void;
  setAssetPower(assetId: string, txPowerW: number): void;
  setPreferredRelay(assetId: string, relayId: string | null): void;

  saveBaseline(): void;
  clearBaseline(): void;
  restoreBaseline(): void;
  resetScenario(): void;

  exportJson(): string;
  importJson(text: string): { ok: boolean; errors: string[] };

  pushToast(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
}

let toastCounter = 0;

function loadInitial(): {
  scenarioId: string;
  plan: PlanState;
  baseline: BaselineRecord | null;
  timeS: number;
} {
  const activeId = loadActiveScenarioId();
  const scenarioId =
    activeId && isScenarioId(activeId) ? activeId : DEFAULT_SCENARIO_ID;
  const stored = loadScenarioState(scenarioId);
  const scenario = getScenario(scenarioId);
  return {
    scenarioId,
    plan: stored?.plan ?? emptyPlan(),
    baseline: stored?.baseline ?? null,
    timeS: stored?.timeS ?? scenario.defaultTimeS,
  };
}

function nextRelayCounter(plan: PlanState): number {
  let max = 0;
  for (const r of plan.userRelays) {
    const m = /^user-relay-(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export const useStore = create<AsterismState>()((set, get) => {
  const initial = loadInitial();

  const persist = () => {
    const s = get();
    saveScenarioState(s.scenarioId, {
      plan: s.plan,
      baseline: s.baseline,
      timeS: s.timeS,
    });
  };

  return {
    scenarioId: initial.scenarioId,
    timeS: initial.timeS,
    playing: false,
    speed: 300,
    selection: null,
    rightTab: 'inspect',
    dialog: null,
    plan: initial.plan,
    baseline: initial.baseline,
    relayCounter: nextRelayCounter(initial.plan),
    toasts: [],
    planDraft: null,
    setPlanDraft(planDraft) {
      set({ planDraft });
    },
    reducedMotion:
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,

    setScenario(id) {
      if (!isScenarioId(id) || id === get().scenarioId) return;
      persist();
      const stored = loadScenarioState(id);
      const scenario = getScenario(id);
      set({
        scenarioId: id,
        plan: stored?.plan ?? emptyPlan(),
        baseline: stored?.baseline ?? null,
        timeS: stored?.timeS ?? scenario.defaultTimeS,
        selection: null,
        playing: false,
        relayCounter: nextRelayCounter(stored?.plan ?? emptyPlan()),
      });
      persist();
    },

    setTime(timeS) {
      set({ timeS: Math.min(Math.max(timeS, 0), WINDOW_S) });
    },
    stepTime(deltaS) {
      get().setTime(get().timeS + deltaS);
    },
    tick(wallDtS) {
      const s = get();
      if (!s.playing) return;
      const next = s.timeS + wallDtS * s.speed;
      if (next >= WINDOW_S) {
        set({ timeS: WINDOW_S, playing: false });
      } else {
        set({ timeS: next });
      }
    },
    setPlaying(playing) {
      const s = get();
      // Restart from T+0 when playing again at the end of the window.
      if (playing && s.timeS >= WINDOW_S) set({ timeS: 0, playing: true });
      else set({ playing });
    },
    togglePlaying() {
      get().setPlaying(!get().playing);
    },
    setSpeed(speed) {
      set({ speed });
    },
    select(selection) {
      set((s) => ({
        selection,
        rightTab: selection ? 'inspect' : s.rightTab,
      }));
    },
    setRightTab(rightTab) {
      set({ rightTab });
    },
    setDialog(dialog) {
      set({ dialog });
    },

    addRelay(draft) {
      const s = get();
      const scenario = getScenario(s.scenarioId);
      const existingNames = [
        ...scenario.assets.map((a) => a.name),
        ...s.plan.userRelays.map((r) => r.name),
      ];
      const errors = validateRelayDraft(
        scenario,
        draft,
        existingNames,
        s.plan.userRelays.length,
      );
      if (errors.length) return { ok: false, errors };
      const id = `user-relay-${s.relayCounter}`;
      const relay: UserRelay = {
        id,
        name: draft.name.trim(),
        regionId: draft.regionId,
        phaseDeg: draft.phaseDeg,
        txPowerW: draft.txPowerW,
        enabled: true,
      };
      set({
        plan: { ...s.plan, userRelays: [...s.plan.userRelays, relay] },
        relayCounter: s.relayCounter + 1,
        selection: { kind: 'asset', id },
      });
      persist();
      get().pushToast({
        message: `${relay.name} deployed to ${scenario.regions.find((r) => r.id === draft.regionId)?.label ?? draft.regionId}.`,
        tone: 'success',
      });
      return { ok: true, errors: [], id };
    },

    updateRelay(id, patch) {
      const s = get();
      const scenario = getScenario(s.scenarioId);
      const current = s.plan.userRelays.find((r) => r.id === id);
      if (!current) return { ok: false, errors: ['Relay no longer exists.'] };
      const next = { ...current, ...patch };
      const otherNames = [
        ...scenario.assets.map((a) => a.name),
        ...s.plan.userRelays.filter((r) => r.id !== id).map((r) => r.name),
      ];
      const errors = validateRelayDraft(
        scenario,
        next,
        otherNames,
        s.plan.userRelays.length,
        id,
      );
      if (errors.length) return { ok: false, errors };
      set({
        plan: {
          ...s.plan,
          userRelays: s.plan.userRelays.map((r) => (r.id === id ? next : r)),
        },
      });
      persist();
      return { ok: true, errors: [] };
    },

    removeRelay(id) {
      const s = get();
      const relay = s.plan.userRelays.find((r) => r.id === id);
      if (!relay) return;
      const index = s.plan.userRelays.findIndex((r) => r.id === id);
      const preferredRelay = Object.fromEntries(
        Object.entries(s.plan.preferredRelay).filter(([, v]) => v !== id),
      );
      set({
        plan: {
          ...s.plan,
          userRelays: s.plan.userRelays.filter((r) => r.id !== id),
          preferredRelay,
        },
        selection:
          s.selection?.kind === 'asset' && s.selection.id === id
            ? null
            : s.selection,
      });
      persist();
      get().pushToast({
        message: `${relay.name} decommissioned.`,
        tone: 'info',
        undoLabel: 'Undo',
        undo: () => {
          const cur = get();
          const relays = [...cur.plan.userRelays];
          relays.splice(Math.min(index, relays.length), 0, relay);
          set({ plan: { ...cur.plan, userRelays: relays } });
          persist();
        },
      });
    },

    setAssetEnabled(assetId, enabled) {
      const s = get();
      const userRelay = s.plan.userRelays.find((r) => r.id === assetId);
      if (userRelay) {
        set({
          plan: {
            ...s.plan,
            userRelays: s.plan.userRelays.map((r) =>
              r.id === assetId ? { ...r, enabled } : r,
            ),
          },
        });
      } else {
        set({
          plan: {
            ...s.plan,
            overrides: {
              ...s.plan.overrides,
              [assetId]: { ...s.plan.overrides[assetId], enabled },
            },
          },
        });
      }
      persist();
    },

    setAssetPower(assetId, txPowerW) {
      const s = get();
      const userRelay = s.plan.userRelays.find((r) => r.id === assetId);
      if (userRelay) {
        set({
          plan: {
            ...s.plan,
            userRelays: s.plan.userRelays.map((r) =>
              r.id === assetId ? { ...r, txPowerW } : r,
            ),
          },
        });
      } else {
        const scenario = getScenario(s.scenarioId);
        const asset = scenario.assets.find((a) => a.id === assetId);
        if (!asset) return;
        const clamped = Math.min(
          Math.max(txPowerW, asset.comms.minPowerW),
          asset.comms.maxPowerW,
        );
        set({
          plan: {
            ...s.plan,
            overrides: {
              ...s.plan.overrides,
              [assetId]: { ...s.plan.overrides[assetId], txPowerW: clamped },
            },
          },
        });
      }
      persist();
    },

    setPreferredRelay(assetId, relayId) {
      const s = get();
      const preferredRelay = { ...s.plan.preferredRelay };
      if (relayId === null) delete preferredRelay[assetId];
      else preferredRelay[assetId] = relayId;
      set({ plan: { ...s.plan, preferredRelay } });
      persist();
    },

    saveBaseline() {
      const s = get();
      const label = `Baseline · saved at mission clock ${Math.floor(s.timeS / 3600)
        .toString()
        .padStart(2, '0')}:${Math.floor((s.timeS % 3600) / 60)
        .toString()
        .padStart(2, '0')}`;
      set({
        baseline: {
          plan: JSON.parse(JSON.stringify(s.plan)) as PlanState,
          label,
        },
      });
      persist();
      get().pushToast({ message: 'Plan captured as baseline.', tone: 'success' });
    },

    clearBaseline() {
      set({ baseline: null });
      persist();
      get().pushToast({ message: 'Baseline cleared.', tone: 'info' });
    },

    restoreBaseline() {
      const s = get();
      if (!s.baseline) return;
      const previous = JSON.parse(JSON.stringify(s.plan)) as PlanState;
      set({
        plan: JSON.parse(JSON.stringify(s.baseline.plan)) as PlanState,
        relayCounter: nextRelayCounter(s.baseline.plan),
      });
      persist();
      get().pushToast({
        message: 'Working plan reverted to baseline.',
        tone: 'info',
        undoLabel: 'Undo',
        undo: () => {
          set({ plan: previous, relayCounter: nextRelayCounter(previous) });
          persist();
        },
      });
    },

    resetScenario() {
      const s = get();
      const scenario = getScenario(s.scenarioId);
      clearScenarioState(s.scenarioId);
      set({
        plan: emptyPlan(),
        baseline: null,
        timeS: scenario.defaultTimeS,
        selection: null,
        playing: false,
        relayCounter: 1,
        dialog: null,
      });
      persist();
      get().pushToast({
        message: `${scenario.name} restored to seeded state.`,
        tone: 'info',
      });
    },

    exportJson() {
      const s = get();
      return serializePlan({
        scenarioId: s.scenarioId,
        timeS: s.timeS,
        plan: s.plan,
        baseline: s.baseline,
      });
    },

    importJson(text) {
      const res = parseImport(text);
      if (!res.ok || !res.value) return { ok: false, errors: res.errors };
      const { scenarioId, timeS, plan, baseline } = res.value;
      set({
        scenarioId,
        plan,
        baseline,
        timeS,
        selection: null,
        playing: false,
        relayCounter: nextRelayCounter(plan),
        dialog: null,
      });
      persist();
      get().pushToast({
        message: `Plan imported into ${getScenario(scenarioId).name}.`,
        tone: 'success',
      });
      return { ok: true, errors: [] };
    },

    pushToast(toast) {
      const id = ++toastCounter;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { ...toast, id }] }));
      // Toasts self-dismiss; undo toasts linger longer.
      const ttl = toast.undo ? 8000 : 4200;
      if (typeof window !== 'undefined') {
        window.setTimeout(() => get().dismissToast(id), ttl);
      }
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },
  };
});

/** Convenience selector for the active scenario definition. */
export const useScenario = () => {
  const id = useStore((s) => s.scenarioId);
  return getScenario(id);
};
