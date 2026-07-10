import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScenario, useStore } from '../../state/store';
import { useEvents, useMetrics } from '../../state/hooks';
import { SAMPLE_STEP_S, WINDOW_S } from '../../sim/constants';
import { fmtHoursMinutes, fmtMissionTime } from '../../lib/format';
import type { MissionEvent } from '../../sim/types';

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const SPEEDS = [
  { value: 60, label: '×60' },
  { value: 300, label: '×300' },
  { value: 1800, label: '×1800' },
];

function EventPip({
  event,
  x,
  onSeek,
}: {
  event: MissionEvent;
  x: number;
  onSeek: (e: MissionEvent) => void;
}) {
  const shape =
    event.severity === 'critical' ? (
      <path d="M0,-4.4 L4.4,3.6 L-4.4,3.6 Z" />
    ) : event.severity === 'warning' ? (
      <path d="M0,-4.4 L4.4,0 L0,4.4 L-4.4,0 Z" />
    ) : (
      <circle r={2.6} />
    );
  return (
    <g
      className={`tl-pip tl-pip-${event.severity}`}
      transform={`translate(${x},0)`}
      onClick={(e) => {
        e.stopPropagation();
        onSeek(event);
      }}
      role="button"
      tabIndex={-1}
      aria-label={`${event.title} at ${fmtMissionTime(event.timeS)}`}
    >
      <rect x={-6} y={-8} width={12} height={16} className="tl-pip-hit" />
      {shape}
      <title>{`${fmtMissionTime(event.timeS)} — ${event.title}`}</title>
    </g>
  );
}

