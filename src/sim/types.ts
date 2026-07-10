/** Core domain types for the Asterism simulation. */

export type BodyId = 'earth' | 'moon' | 'mars';
export type Band = 'uhf' | 's' | 'x' | 'ka';
export type AssetKind = 'ground-station' | 'surface' | 'relay' | 'ship';
export type AssetId = string;
export type Severity = 'info' | 'warning' | 'critical';

export interface Vec2 {
  x: number;
  y: number;
}

/** Circular orbit around a body, in the shared 2-D mission plane. */
export interface OrbitPlacement {
  type: 'orbit';
  body: BodyId;
  radiusKm: number;
  periodS: number;
  /** Angle at T+0, degrees, measured CCW from the +x axis of the body frame. */
  phase0Deg: number;
  retrograde?: boolean;
}

/** Fixed to a body's surface; rotates with the body's spin. */
export interface SurfacePlacement {
  type: 'surface';
  body: BodyId;
  /** Surface longitude at T+0 (deg, CCW from +x). Spin carries it around. */
  longitudeDeg: number;
}

/** Vehicle on an interplanetary/cislunar transfer arc between two bodies. */
export interface TransferPlacement {
  type: 'transfer';
  from: BodyId;
  to: BodyId;
  /** Fraction of the from→to chord covered at T+0 and at T+24 h. */
  startFrac: number;
  endFrac: number;
  /** Perpendicular bow of the arc at midpoint, km (gives the track curvature). */
  bowKm: number;
}

export type Placement = OrbitPlacement | SurfacePlacement | TransferPlacement;

export interface CommsSpec {
  bands: Band[];
  /** Antenna/system figure of merit, dB (toy units — see README). */
  gainDb: number;
  txPowerW: number;
  minPowerW: number;
  maxPowerW: number;
  /** Peak deliverable data rate, Mbps, before quality scaling. */
  dataRateMbps: number;
  /** Attenuation applied to solar-storm interference, dB. */
  shieldingDb?: number;
}

export interface AssetDef {
  id: AssetId;
  name: string;
  /** Compact label for the map; falls back to `name`. */
  shortName?: string;
  kind: AssetKind;
  placement: Placement;
  comms: CommsSpec;
  /** One-line mission role shown in the inspector. */
  role: string;
  /** Mission-critical assets must hold a route to the Earth ground network. */
  critical?: boolean;
  /** Route sink — part of the terrestrial mission network. */
  isEarthTerminal?: boolean;
  initiallyEnabled?: boolean;
}

export interface StormWindow {
  startS: number;
  endS: number;
  peakDb: number;
  label: string;
}

export interface Degradation {
  assetId: AssetId;
  startS: number;
  endS: number;
  /** Health during the window, 0..1 (1 = nominal). */
  health: number;
  label: string;
}

/** A mission-critical coverage requirement for one asset. */
export interface MissionWindow {
  id: string;
  assetId: AssetId;
  startS: number;
  endS: number;
  label: string;
}

export interface ScriptedEvent {
  timeS: number;
  severity: Severity;
  title: string;
  detail: string;
  assetId?: AssetId;
}

/** Where user relays may be deployed in a given scenario. */
export interface DeploymentRegion {
  id: string;
  label: string;
  body: BodyId;
  radiusKm: number;
  periodS: number;
  /** Template comms fit for hardware deployable in this region. */
  comms: Omit<CommsSpec, 'txPowerW'> & { defaultPowerW: number };
  note: string;
}

export interface BodyConfig {
  /** Moon orbit around Earth. */
  moonOrbitRadiusKm: number;
  moonOrbitPeriodS: number;
  moonPhase0Deg: number;
  /** Mars treated as fixed over a 24 h window. */
  marsRangeKm: number;
  marsAngleDeg: number;
  /** Spin (sidereal-ish) periods and meridian phases at T+0. */
  earthSpinPeriodS: number;
  earthSpinPhase0Deg: number;
  marsSpinPeriodS: number;
  marsSpinPhase0Deg: number;
}

