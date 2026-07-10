import type {
  AssetId,
  CoverageSample,
  EffectiveAsset,
  PlanMetrics,
  PlanState,
  RouteState,
  ScenarioDef,
} from './types';
import { RELAY_IDLE_FRACTION, SAMPLE_STEP_S, WINDOW_S } from './constants';
import { effectiveAssets } from './plan';
import { assetPositions } from './positions';
import { computeLinks } from './links';
import { computeRoutes } from './routing';

interface SampleFrame {
  timeS: number;
  routes: Record<AssetId, RouteState>;
  assets: EffectiveAsset[];
}

function sampleFrames(scenario: ScenarioDef, plan: PlanState): SampleFrame[] {
  const frames: SampleFrame[] = [];
  const assets = effectiveAssets(scenario, plan);
  for (let t = 0; t <= WINDOW_S; t += SAMPLE_STEP_S) {
    const { centers, positions } = assetPositions(scenario, assets, t);
    const links = computeLinks({
      scenario,
      assets,
      positions,
      centers,
      timeS: t,
    });
    frames.push({ timeS: t, routes: computeRoutes(assets, links, plan), assets });
  }
  return frames;
}

/** Aggregate 24 h plan metrics. Deterministic in (scenario, plan). */
export function computeMetrics(scenario: ScenarioDef, plan: PlanState): PlanMetrics {
  const frames = sampleFrames(scenario, plan);
  const assets = frames[0].assets;
  const critical = assets.filter((a) => a.critical);
  const relays = assets.filter((a) => a.kind === 'relay');

  const perAsset = critical.map((asset) => {
    let covered = 0;
    let latencySum = 0;
    let reliabilitySum = 0;
    for (const f of frames) {
      const r = f.routes[asset.id];
      if (r?.connected) {
        covered++;
        latencySum += r.latencyS;
        reliabilitySum += r.reliability;
      }
    }
    return {
      assetId: asset.id,
      name: asset.name,
      coveragePct: (covered / frames.length) * 100,
      meanLatencyS: covered ? latencySum / covered : 0,
      meanReliability: covered ? reliabilitySum / covered : 0,
    };
  });

  const samples: CoverageSample[] = frames.map((f) => {
    const active = critical.filter((a) => a.enabled);
    const connected = active.filter((a) => f.routes[a.id]?.connected).length;
    const criticalGap = scenario.missionWindows.some(
      (w) =>
        f.timeS >= w.startS &&
        f.timeS <= w.endS &&
        !f.routes[w.assetId]?.connected,
    );
    return {
      timeS: f.timeS,
      covered: active.length ? connected / active.length : critical.length ? 0 : 1,
      criticalGap,
    };
  });

  // Energy: enabled relays draw idle power always, full TX power while
  // carrying at least one route. Ground stations are grid-powered.
  let energyWh = 0;
  for (const f of frames) {
    const carrying = new Set<AssetId>();
    for (const r of Object.values(f.routes)) {
      for (const id of r.path) carrying.add(id);
    }
    for (const relay of relays) {
      if (!relay.enabled) continue;
      const w = carrying.has(relay.id)
        ? relay.comms.txPowerW
        : relay.comms.txPowerW * RELAY_IDLE_FRACTION;
      energyWh += (w * SAMPLE_STEP_S) / 3600;
    }
  }

  const uncovered = scenario.missionWindows.filter((w) =>
    frames.some(
      (f) =>
        f.timeS >= w.startS &&
        f.timeS <= w.endS &&
        !f.routes[w.assetId]?.connected,
    ),
  );

  const connectedFrames = perAsset.reduce(
    (acc, a) => acc + (a.coveragePct / 100) * frames.length,
    0,
  );
  const meanLatencyS = connectedFrames
    ? perAsset.reduce(
        (acc, a) => acc + a.meanLatencyS * (a.coveragePct / 100) * frames.length,
        0,
      ) / connectedFrames
    : 0;
  const meanReliability = connectedFrames
    ? perAsset.reduce(
        (acc, a) =>
          acc + a.meanReliability * (a.coveragePct / 100) * frames.length,
        0,
      ) / connectedFrames
    : 0;

  return {
    coveragePct: perAsset.length
      ? perAsset.reduce((acc, a) => acc + a.coveragePct, 0) / perAsset.length
      : 100,
    meanLatencyS,
    meanReliability,
    energyKWh: energyWh / 1000,
    uncoveredWindows: uncovered.length,
    totalWindows: scenario.missionWindows.length,
    activeRelays: relays.filter((r) => r.enabled).length,
    perAsset,
    samples,
  };
}

const metricsCache = new Map<string, PlanMetrics>();

export function metricsKey(scenario: ScenarioDef, plan: PlanState): string {
  return `${scenario.id}::${JSON.stringify(plan)}`;
}

export function computeMetricsCached(
  scenario: ScenarioDef,
  plan: PlanState,
): PlanMetrics {
  const key = metricsKey(scenario, plan);
  const hit = metricsCache.get(key);
  if (hit) return hit;
  const metrics = computeMetrics(scenario, plan);
  if (metricsCache.size > 24) {
    const first = metricsCache.keys().next().value;
    if (first) metricsCache.delete(first);
  }
  metricsCache.set(key, metrics);
  return metrics;
}
