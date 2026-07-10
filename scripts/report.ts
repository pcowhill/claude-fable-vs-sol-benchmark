/* Dev-only calibration report: prints link tables, coverage and events. */
import { scenarios } from '../src/scenarios';
import { computeSnapshot } from '../src/sim/snapshot';
import { computeMetrics } from '../src/sim/metrics';
import { deriveEvents } from '../src/sim/events';
import { emptyPlan } from '../src/sim/plan';

const fmt = (n: number, d = 2) => n.toFixed(d);
const hhmm = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.name} ===`);
  const plan = emptyPlan();
  for (const t of [0, 6 * 3600, 12 * 3600, 18 * 3600]) {
    const snap = computeSnapshot(scenario, plan, t);
    console.log(`\n-- T+${hhmm(t)}  storm=${fmt(snap.stormDb, 1)}dB`);
    for (const link of snap.links) {
      if (!link.available && link.blocked !== 'weak') continue;
      console.log(
        `  ${link.available ? 'UP  ' : 'weak'} ${link.a}<->${link.b} [${link.band}] d=${fmt(link.distanceKm / 1000, 0)}Mm q=${fmt(link.quality)} score=${fmt(link.scoreDb, 1)} rel=${fmt(link.reliability, 3)} bw=${fmt(link.bandwidthMbps, 1)}`,
      );
    }
    for (const [id, r] of Object.entries(snap.routes)) {
      const asset = snap.assets.find((a) => a.id === id);
      if (!asset?.critical) continue;
      console.log(
        `  ROUTE ${id}: ${r.connected ? r.path.join(' > ') : 'NO ROUTE'} lat=${fmt(r.latencyS, 1)}s rel=${fmt(r.reliability, 3)}`,
      );
    }
  }
  const m = computeMetrics(scenario, plan);
  console.log(
    `\nMETRICS coverage=${fmt(m.coveragePct, 1)}% latency=${fmt(m.meanLatencyS, 1)}s rel=${fmt(m.meanReliability, 3)} energy=${fmt(m.energyKWh, 2)}kWh uncovered=${m.uncoveredWindows}/${m.totalWindows} relays=${m.activeRelays}`,
  );
  for (const a of m.perAsset) {
    console.log(`  ${a.assetId}: cov=${fmt(a.coveragePct, 1)}% lat=${fmt(a.meanLatencyS, 1)}s`);
  }
  const events = deriveEvents(scenario, plan);
  console.log(`EVENTS (${events.length}):`);
  for (const e of events.slice(0, 40)) {
    console.log(`  ${hhmm(e.timeS)} [${e.severity[0].toUpperCase()}] ${e.kind}: ${e.title}`);
  }
}