/** Display-layout hints (SVG viewBox units) — presentation only. */
export interface ScenarioLayout {
  earthPx: Vec2;
  marsPx: Vec2 | null;
  moonOrbitPx: number;
  earthRPx: number;
  moonRPx: number;
  marsRPx: number;
  /** Piecewise map physical orbit radius (km) → display ring radius (px). */
  orbitRingsPx: Record<BodyId, Array<[km: number, px: number]>>;
}

export interface ScenarioDef {
  id: string;
  name: string;
  epochLabel: string;
  briefing: string;
  priorities: string[];
  sunDirectionDeg: number;
  bodies: BodyConfig;
  assets: AssetDef[];
  regions: DeploymentRegion[];
  storms: StormWindow[];
  degradations: Degradation[];
  missionWindows: MissionWindow[];
  scriptedEvents: ScriptedEvent[];
  layout: ScenarioLayout;
  /** Sim time the console opens at. */
  defaultTimeS: number;
}

/** A user-added relay in the plan. */
export interface UserRelay {
  id: AssetId;
  name: string;
  regionId: string;
  phaseDeg: number;
  txPowerW: number;
  enabled: boolean;
}

export interface AssetOverride {
  enabled?: boolean;
  txPowerW?: number;
}

export interface PlanState {
  userRelays: UserRelay[];
  overrides: Record<AssetId, AssetOverride>;
  /** Preferred first-hop relay per mission asset (routing bias). */
  preferredRelay: Record<AssetId, AssetId>;
}

export interface EffectiveAsset extends AssetDef {
  enabled: boolean;
  userCreated: boolean;
  regionId?: string;
}

export type BlockReason = 'los' | 'disabled' | 'weak' | null;

export interface LinkState {
  id: string;
  a: AssetId;
  b: AssetId;
  band: Band;
  distanceKm: number;
  available: boolean;
  blocked: BlockReason;
  scoreDb: number;
  quality: number;
  latencyS: number;
  reliability: number;
  bandwidthMbps: number;
  stormDb: number;
}

export interface RouteState {
  assetId: AssetId;
  connected: boolean;
  /** Path from the asset to the Earth terminal, inclusive. */
  path: AssetId[];
  latencyS: number;
  reliability: number;
  bottleneckMbps: number;
  hops: number;
}

export interface Alert {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  assetId?: AssetId;
}

export interface SimSnapshot {
  timeS: number;
  bodyCenters: Record<BodyId, Vec2>;
  positions: Record<AssetId, Vec2>;
  assets: EffectiveAsset[];
  links: LinkState[];
  routes: Record<AssetId, RouteState>;
  alerts: Alert[];
  stormDb: number;
}

export type EventKind =
  | 'aos'
  | 'los'
  | 'handoff'
  | 'storm-start'
  | 'storm-end'
  | 'degradation'
  | 'window-gap'
  | 'scripted';

export interface MissionEvent {
  id: string;
  timeS: number;
  kind: EventKind;
  severity: Severity;
  title: string;
  detail: string;
  assetId?: AssetId;
}

export interface CoverageSample {
  timeS: number;
  /** Fraction of enabled critical assets with a route to Earth. */
  covered: number;
  /** True if a mission-critical window is violated at this sample. */
  criticalGap: boolean;
}

export interface PerAssetMetrics {
  assetId: AssetId;
  name: string;
  coveragePct: number;
  meanLatencyS: number;
  meanReliability: number;
}

export interface PlanMetrics {
  coveragePct: number;
  meanLatencyS: number;
  meanReliability: number;
  energyKWh: number;
  uncoveredWindows: number;
  totalWindows: number;
  activeRelays: number;
  perAsset: PerAssetMetrics[];
  samples: CoverageSample[];
}
