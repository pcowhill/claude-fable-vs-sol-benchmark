/** Tuning constants for the link-budget model. Toy units — see README. */

export const SPEED_OF_LIGHT_KM_S = 299_792.458;

/** Mission window length: 24 h. */
export const WINDOW_S = 86_400;

/** Metrics/event sampling step (s). */
export const SAMPLE_STEP_S = 300;

/** Score below which a link is unusable, and where quality saturates. */
export const SCORE_FLOOR_DB = 6;
export const SCORE_CEIL_DB = 30;

/** System noise floor for the toy link budget. */
export const NOISE_FLOOR_DB = 54;

/** Minimum quality for a link to be considered available. */
export const MIN_LINK_QUALITY = 0.05;

/** Per-hop processing latency (s). */
export const HOP_PROCESSING_S = 0.08;

/** Routing cost weights. */
export const ROUTE_UNRELIABILITY_WEIGHT = 2.0;
export const ROUTE_HOP_COST = 0.08;
/** Cost multiplier for links touching a preferred relay. */
export const PREFERRED_LINK_FACTOR = 0.55;

/** Surface stations need targets above this elevation (deg). */
export const MIN_ELEVATION_DEG = 6;

/** Occultation margin multiplier on body radii. */
export const OCCULT_MARGIN = 1.015;

/** Health penalty at zero health, dB. */
export const HEALTH_PENALTY_DB = 14;

/** Relay idle draw as a fraction of configured TX power. */
export const RELAY_IDLE_FRACTION = 0.12;

export const BAND_PARAMS: Record<
  string,
  { bonusDb: number; rateFactor: number; label: string }
> = {
  ka: { bonusDb: 6, rateFactor: 2.2, label: 'Ka-band' },
  x: { bonusDb: 3, rateFactor: 1.0, label: 'X-band' },
  s: { bonusDb: 0, rateFactor: 0.45, label: 'S-band' },
  uhf: { bonusDb: -2, rateFactor: 0.12, label: 'UHF proximity' },
};

/** Band preference order when endpoints share several. */
export const BAND_PREFERENCE = ['ka', 'x', 's', 'uhf'] as const;
