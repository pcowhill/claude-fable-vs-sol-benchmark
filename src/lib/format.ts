/** Deterministic technical formatting (fixed en-US locale). */

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function fmtMissionTime(timeS: number): string {
  const t = Math.max(0, Math.round(timeS));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `T+${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function fmtClock(timeS: number): string {
  const t = Math.max(0, Math.round(timeS)) % 86_400;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}Z`;
}

export function fmtHoursMinutes(timeS: number): string {
  const t = Math.max(0, Math.round(timeS));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}`;
}

export function fmtDistanceKm(km: number): string {
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)} Gm`;
  if (km >= 10_000) return `${int.format(Math.round(km / 1000))} Mm`;
  return `${int.format(Math.round(km))} km`;
}

/** Durations like orbit periods: "6h 00m", "45m", "90s". */
export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 120) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function fmtLatency(latencyS: number): string {
  if (latencyS >= 120) {
    const m = Math.floor(latencyS / 60);
    const s = Math.round(latencyS % 60);
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  if (latencyS >= 1) return `${latencyS.toFixed(2)} s`;
  return `${Math.round(latencyS * 1000)} ms`;
}

export function fmtMbps(mbps: number): string {
  if (mbps >= 100) return `${Math.round(mbps)} Mbps`;
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  return `${Math.round(mbps * 1000)} kbps`;
}

export const fmtPct = (frac0to100: number, digits = 1): string =>
  `${frac0to100.toFixed(digits)}%`;

export const fmtDb = (db: number, digits = 1): string =>
  `${db >= 0 ? '' : '−'}${Math.abs(db).toFixed(digits)} dB`;

export const fmtKWh = (kwh: number): string => `${kwh.toFixed(2)} kWh`;

export const fmtW = (w: number): string =>
  w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`;

export const fmtReliability = (r: number): string => `${(r * 100).toFixed(1)}%`;

export const fmtSignedPct = (delta: number, digits = 1): string =>
  `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(digits)}`;
