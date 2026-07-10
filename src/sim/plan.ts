import type {
  AssetDef,
  EffectiveAsset,
  PlanState,
  ScenarioDef,
  UserRelay,
} from './types';

export const emptyPlan = (): PlanState => ({
  userRelays: [],
  overrides: {},
  preferredRelay: {},
});

export function userRelayToAsset(
  relay: UserRelay,
  scenario: ScenarioDef,
): EffectiveAsset | null {
  const region = scenario.regions.find((r) => r.id === relay.regionId);
  if (!region) return null;
  const { defaultPowerW, ...comms } = region.comms;
  void defaultPowerW;
  return {
    id: relay.id,
    name: relay.name,
    kind: 'relay',
    role: `Operator-deployed relay · ${region.label}`,
    placement: {
      type: 'orbit',
      body: region.body,
      radiusKm: region.radiusKm,
      periodS: region.periodS,
      phase0Deg: relay.phaseDeg,
    },
    comms: { ...comms, txPowerW: relay.txPowerW },
    enabled: relay.enabled,
    userCreated: true,
    regionId: region.id,
  };
}

function applyOverride(asset: AssetDef, plan: PlanState): EffectiveAsset {
  const o = plan.overrides[asset.id] ?? {};
  return {
    ...asset,
    comms: {
      ...asset.comms,
      txPowerW: o.txPowerW ?? asset.comms.txPowerW,
    },
    enabled: o.enabled ?? asset.initiallyEnabled ?? true,
    userCreated: false,
  };
}

/** Compose scenario assets with plan overrides and user relays. */
export function effectiveAssets(
  scenario: ScenarioDef,
  plan: PlanState,
): EffectiveAsset[] {
  const seeded = scenario.assets.map((a) => applyOverride(a, plan));
  const added = plan.userRelays
    .map((r) => userRelayToAsset(r, scenario))
    .filter((a): a is EffectiveAsset => a !== null);
  return [...seeded, ...added];
}
