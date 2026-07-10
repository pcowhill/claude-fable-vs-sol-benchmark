import type { PlanMetrics } from '../../sim/types';
import { fmtKWh, fmtLatency, fmtPct, fmtReliability } from '../../lib/format';

/** Compact KPI readout used in the Plan tab. */
export function MetricsBlock({ metrics }: { metrics: PlanMetrics }) {
  const items: Array<{ key: string; label: string; value: string; alarm?: boolean }> = [
    {
      key: 'coverage',
      label: 'COVERAGE',
      value: fmtPct(metrics.coveragePct),
    },
    {
      key: 'latency',
      label: 'MEAN LATENCY',
      value: fmtLatency(metrics.meanLatencyS),
    },
    {
      key: 'reliability',
      label: 'ROUTE RELIABILITY',
      value: fmtReliability(metrics.meanReliability),
    },
    {
      key: 'energy',
      label: 'RELAY ENERGY / 24H',
      value: fmtKWh(metrics.energyKWh),
    },
    {
      key: 'windows',
      label: 'WINDOWS UNCOVERED',
      value: `${metrics.uncoveredWindows} of ${metrics.totalWindows}`,
      alarm: metrics.uncoveredWindows > 0,
    },
    {
      key: 'relays',
      label: 'ACTIVE RELAYS',
      value: String(metrics.activeRelays),
    },
  ];
  return (
    <dl className="metrics" aria-label="Plan metrics">
      {items.map((m) => (
        <div className={`metric${m.alarm ? ' is-alarm' : ''}`} key={m.key}>
          <dt>{m.label}</dt>
          <dd data-testid={`metric-${m.key}`}>{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}
