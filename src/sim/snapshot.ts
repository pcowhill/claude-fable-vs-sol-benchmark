import type {
  Alert,
  EffectiveAsset,
  PlanState,
  ScenarioDef,
  SimSnapshot,
} from './types';
import { effectiveAssets } from './plan';
import { assetPositions } from './positions';
import { computeLinks, healthAt, stormSeverityDb } from './links';
import { computeRoutes } from './routing';

function activeAlerts(
  scenario: ScenarioDef,
  assets: EffectiveAsset[],
  snapshot: Pick<SimSnapshot, 'routes' | 'stormDb'>,
  timeS: number,
): Alert[] {
  const alerts: Alert[] = [];
  if (snapshot.stormDb > 0.5) {
    const cls = snapshot.stormDb > 18 ? 'severe' : 'moderate';
    alerts.push({
      id: 'storm',
      severity: snapshot.stormDb > 18 ? 'critical' : 'warning',
      title: `Solar radio event in progress (${cls})`,
      detail: `Charged-particle flux attenuating sunward links by ~${snapshot.stormDb.toFixed(0)} dB.`,
    });
  }
  for (const asset of assets) {
    if (!asset.critical) continue;
    const inWindow = scenario.missionWindows.find(
      (w) => w.assetId === asset.id && timeS >= w.startS && timeS <= w.endS,
    );
    if (!asset.enabled) {
      alerts.push({
        id: `disabled-${asset.id}`,
        severity: inWindow ? 'critical' : 'warning',
        title: `${asset.name} is offline`,
        detail: 'Asset disabled in the current relay plan.',
        assetId: asset.id,
      });
      continue;
    }
    const route = snapshot.routes[asset.id];
    if (route && !route.connected) {
      alerts.push({
        id: `nolink-${asset.id}`,
        severity: inWindow ? 'critical' : 'warning',
        title: inWindow
          ? `${asset.name} dark during “${inWindow.label}”`
          : `${asset.name} has no route to Earth`,
        detail: inWindow
          ? 'Mission-critical window is currently uncovered.'
          : 'No relay geometry currently closes a link.',
        assetId: asset.id,
      });
    }
  }
  for (const d of scenario.degradations) {
    if (timeS >= d.startS && timeS <= d.endS) {
      const asset = assets.find((a) => a.id === d.assetId);
      if (asset && healthAt(scenario.degradations, d.assetId, timeS) < 1) {
        alerts.push({
          id: `degraded-${d.assetId}`,
          severity: 'warning',
          title: `${asset.name} degraded`,
          detail: d.label,
          assetId: d.assetId,
        });
      }
    }
  }
  const order = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((x, y) => order[x.severity] - order[y.severity]);
}

/** Full deterministic state of the mission at one moment. */
export function computeSnapshot(
  scenario: ScenarioDef,
  plan: PlanState,
  timeS: number,
): SimSnapshot {
  const assets = effectiveAssets(scenario, plan);
  const { centers, positions } = assetPositions(scenario, assets, timeS);
  const links = computeLinks({ scenario, assets, positions, centers, timeS });
  const routes = computeRoutes(assets, links, plan);
  const stormDb = stormSeverityDb(scenario.storms, timeS);
  const partial = { routes, stormDb };
  return {
    timeS,
    bodyCenters: centers,
    positions,
    assets,
    links,
    routes,
    stormDb,
    alerts: activeAlerts(scenario, assets, partial, timeS),
  };
}
