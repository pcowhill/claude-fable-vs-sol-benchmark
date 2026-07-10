import { useEffect, useMemo, useRef } from 'react';
import { useScenario, useStore } from '../../state/store';
import { useEvents } from '../../state/hooks';
import type { EffectiveAsset, SimSnapshot } from '../../sim/types';
import { fmtHoursMinutes, fmtLatency } from '../../lib/format';
import { AssetSymbol, SeverityGlyph } from '../map/glyphs';

function Brief() {
  const scenario = useScenario();
  return (
    <section className="rail-block rail-brief">
      <h2 className="rail-head">MISSION BRIEF</h2>
      <p className="brief-text">{scenario.briefing}</p>
      <ol className="brief-priorities">
        {scenario.priorities.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
    </section>
  );
}

function Alerts({ snapshot }: { snapshot: SimSnapshot }) {
  const select = useStore((s) => s.select);
  return (
    <section className="rail-block rail-alerts" aria-live="polite">
      <h2 className="rail-head">
        ACTIVE ALERTS
        <span className="rail-count">{snapshot.alerts.length}</span>
      </h2>
      {snapshot.alerts.length === 0 ? (
        <div className="alert-nominal">
          <span className="nominal-dot" aria-hidden="true" />
          ALL SYSTEMS NOMINAL
        </div>
      ) : (
        <ul className="alert-list">
          {snapshot.alerts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={`alert alert-${a.severity}`}
                onClick={() => a.assetId && select({ kind: 'asset', id: a.assetId })}
                title={a.detail}
              >
                <SeverityGlyph severity={a.severity} />
                <span className="alert-sevtag">{a.severity.toUpperCase()}</span>
                <span className="alert-title">{a.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const KIND_ORDER: Array<[EffectiveAsset['kind'], string]> = [
  ['ship', 'VEHICLES'],
  ['surface', 'SURFACE'],
  ['relay', 'RELAYS'],
  ['ground-station', 'GROUND NET'],
];

function assetStatus(asset: EffectiveAsset, snapshot: SimSnapshot): string {
  if (!asset.enabled) return 'OFFLINE';
  if (asset.isEarthTerminal) {
    const up = snapshot.links.filter(
      (l) => l.available && (l.a === asset.id || l.b === asset.id),
    ).length;
    return up > 0 ? `${up} LINK${up > 1 ? 'S' : ''}` : 'IDLE';
  }
  const route = snapshot.routes[asset.id];
  if (asset.critical) {
    if (!route?.connected) return 'NO ROUTE';
    const via = route.path.length > 2 ? route.path[1] : route.path[route.path.length - 1];
    const viaName = (snapshot.assets.find((a) => a.id === via)?.name ?? via).split(' ')[0];
    return `VIA ${viaName.toUpperCase()} · ${fmtLatency(route.latencyS)}`;
  }
  const carrying = Object.values(snapshot.routes).filter(
    (r) => r.connected && r.path.includes(asset.id) && r.assetId !== asset.id,
  ).length;
  return carrying > 0 ? `CARRYING ${carrying}` : 'STANDBY';
}

function Roster({ snapshot }: { snapshot: SimSnapshot }) {
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  return (
    <section className="rail-block rail-roster">
      <h2 className="rail-head">
        ASSETS
        <span className="rail-count">{snapshot.assets.length}</span>
      </h2>
      {KIND_ORDER.map(([kind, label]) => {
        const group = snapshot.assets.filter((a) => a.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind} className="roster-group">
            <h3 className="roster-kind">{label}</h3>
            <ul>
              {group.map((asset) => {
                const active = selection?.kind === 'asset' && selection.id === asset.id;
                const status = assetStatus(asset, snapshot);
                const dark = status === 'NO ROUTE' || status === 'OFFLINE';
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      className={`roster-row${active ? ' is-selected' : ''}${dark ? ' is-dark' : ''}${asset.userCreated ? ' is-user' : ''}`}
                      onClick={() => select({ kind: 'asset', id: asset.id })}
                      data-testid={`roster-${asset.id}`}
                    >
                      <svg viewBox="-12 -10 24 20" className="roster-glyph" aria-hidden="true">
                        <AssetSymbol kind={asset.kind} />
                      </svg>
                      <span className="roster-name">
                        {asset.name}
                        {asset.userCreated && <span className="roster-badge">OPR</span>}
                        {asset.critical && <span className="roster-crit" title="Mission-critical asset">✱</span>}
                      </span>
                      <span className="roster-status">{status}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function EventLog({ snapshot }: { snapshot: SimSnapshot }) {
  const events = useEvents();
  const setTime = useStore((s) => s.setTime);
  const select = useStore((s) => s.select);
  const listRef = useRef<HTMLOListElement>(null);
  const nextIndex = useMemo(
    () => events.findIndex((e) => e.timeS > snapshot.timeS),
    [events, snapshot.timeS],
  );

  // Keep the "now" horizon in view while the clock runs.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const idx = nextIndex === -1 ? events.length - 1 : nextIndex;
    const el = list.children[idx] as HTMLElement | undefined;
    if (el) {
      const top = el.offsetTop - list.clientHeight / 2 + 40;
      list.scrollTo({ top: Math.max(0, top) });
    }
  }, [nextIndex, events.length]);

  return (
    <section className="rail-block rail-events">
      <h2 className="rail-head">
        EVENT TIMELINE
        <span className="rail-count">{events.length}</span>
      </h2>
      <ol className="event-list" ref={listRef} data-testid="event-log">
        {events.map((ev, i) => {
          const past = ev.timeS <= snapshot.timeS;
          const isNext = i === nextIndex;
          return (
            <li key={ev.id} className={`${past ? 'is-past' : ''}${isNext ? ' is-next' : ''}`}>
              <button
                type="button"
                className="event-row"
                onClick={() => {
                  setTime(ev.timeS);
                  if (ev.assetId) select({ kind: 'asset', id: ev.assetId });
                }}
                title={ev.detail}
                data-event-kind={ev.kind}
              >
                <span className="event-time">{fmtHoursMinutes(ev.timeS)}</span>
                <SeverityGlyph severity={ev.severity} />
                <span className="event-title">{ev.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function LeftRail({ snapshot }: { snapshot: SimSnapshot }) {
  return (
    <aside className="rail rail-left" aria-label="Mission status">
      <Brief />
      <Alerts snapshot={snapshot} />
      <Roster snapshot={snapshot} />
      <EventLog snapshot={snapshot} />
    </aside>
  );
}
