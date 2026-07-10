import type { ScenarioDef } from '../sim/types';

/**
 * Mars Transfer Handoff. MULE-2 closes the last ten million kilometres of a
 * cargo transfer while custody migrates from thin Earth-direct X-band to the
 * MARINER areostationary relay. A star-tracker fault on MARINER-K1 mid-window
 * threatens the only strong backhaul.
 */
export const marsTransfer: ScenarioDef = {
  id: 'mars-transfer',
  name: 'Mars Transfer Handoff',
  epochLabel: '2033-02-02 00:00Z',
  briefing:
    'Cargo tug MULE-2 is on final approach, 9.9 million km out and closing. Earth-direct X-band is marginal at this range; custody must hand off cleanly to the MARINER relays before the MOI go/no-go poll at 19:00. One-way light time to Mars is ~12 minutes — plan ahead of the events, not behind them.',
  priorities: [
    'Unbroken custody of MULE-2 through MOI go/no-go (19:00–20:00)',
    'Protect the ELYSIUM DEPOT sol-survey downlink (09:00–11:00)',
    'Mitigate the MARINER-K1 pointing fault (10:00–14:00)',
  ],
  sunDirectionDeg: 250,
  defaultTimeS: 0,
  bodies: {
    moonOrbitRadiusKm: 384_400,
    moonOrbitPeriodS: 2_360_591,
    moonPhase0Deg: 150,
    marsRangeKm: 2.2e8,
    marsAngleDeg: -6,
    earthSpinPeriodS: 86_164,
    earthSpinPhase0Deg: -6,
    marsSpinPeriodS: 88_775,
    marsSpinPhase0Deg: 186,
  },
  assets: [
    {
      id: 'dss-14',
      name: 'DSS-14 Goldstone',
      kind: 'ground-station',
      role: '70 m deep-space antenna · Mojave complex',
      placement: { type: 'surface', body: 'earth', longitudeDeg: 0 },
      comms: { bands: ['x', 'ka', 's'], gainDb: 45, txPowerW: 20_000, minPowerW: 4_000, maxPowerW: 20_000, dataRateMbps: 500 },
      isEarthTerminal: true,
    },
    {
      id: 'dss-63',
      name: 'DSS-63 Madrid',
      kind: 'ground-station',
      role: '70 m deep-space antenna · Robledo complex',
      placement: { type: 'surface', body: 'earth', longitudeDeg: 120 },
      comms: { bands: ['x', 'ka', 's'], gainDb: 45, txPowerW: 20_000, minPowerW: 4_000, maxPowerW: 20_000, dataRateMbps: 500 },
      isEarthTerminal: true,
    },
    {
      id: 'dss-43',
      name: 'DSS-43 Canberra',
      kind: 'ground-station',
      role: '70 m deep-space antenna · Tidbinbilla complex',
      placement: { type: 'surface', body: 'earth', longitudeDeg: 240 },
      comms: { bands: ['x', 'ka', 's'], gainDb: 45, txPowerW: 20_000, minPowerW: 4_000, maxPowerW: 20_000, dataRateMbps: 500 },
      isEarthTerminal: true,
    },
    {
      id: 'mariner-k1',
      name: 'MARINER-K1',
      kind: 'relay',
      role: 'Areostationary trunk relay · fixed over Elysium meridian',
      placement: { type: 'orbit', body: 'mars', radiusKm: 20_428, periodS: 88_775, phase0Deg: 186 },
      comms: { bands: ['ka', 'x', 'uhf'], gainDb: 58, txPowerW: 300, minPowerW: 80, maxPowerW: 600, dataRateMbps: 250 },
    },
    {
      id: 'mariner-k2',
      name: 'MARINER-K2',
      kind: 'relay',
      role: 'Low Mars orbit relay · science backhaul via K1 crosslink',
      placement: { type: 'orbit', body: 'mars', radiusKm: 5_390, periodS: 9_900, phase0Deg: 40 },
      comms: { bands: ['x', 'uhf', 'ka'], gainDb: 45, txPowerW: 180, minPowerW: 40, maxPowerW: 360, dataRateMbps: 120 },
    },
    {
      id: 'elysium-depot',
      name: 'ELYSIUM DEPOT',
      shortName: 'ELYSIUM',
      kind: 'surface',
      role: 'Propellant depot and sample cache · Elysium Planitia',
      placement: { type: 'surface', body: 'mars', longitudeDeg: 0 },
      comms: { bands: ['x', 'uhf'], gainDb: 20, txPowerW: 150, minPowerW: 30, maxPowerW: 300, dataRateMbps: 25 },
      critical: true,
    },
    {
      id: 'mule-2',
      name: 'MULE-2',
      kind: 'ship',
      role: 'Cargo tug · Mars orbit insertion minus 3 days',
      placement: { type: 'transfer', from: 'earth', to: 'mars', startFrac: 0.955, endFrac: 0.997, bowKm: 2.6e7 },
      comms: { bands: ['x', 'ka', 's'], gainDb: 52, txPowerW: 400, minPowerW: 100, maxPowerW: 800, dataRateMbps: 80 },
      critical: true,
    },
  ],
  regions: [
    {
      id: 'areostationary',
      label: 'Areostationary arc',
      body: 'mars',
      radiusKm: 20_428,
      periodS: 88_775,
      comms: { bands: ['ka', 'x', 'uhf'], gainDb: 56, defaultPowerW: 280, minPowerW: 80, maxPowerW: 600, dataRateMbps: 220 },
      note: 'Trunk capacity to Earth; one bird covers a fixed meridian.',
    },
    {
      id: 'mars-low',
      label: 'Low Mars orbit · 2000 km',
      body: 'mars',
      radiusKm: 5_390,
      periodS: 9_900,
      comms: { bands: ['x', 'uhf', 'ka'], gainDb: 45, defaultPowerW: 180, minPowerW: 40, maxPowerW: 360, dataRateMbps: 120 },
      note: 'Fast passes over surface sites; backhauls via areostationary crosslink.',
    },
    {
      id: 'earth-geo',
      label: 'Earth GEO arc',
      body: 'earth',
      radiusKm: 42_164,
      periodS: 86_164,
      comms: { bands: ['x', 'ka', 's'], gainDb: 21, defaultPowerW: 220, minPowerW: 60, maxPowerW: 500, dataRateMbps: 300 },
      note: 'Near-Earth backbone; cannot close a Mars link by itself.',
    },
  ],
  storms: [],
  degradations: [
    {
      assetId: 'mariner-k1',
      startS: 10 * 3600,
      endS: 14 * 3600,
      health: 0.5,
      label: 'Star-tracker fault — pointing loop on gyros only, gain reduced.',
    },
  ],
  missionWindows: [
    { id: 'w-tcm', assetId: 'mule-2', startS: 5 * 3600, endS: 6.5 * 3600, label: 'MULE-2 mid-course correction' },
    { id: 'w-survey', assetId: 'elysium-depot', startS: 9 * 3600, endS: 11 * 3600, label: 'Depot sol-survey downlink' },
    { id: 'w-moi', assetId: 'mule-2', startS: 19 * 3600, endS: 20 * 3600, label: 'MOI go/no-go poll' },
  ],
  scriptedEvents: [
    { timeS: 1800, severity: 'info', title: 'MULE-2 approach phase entry', detail: 'Range 9.9 Gm, closing at 3.9 km/s. Earth-direct margin 2.1 dB and falling.', assetId: 'mule-2' },
    { timeS: 10 * 3600, severity: 'warning', title: 'MARINER-K1 star-tracker fault', detail: 'Pointing on gyro propagation only; trunk gain down until 14:00.', assetId: 'mariner-k1' },
    { timeS: 19 * 3600, severity: 'warning', title: 'MOI go/no-go poll opens', detail: 'Flight requires two independent custody paths for the poll.', assetId: 'mule-2' },
  ],
  layout: {
    earthPx: { x: 295, y: 610 },
    marsPx: { x: 1_280, y: 285 },
    moonOrbitPx: 200,
    earthRPx: 48,
    moonRPx: 12,
    marsRPx: 38,
    orbitRingsPx: {
      earth: [
        [6_371, 48],
        [42_164, 138],
        [384_400, 200],
      ],
      moon: [[1_737, 12]],
      mars: [
        [3_390, 38],
        [5_390, 80],
        [20_428, 150],
      ],
    },
  },
};