export function TimelineBar() {
  const scenario = useScenario();
  const timeS = useStore((s) => s.timeS);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const setTime = useStore((s) => s.setTime);
  const setSpeed = useStore((s) => s.setSpeed);
  const togglePlaying = useStore((s) => s.togglePlaying);
  const select = useStore((s) => s.select);
  const events = useEvents();
  const metrics = useMetrics();
  const [scrubRef, width] = useElementWidth<HTMLDivElement>();
  const dragging = useRef(false);

  const H = 74;
  const PAD = 8;
  const track = Math.max(width - PAD * 2, 40);
  const tToX = useCallback((t: number) => PAD + (t / WINDOW_S) * track, [track]);
  const xToT = useCallback(
    (x: number) => Math.min(WINDOW_S, Math.max(0, ((x - PAD) / track) * WINDOW_S)),
    [track],
  );

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const rect = scrubRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTime(xToT(clientX - rect.left));
    },
    [scrubRef, setTime, xToT],
  );

  const onSeekEvent = useCallback(
    (event: MissionEvent) => {
      setTime(event.timeS);
      if (event.assetId) select({ kind: 'asset', id: event.assetId });
    },
    [setTime, select],
  );

  // Merge coverage samples into contiguous runs for compact rendering.
  const coverageRuns = useMemo(() => {
    const runs: Array<{ t0: number; t1: number; covered: number; gap: boolean }> = [];
    for (const s of metrics.samples) {
      const last = runs[runs.length - 1];
      const covered = Math.round(s.covered * 4) / 4;
      if (last && last.covered === covered && last.gap === s.criticalGap) {
        last.t1 = s.timeS;
      } else {
        runs.push({ t0: s.timeS, t1: s.timeS, covered, gap: s.criticalGap });
      }
    }
    return runs;
  }, [metrics]);

  const hourTicks = useMemo(() => {
    const ticks: Array<{ t: number; major: boolean }> = [];
    for (let h = 0; h <= 24; h++) ticks.push({ t: h * 3600, major: h % 4 === 0 });
    return ticks;
  }, []);

  return (
    <footer className="timeline" aria-label="Mission timeline">
      <div className="tl-transport" role="group" aria-label="Playback controls">
        <button
          type="button"
          title="Return to scenario start (Home)"
          aria-label="Return to scenario start"
          onClick={() => setTime(scenario.defaultTimeS)}
        >
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 2 v10 M12 2 L5.5 7 L12 12 Z" />
          </svg>
        </button>
        <button
          type="button"
          title="Previous event (Shift+E)"
          aria-label="Previous event"
          onClick={() => {
            const prev = [...events].reverse().find((ev) => ev.timeS < timeS - 1);
            if (prev) onSeekEvent(prev);
          }}
        >
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <path d="M8 2 L2.5 7 L8 12 Z M11.5 2 L6 7 L11.5 12 Z" />
          </svg>
        </button>
        <button
          type="button"
          className="tl-play"
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={playing ? 'Pause simulation' : 'Play simulation'}
          data-testid="play-toggle"
          onClick={togglePlaying}
        >
          {playing ? (
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3.5 2h2.6v10H3.5z M7.9 2h2.6v10H7.9z" />
            </svg>
          ) : (
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3.5 2 L12 7 L3.5 12 Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          title="Next event (E)"
          aria-label="Next event"
          onClick={() => {
            const next = events.find((ev) => ev.timeS > timeS + 1);
            if (next) onSeekEvent(next);
          }}
        >
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <path d="M6 2 L11.5 7 L6 12 Z M2.5 2 L8 7 L2.5 12 Z" />
          </svg>
        </button>
        <div className="tl-speed" role="group" aria-label="Playback rate">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={speed === s.value ? 'is-active' : ''}
              aria-pressed={speed === s.value}
              title={`1 s wall clock = ${s.value / 60} min mission time`}
              onClick={() => setSpeed(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrubRef}
        className="tl-scrub"
        role="slider"
        tabIndex={0}
        aria-label="Mission time"
        aria-valuemin={0}
        aria-valuemax={WINDOW_S}
        aria-valuenow={Math.round(timeS)}
        aria-valuetext={fmtMissionTime(timeS)}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) seekFromPointer(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
      >
        <svg width={width} height={H} className="tl-svg" aria-hidden="true">
          {/* hour grid */}
          {hourTicks.map(({ t, major }) => (
            <g key={t}>
              <line
                x1={tToX(t)}
                y1={major ? 14 : 20}
                x2={tToX(t)}
                y2={58}
                className={major ? 'tl-tick-major' : 'tl-tick'}
              />
              {major && t < WINDOW_S && (
                <text x={tToX(t) + 3} y={12} className="tl-tick-label">
                  {fmtHoursMinutes(t)}
                </text>
              )}
            </g>
          ))}
          <text x={tToX(WINDOW_S) - 3} y={12} textAnchor="end" className="tl-tick-label">
            24:00
          </text>

          {/* mission-critical windows */}
          {scenario.missionWindows.map((w) => (
            <g key={w.id}>
              <rect
                x={tToX(w.startS)}
                y={22}
                width={tToX(w.endS) - tToX(w.startS)}
                height={10}
                className="tl-window"
              >
                <title>{`${w.label} · ${fmtHoursMinutes(w.startS)}–${fmtHoursMinutes(w.endS)}`}</title>
              </rect>
              {tToX(w.endS) - tToX(w.startS) > 78 && (
                <text x={tToX(w.startS) + 4} y={30} className="tl-window-label">
                  {w.label.toUpperCase()}
                </text>
              )}
            </g>
          ))}

          {/* coverage strip */}
          {coverageRuns.map((run, i) => {
            const x = tToX(run.t0);
            const w = Math.max(tToX(Math.min(run.t1 + SAMPLE_STEP_S, WINDOW_S)) - x, 1.2);
            const cls = run.gap
              ? 'tl-cov-gap'
              : run.covered >= 1
                ? 'tl-cov-full'
                : run.covered > 0
                  ? 'tl-cov-partial'
                  : 'tl-cov-none';
            return <rect key={i} x={x} y={38} width={w} height={7} className={cls} />;
          })}

          {/* event pips */}
          <g transform="translate(0,52)">
            {events.map((ev) => (
              <EventPip key={ev.id} event={ev} x={tToX(ev.timeS)} onSeek={onSeekEvent} />
            ))}
          </g>

          {/* playhead */}
          <g transform={`translate(${tToX(timeS)},0)`} className="tl-playhead">
            <line x1={0} y1={10} x2={0} y2={62} />
            <path d="M-5,64 L5,64 L0,58 Z" />
          </g>
        </svg>
      </div>

      <div className="tl-clock" aria-hidden="true">
        <span className="tl-clock-met">{fmtMissionTime(timeS)}</span>
        <span className="tl-clock-span">/ 24:00:00 WINDOW</span>
      </div>
    </footer>
  );
}
