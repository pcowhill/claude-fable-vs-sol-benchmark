import type {
  AssetId,
  Band,
  BodyId,
  Degradation,
  EffectiveAsset,
  LinkState,
  ScenarioDef,
  StormWindow,
  Vec2,
} from './types';
import {
  BAND_PARAMS,
  BAND_PREFERENCE,
  HEALTH_PENALTY_DB,
  HOP_PROCESSING_S,
  MIN_ELEVATION_DEG,
  MIN_LINK_QUALITY,
  NOISE_FLOOR_DB,
  OCCULT_MARGIN,
  SCORE_CEIL_DB,
  SCORE_FLOOR_DB,
  SPEED_OF_LIGHT_KM_S,
} from './constants';
import { BODY_RADIUS_KM } from './positions';
import { clamp, dist, distPointSegment, dot, fromAngleDeg, norm, smoothstep, sub } from './vec';

export const linkId = (a: AssetId, b: AssetId): string =>
  a < b ? `${a}::${b}` : `${b}::${a}`;

/** Which asset pairs may ever attempt a link (band overlap + role rules). */
export function canLink(a: EffectiveAsset, b: EffectiveAsset): Band | null {
  if (a.id === b.id) return null;
  // Two Earth terminals are joined by the terrestrial network, not RF.
  if (a.isEarthTerminal && b.isEarthTerminal) return null;
  // Surface-to-surface only on the same body (short-range field network).
  if (a.placement.type === 'surface' && b.placement.type === 'surface') {
    if (a.placement.body !== b.placement.body) return null;
    if (a.isEarthTerminal || b.isEarthTerminal) return null;
  }
  for (const band of BAND_PREFERENCE) {
    if (a.comms.bands.includes(band) && b.comms.bands.includes(band)) return band;
  }
  return null;
}

/** True when the segment between two positions is not occulted by any body. */
export function hasLineOfSight(
  a: EffectiveAsset,
  b: EffectiveAsset,
  pa: Vec2,
  pb: Vec2,
  centers: Record<BodyId, Vec2>,
): boolean {
  const bodies: BodyId[] = ['earth', 'moon', 'mars'];
  // Horizon check for surface assets: target must be above the local horizon.
  for (const [asset, pos, other] of [
    [a, pa, pb],
    [b, pb, pa],
  ] as const) {
    if (asset.placement.type === 'surface') {
      const body = asset.placement.body;
      const normal = norm(sub(pos, centers[body]));
      const toTarget = norm(sub(other, pos));
      const sinElev = dot(normal, toTarget);
      // Same-body surface pairs: allow shallow grazing field links.
      const otherAsset = asset === a ? b : a;
      const sameBodySurface =
        otherAsset.placement.type === 'surface' &&
        otherAsset.placement.body === body;
      const minSin = sameBodySurface
        ? -0.08
        : Math.sin((MIN_ELEVATION_DEG * Math.PI) / 180);
      if (sinElev < minSin) return false;
    }
  }
  for (const body of bodies) {
    const r = BODY_RADIUS_KM[body] * OCCULT_MARGIN;
    // Skip occlusion by a body an endpoint is standing on (horizon handles it).
    const aOn = a.placement.type === 'surface' && a.placement.body === body;
    const bOn = b.placement.type === 'surface' && b.placement.body === body;
    if (aOn || bOn) continue;
    if (distPointSegment(centers[body], pa, pb) < r) return false;
  }
  return true;
}

/** Piecewise storm severity (dB) with smooth ramps at window edges. */
export function stormSeverityDb(storms: StormWindow[], timeS: number): number {
  let worst = 0;
  for (const w of storms) {
    if (timeS < w.startS || timeS > w.endS) continue;
    const span = w.endS - w.startS;
    const ramp = Math.min(1, span / 6) * 0.15 * span; // 15% ramp each side
    const tIn = clamp((timeS - w.startS) / Math.max(ramp, 1), 0, 1);
    const tOut = clamp((w.endS - timeS) / Math.max(ramp, 1), 0, 1);
    worst = Math.max(worst, w.peakDb * smoothstep(tIn) * smoothstep(tOut));
  }
  return worst;
}

