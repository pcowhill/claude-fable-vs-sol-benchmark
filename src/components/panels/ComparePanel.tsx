import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { useBaselineMetrics, useMetrics } from '../../state/hooks';
import type { PlanMetrics } from '../../sim/types';
import {
  fmtKWh,
  fmtLatency,
  fmtPct,
  fmtReliability,
  fmtSignedPct,
} from '../../lib/format';
import { WINDOW_S } from '../../sim/constants';

interface MetricSpec {
  key: string;
  label: string;
  /** true when a larger value is an improvement */
  moreIsBetter: boolean;
  value: (m: PlanMetrics) => number;
  format: (v: number) => string;
  deltaFormat: (d: number) => string;
}

const SPECS: MetricSpec[] = [
  {
    key: 'coverage',
    label: 'COVERAGE',
    moreIsBetter: true,
    value: (m) => m.coveragePct,
    format: (v) => fmtPct(v),
    deltaFormat: (d) => `${fmtSignedPct(d)} pts`,
  },
  {
    key: 'latency',
    label: 'MEAN LATENCY',
    moreIsBetter: false,
    value: (m) => m.meanLatencyS,
    format: (v) => fmtLatency(v),
    deltaFormat: (d) => `${d >= 0 ? '+' : '−'}${fmtLatency(Math.abs(d))}`,
  },
  {
    key: 'reliability',
    label: 'ROUTE RELIABILITY',
    moreIsBetter: true,
    value: (m) => m.meanReliability * 100,
    format: (v) => fmtReliability(v / 100),
    deltaFormat: (d) => `${fmtSignedPct(d)} pts`,
  },
  {
    key: 'energy',
    label: 'RELAY ENERGY',
    moreIsBetter: false,
    value: (m) => m.energyKWh,
    format: (v) => fmtKWh(v),
    deltaFormat: (d) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} kWh`,
  },
  {
    key: 'windows',
    label: 'UNCOVERED CRITICAL WINDOWS',
    moreIsBetter: false,
    value: (m) => m.uncoveredWindows,
    format: (v) => String(Math.round(v)),
    deltaFormat: (d) => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))}`,
  },
  {
    key: 'relays',
    label: 'ACTIVE RELAYS',
    moreIsBetter: false,
    value: (m) => m.activeRelays,
    format: (v) => String(Math.round(v)),
    deltaFormat: (d) => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))}`,
  },
];

function DeltaChip({ spec, delta }: { spec: MetricSpec; delta: number }) {
  const negligible = Math.abs(delta) < 1e-9;
  if (negligible) {
    return (
      <span className="delta delta-flat" data-testid={`delta-${spec.key}`}>
        = UNCHANGED
      </span>
    );
  }
  const improved = spec.moreIsBetter ? delta > 0 : delta < 0;
  return (
    <span
      className={`delta ${improved ? 'delta-up' : 'delta-down'}`}
      data-testid={`delta-${spec.key}`}
    >
      <span aria-hidden="true">{improved ? '▲' : '▼'}</span>{' '}
      {spec.deltaFormat(delta)} · {improved ? 'IMPROVED' : 'WORSE'}
    </span>
  );
}

function StripPair({
  baseline,
  current,
}: {
  baseline: PlanMetrics;
  current: PlanMetrics;
}) {
  const renderStrip = (m: PlanMetrics, label: string) => (
    <div className="strip-row">
      <span className="strip-label">{label}</span>
      <div
        className="strip"
        role="img"
        aria-label={`${label} coverage strip: ${fmtPct(m.coveragePct)} covered`}
      >
        {m.samples.map((s, i) => {
          const cls = s.criticalGap
            ? 'is-gap'
            : s.covered >= 1
              ? 'is-full'
              : s.covered > 0
                ? 'is-partial'
                : 'is-none';
          return (
            <span
              key={i}
              className={`strip-cell ${cls}`}
              style={{ left: `${(s.timeS / WINDOW_S) * 100}%` }}
            />
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="strip-pair">
      {renderStrip(baseline, 'BASE')}
      {renderStrip(current, 'PLAN')}
      <div className="strip-axis" aria-hidden="true">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

function verdict(baseline: PlanMetrics, current: PlanMetrics): string {
  const parts: string[] = [];
  const dCov = current.coveragePct - baseline.coveragePct;
  if (Math.abs(dCov) >= 0.05)
    parts.push(`coverage ${dCov > 0 ? 'up' : 'down'} ${Math.abs(dCov).toFixed(1)} pts`);
  const dWin = current.uncoveredWindows - baseline.uncoveredWindows;
  if (dWin !== 0)
    parts.push(
      `${Math.abs(dWin)} critical window${Math.abs(dWin) > 1 ? 's' : ''} ${dWin < 0 ? 'recovered' : 'lost'}`,
    );
  const dEnergy = current.energyKWh - baseline.energyKWh;
  if (Math.abs(dEnergy) >= 0.05)
    parts.push(`energy ${dEnergy > 0 ? 'up' : 'down'} ${Math.abs(dEnergy).toFixed(1)} kWh`);
  const dRel = (current.meanReliability - baseline.meanReliability) * 100;
  if (Math.abs(dRel) >= 0.1)
    parts.push(`reliability ${dRel > 0 ? 'up' : 'down'} ${Math.abs(dRel).toFixed(1)} pts`);
  if (parts.length === 0) return 'Working plan matches the baseline.';
  const sentence = parts.join('; ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

export function ComparePanel() {
  const metrics = useMetrics();
  const baselineMetrics = useBaselineMetrics();
  const baseline = useStore((s) => s.baseline);
  const saveBaseline = useStore((s) => s.saveBaseline);
  const clearBaseline = useStore((s) => s.clearBaseline);
  const restoreBaseline = useStore((s) => s.restoreBaseline);

  const rows = useMemo(() => {
    if (!baselineMetrics) return [];
    return SPECS.map((spec) => {
      const base = spec.value(baselineMetrics);
      const cur = spec.value(metrics);
      const max = Math.max(Math.abs(base), Math.abs(cur), 1e-9);
      return { spec, base, cur, delta: cur - base, max };
    });
  }, [baselineMetrics, metrics]);

  if (!baseline || !baselineMetrics) {
    return (
      <div className="compare compare-empty" data-testid="compare-panel">
        <p className="insp-hint">
          Capture the working plan as a baseline, then adjust relays, power and
          routing — this panel scores every change against the capture.
        </p>
        <button
          type="button"
          className="is-primary"
          onClick={saveBaseline}
          data-testid="capture-baseline"
        >
          CAPTURE BASELINE
        </button>
      </div>
    );
  }

  return (
    <div className="compare" data-testid="compare-panel">
      <div className="compare-head">
        <span className="compare-label">{baseline.label}</span>
        <p className="compare-verdict" data-testid="compare-verdict">
          {verdict(baselineMetrics, metrics)}
        </p>
      </div>

      <div className="compare-rows">
        {rows.map(({ spec, base, cur, delta, max }) => (
          <div className="compare-row" key={spec.key}>
            <div className="compare-row-head">
              <span className="compare-metric">{spec.label}</span>
              <DeltaChip spec={spec} delta={delta} />
            </div>
            <div className="compare-bars">
              <div className="cbar">
                <span className="cbar-tag">BASE</span>
                <div className="cbar-track">
                  <div
                    className="cbar-fill is-base"
                    style={{ width: `${(Math.abs(base) / max) * 100}%` }}
                  />
                </div>
                <span className="cbar-val">{spec.format(base)}</span>
              </div>
              <div className="cbar">
                <span className="cbar-tag">PLAN</span>
                <div className="cbar-track">
                  <div
                    className="cbar-fill is-current"
                    style={{ width: `${(Math.abs(cur) / max) * 100}%` }}
                  />
                </div>
                <span className="cbar-val" data-testid={`compare-${spec.key}`}>
                  {spec.format(cur)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="insp-section">
        <h4 className="insp-sechead">COVERAGE · 24 H</h4>
        <StripPair baseline={baselineMetrics} current={metrics} />
      </section>

      <div className="compare-actions">
        <button type="button" onClick={saveBaseline} title="Overwrite baseline with the working plan">
          UPDATE BASELINE
        </button>
        <button type="button" onClick={restoreBaseline} title="Replace working plan with the baseline plan">
          RESTORE PLAN
        </button>
        <button type="button" className="is-danger" onClick={clearBaseline}>
          CLEAR
        </button>
      </div>
    </div>
  );
}
