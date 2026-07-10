import type {
  AssetId,
  MissionEvent,
  PlanState,
  ScenarioDef,
} from './types';
import { SAMPLE_STEP_S, WINDOW_S } from './constants';
import { computeSnapshot } from './snapshot';

/** Refine a connectivity transition to ~2 s precision by bisection. */
function refineTransition(
  scenario: ScenarioDef,
  plan: PlanState,
  assetId: AssetId,
  lo: number,
  hi: number,
  connectedAtHi: boolean,
): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 9; i++) {
    const mid = (a + b) / 2;
    const snap = computeSnapshot(scenario, plan, mid);
    const connected = snap.routes[assetId]?.connected ?? false;
    if (connected === connectedAtHi) b = mid;
    else a = mid;
  }
  return Math.round(b);
}

const firstHopOf = (path: AssetId[]): AssetId | null =>
  path.length > 1 ? path[1] : null;
const terminalOf = (path: AssetId[]): AssetId | null =>
  path.length > 1 ? path[path.length - 1] : null;

/**
 * Derive the mission event timeline: connectivity transitions, route
 * handoffs, storms, degradations, and scripted milestones. Deterministic.
 */
export function deriveEvents(
  scenario: ScenarioDef,
  plan: PlanState,
): MissionEvent[] {
  const events: MissionEvent[] = [];
  const assetName = (id: AssetId | undefined) =>
    scenario.assets.find((a) => a.id === id)?.name ??
    plan.userRelays.find((r) => r.id === id)?.name ??
    id ??
    '';

  const critical = scenario.assets.filter((a) => a.critical);
  let prev = computeSnapshot(scenario, plan, 0);
  for (let t = SAMPLE_STEP_S; t <= WINDOW_S; t += SAMPLE_STEP_S) {
    const snap = computeSnapshot(scenario, plan, t);
    for (const asset of critical) {
      const was = prev.routes[asset.id]?.connected ?? false;
      const now = snap.routes[asset.id]?.connected ?? false;
      if (was !== now) {
        const exact = refineTransition(
          scenario,
          plan,
          asset.id,
          t - SAMPLE_STEP_S,
          t,
          now,
        );
        const inWindow = scenario.missionWindows.some(
          (w) => w.assetId === asset.id && exact >= w.startS && exact <= w.endS,
        );
        events.push({
          id: `${now ? 'aos' : 'los'}-${asset.id}-${exact}`,
          timeS: exact,
          kind: now ? 'aos' : 'los',
          severity: now ? 'info' : inWindow ? 'critical' : 'warning',
          title: now
            ? `AOS — ${asset.name} link restored`
            : `LOS — ${asset.name} contact lost`,
          detail: now
            ? `Route re-established via ${assetName(firstHopOf(snap.routes[asset.id].path) ?? undefined)}.`
            : inWindow
              ? 'Coverage gap opens inside a mission-critical window.'
              : 'No relay geometry closes a link until the next pass.',
          assetId: asset.id,
        });
      } else if (was && now) {
        const beforeHop = firstHopOf(prev.routes[asset.id].path);
        const afterHop = firstHopOf(snap.routes[asset.id].path);
        const beforeEnd = terminalOf(prev.routes[asset.id].path);
        const afterEnd = terminalOf(snap.routes[asset.id].path);
        if (beforeHop !== afterHop && beforeHop && afterHop) {
          events.push({
            id: `handoff-${asset.id}-${t}`,
            timeS: t,
            kind: 'handoff',
            severity: 'info',
            title: `Handoff — ${asset.name}`,
            detail: `Custody migrates ${assetName(beforeHop)} → ${assetName(afterHop)}.`,
            assetId: asset.id,
          });
        } else if (beforeEnd !== afterEnd && beforeEnd && afterEnd) {
          events.push({
            id: `handoff-gs-${asset.id}-${t}`,
            timeS: t,
            kind: 'handoff',
            severity: 'info',
            title: `Ground handoff — ${asset.name}`,
            detail: `Earth terminal rotates ${assetName(beforeEnd)} → ${assetName(afterEnd)}.`,
            assetId: asset.id,
          });
        }
      }
    }
    prev = snap;
  }

  // Mission windows that open with the asset already dark need their own
  // critical marker — the LOS event that caused the gap predates the window.
  for (const w of scenario.missionWindows) {
    const snap = computeSnapshot(scenario, plan, w.startS);
    if (!(snap.routes[w.assetId]?.connected ?? false)) {
      events.push({
        id: `window-gap-${w.id}`,
        timeS: w.startS,
        kind: 'window-gap',
        severity: 'critical',
        title: `${w.label} opens dark`,
        detail: `${assetName(w.assetId)} has no route to Earth as the window begins.`,
        assetId: w.assetId,
      });
    }
  }

  for (const storm of scenario.storms) {
    events.push({
      id: `storm-start-${storm.startS}`,
      timeS: storm.startS,
      kind: 'storm-start',
      severity: storm.peakDb > 18 ? 'critical' : 'warning',
      title: storm.label,
      detail: `Solar event onset — up to ${storm.peakDb.toFixed(0)} dB attenuation on sunward links.`,
    });
    events.push({
      id: `storm-end-${storm.endS}`,
      timeS: storm.endS,
      kind: 'storm-end',
      severity: 'info',
      title: 'Solar event subsides',
      detail: 'Charged-particle flux returns to background levels.',
    });
  }

  for (const d of scenario.degradations) {
    events.push({
      id: `degradation-${d.assetId}-${d.startS}`,
      timeS: d.startS,
      kind: 'degradation',
      severity: 'warning',
      title: `${assetName(d.assetId)} degraded`,
      detail: d.label,
      assetId: d.assetId,
    });
  }

  for (const s of scenario.scriptedEvents) {
    events.push({
      id: `scripted-${s.timeS}-${s.title}`,
      timeS: s.timeS,
      kind: 'scripted',
      severity: s.severity,
      title: s.title,
      detail: s.detail,
      assetId: s.assetId,
    });
  }

  return events.sort((a, b) => a.timeS - b.timeS);
}

const eventsCache = new Map<string, MissionEvent[]>();

export function deriveEventsCached(
  scenario: ScenarioDef,
  plan: PlanState,
): MissionEvent[] {
  const key = `${scenario.id}::${JSON.stringify(plan)}`;
  const hit = eventsCache.get(key);
  if (hit) return hit;
  const events = deriveEvents(scenario, plan);
  if (eventsCache.size > 24) {
    const first = eventsCache.keys().next().value;
    if (first) eventsCache.delete(first);
  }
  eventsCache.set(key, events);
  return events;
}