/** Storm attenuation on one link: geometry-weighted, reduced by shielding. */
export function linkStormDb(
  severityDb: number,
  sunDirectionDeg: number,
  pa: Vec2,
  pb: Vec2,
  a: EffectiveAsset,
  b: EffectiveAsset,
): number {
  if (severityDb <= 0) return 0;
  const sun = fromAngleDeg(sunDirectionDeg);
  const d = norm(sub(pb, pa));
  const alignment = Math.abs(d.x * sun.x + d.y * sun.y);
  const geometric = 0.35 + 0.65 * alignment * alignment;
  const shielding = ((a.comms.shieldingDb ?? 0) + (b.comms.shieldingDb ?? 0)) / 2;
  return Math.max(0, severityDb * geometric - shielding);
}

export function healthAt(
  degradations: Degradation[],
  assetId: AssetId,
  timeS: number,
): number {
  let health = 1;
  for (const d of degradations) {
    if (d.assetId === assetId && timeS >= d.startS && timeS <= d.endS) {
      health = Math.min(health, d.health);
    }
  }
  return health;
}

export const powerDb = (w: number): number => 10 * Math.log10(Math.max(w, 0.1));

/** Toy link budget → score in dB. Deterministic in all inputs. */
export function linkScoreDb(
  a: EffectiveAsset,
  b: EffectiveAsset,
  band: Band,
  distanceKm: number,
  stormDb: number,
  healthA: number,
  healthB: number,
): number {
  const terminalA = powerDb(a.comms.txPowerW) + a.comms.gainDb;
  const terminalB = powerDb(b.comms.txPowerW) + b.comms.gainDb;
  const pathLoss = 20 * Math.log10(Math.max(distanceKm, 1) / 1000);
  const healthLoss = (2 - healthA - healthB) * HEALTH_PENALTY_DB;
  return (
    terminalA +
    terminalB -
    pathLoss +
    BAND_PARAMS[band].bonusDb -
    stormDb -
    healthLoss -
    NOISE_FLOOR_DB
  );
}

export const scoreToQuality = (scoreDb: number): number =>
  smoothstep((scoreDb - SCORE_FLOOR_DB) / (SCORE_CEIL_DB - SCORE_FLOOR_DB));

export interface LinkComputeContext {
  scenario: ScenarioDef;
  assets: EffectiveAsset[];
  positions: Record<AssetId, Vec2>;
  centers: Record<BodyId, Vec2>;
  timeS: number;
}

/** Compute every candidate link's state at a moment in time. */
export function computeLinks(ctx: LinkComputeContext): LinkState[] {
  const { scenario, assets, positions, centers, timeS } = ctx;
  const severity = stormSeverityDb(scenario.storms, timeS);
  const links: LinkState[] = [];
  for (let i = 0; i < assets.length; i++) {
    for (let j = i + 1; j < assets.length; j++) {
      const a = assets[i];
      const b = assets[j];
      const band = canLink(a, b);
      if (!band) continue;
      const pa = positions[a.id];
      const pb = positions[b.id];
      const distanceKm = dist(pa, pb);
      const enabled = a.enabled && b.enabled;
      const los = hasLineOfSight(a, b, pa, pb, centers);
      const stormDb = linkStormDb(
        severity,
        scenario.sunDirectionDeg,
        pa,
        pb,
        a,
        b,
      );
      const hA = healthAt(scenario.degradations, a.id, timeS);
      const hB = healthAt(scenario.degradations, b.id, timeS);
      const scoreDb = linkScoreDb(a, b, band, distanceKm, stormDb, hA, hB);
      const quality = scoreToQuality(scoreDb);
      let blocked: LinkState['blocked'] = null;
      if (!enabled) blocked = 'disabled';
      else if (!los) blocked = 'los';
      else if (quality < MIN_LINK_QUALITY) blocked = 'weak';
      const available = blocked === null;
      const health = Math.min(hA, hB);
      const reliability = clamp(
        (0.85 + 0.145 * quality) * Math.sqrt(Math.max(health, 0.01)),
        0,
        0.995,
      );
      const rateCap = Math.min(a.comms.dataRateMbps, b.comms.dataRateMbps);
      links.push({
        id: linkId(a.id, b.id),
        a: a.id,
        b: b.id,
        band,
        distanceKm,
        available,
        blocked,
        scoreDb,
        quality,
        latencyS: distanceKm / SPEED_OF_LIGHT_KM_S + HOP_PROCESSING_S,
        reliability,
        bandwidthMbps:
          rateCap * BAND_PARAMS[band].rateFactor * (0.15 + 0.85 * quality),
        stormDb,
      });
    }
  }
  return links;
}
