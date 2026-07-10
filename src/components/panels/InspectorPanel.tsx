import { useMemo, useState } from 'react';
import { useScenario, useStore } from '../../state/store';
import { useEvents } from '../../state/hooks';
import type {
  EffectiveAsset,
  LinkState,
  SimSnapshot,
} from '../../sim/types';
import { BAND_PARAMS, NOISE_FLOOR_DB, SCORE_CEIL_DB, SCORE_FLOOR_DB } from '../../sim/constants';
import { healthAt, powerDb } from '../../sim/links';
import {
  fmtDb,
  fmtDistanceKm,
  fmtDuration,
  fmtHoursMinutes,
  fmtLatency,
  fmtMbps,
  fmtMissionTime,
  fmtReliability,
  fmtW,
} from '../../lib/format';

const KIND_LABEL: Record<EffectiveAsset['kind'], string> = {
  'ground-station': 'GROUND STATION',
  surface: 'SURFACE STATION',
  relay: 'RELAY',
  ship: 'VEHICLE',
};

function QualityBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div
      className="qbar"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label ?? 'Link quality'}
    >
      <div className="qbar-fill" style={{ width: `${pct}%` }} />
      <span className="qbar-text">{pct}%</span>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="insp-row">
      <span className="insp-key">{k}</span>
      <span className="insp-val">{children}</span>
    </div>
  );
}

function PowerControl({ asset }: { asset: EffectiveAsset }) {
  const setAssetPower = useStore((s) => s.setAssetPower);
  const { minPowerW, maxPowerW, txPowerW } = asset.comms;
  if (maxPowerW <= minPowerW) return null;
  return (
    <label className="insp-slider">
      <span className="insp-key">TX POWER</span>
      <input
        type="range"
        min={minPowerW}
        max={maxPowerW}
        step={1}
        value={txPowerW}
        onChange={(e) => setAssetPower(asset.id, Number(e.target.value))}
        aria-label={`${asset.name} transmit power, watts`}
      />
      <span className="insp-val insp-num" data-testid="power-readout">
        {fmtW(txPowerW)}
      </span>
    </label>
  );
}

function AssetLinksTable({
  asset,
  snapshot,
}: {
  asset: EffectiveAsset;
  snapshot: SimSnapshot;
}) {
  const select = useStore((s) => s.select);
  const links = snapshot.links
    .filter((l) => (l.a === asset.id || l.b === asset.id) && l.available)
    .sort((a, b) => b.quality - a.quality);
  if (links.length === 0) {
    return <p className="insp-empty">No links currently closed.</p>;
  }
  return (
    <table className="insp-table">
      <thead>
        <tr>
          <th scope="col">COUNTERPART</th>
          <th scope="col">BAND</th>
          <th scope="col">QUAL</th>
          <th scope="col">RATE</th>
        </tr>
      </thead>
      <tbody>
        {links.map((l) => {
          const otherId = l.a === asset.id ? l.b : l.a;
          const other = snapshot.assets.find((a) => a.id === otherId);
          return (
            <tr key={l.id}>
              <td>
                <button
                  type="button"
                  className="linklike"
                  onClick={() => select({ kind: 'link', id: l.id })}
                  title={`Inspect link to ${other?.name ?? otherId}`}
                >
                  {(other?.name ?? otherId).toUpperCase()}
                </button>
              </td>
              <td>{l.band.toUpperCase()}</td>
              <td className="insp-num">{Math.round(l.quality * 100)}%</td>
              <td className="insp-num">{fmtMbps(l.bandwidthMbps)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AssetInspector({
  asset,
  snapshot,
}: {
  asset: EffectiveAsset;
  snapshot: SimSnapshot;
}) {
  const scenario = useScenario();
  const events = useEvents();
  const select = useStore((s) => s.select);
  const setAssetEnabled = useStore((s) => s.setAssetEnabled);
  const setPreferredRelay = useStore((s) => s.setPreferredRelay);
  const removeRelay = useStore((s) => s.removeRelay);
  const updateRelay = useStore((s) => s.updateRelay);
  const plan = useStore((s) => s.plan);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const route = snapshot.routes[asset.id];
  const health = healthAt(scenario.degradations, asset.id, snapshot.timeS);
  const userRelay = plan.userRelays.find((r) => r.id === asset.id);
  const relays = snapshot.assets.filter((a) => a.kind === 'relay' && a.enabled);
  const upcoming = useMemo(
    () =>
      events
        .filter(
          (e) =>
            e.assetId === asset.id &&
            (e.kind === 'aos' || e.kind === 'los' || e.kind === 'handoff') &&
            e.timeS > snapshot.timeS,
        )
        .slice(0, 3),
    [events, asset.id, snapshot.timeS],
  );
  const windows = scenario.missionWindows.filter((w) => w.assetId === asset.id);
  const canDisable = !asset.critical && !asset.isEarthTerminal;

  return (
    <div className="insp" data-testid="asset-inspector">
      <header className="insp-header">
        <span className="insp-kind">{KIND_LABEL[asset.kind]}</span>
        <h3 className="insp-name">{asset.name}</h3>
        <p className="insp-role">{asset.role}</p>
        <div className="insp-tags">
          {asset.critical && <span className="tag tag-crit">MISSION-CRITICAL</span>}
          {asset.userCreated && <span className="tag tag-user">OPERATOR ASSET</span>}
          {asset.isEarthTerminal && <span className="tag">EARTH TERMINAL</span>}
          {health < 1 && <span className="tag tag-warn">DEGRADED {Math.round(health * 100)}%</span>}
          {!asset.enabled && <span className="tag tag-off">OFFLINE</span>}
        </div>
      </header>

      {canDisable && (
        <label className="insp-toggle">
          <input
            type="checkbox"
            checked={asset.enabled}
            onChange={(e) => setAssetEnabled(asset.id, e.target.checked)}
            data-testid="asset-enabled"
          />
          <span>{asset.enabled ? 'ASSET ENABLED' : 'ASSET DISABLED'}</span>
        </label>
      )}

      <section className="insp-section">
        <h4 className="insp-sechead">GEOMETRY</h4>
        {asset.placement.type === 'orbit' && (
          <>
            <Row k="REGIME">
              {asset.placement.body.toUpperCase()} ORBIT · r{' '}
              {fmtDistanceKm(asset.placement.radiusKm)}
            </Row>
            <Row k="PERIOD">{fmtDuration(asset.placement.periodS)}</Row>
            <Row k="PHASE T+0">{Math.round(asset.placement.phase0Deg)}°</Row>
          </>
        )}
        {asset.placement.type === 'surface' && (
          <>
            <Row k="SITE">
              {asset.placement.body.toUpperCase()} SURFACE · LON{' '}
              {Math.round(asset.placement.longitudeDeg)}°
            </Row>
            <Row k="ROTATION">CARRIED BY BODY SPIN</Row>
          </>
        )}
        {asset.placement.type === 'transfer' && (
          <>
            <Row k="TRACK">
              {asset.placement.from.toUpperCase()} →{' '}
              {asset.placement.to.toUpperCase()} TRANSFER
            </Row>
            <Row k="RANGE TO TARGET">
              {fmtDistanceKm(
                Math.hypot(
                  snapshot.positions[asset.id].x -
                    snapshot.bodyCenters[asset.placement.to].x,
                  snapshot.positions[asset.id].y -
                    snapshot.bodyCenters[asset.placement.to].y,
                ),
              )}
            </Row>
          </>
        )}
      </section>

      <section className="insp-section">
        <h4 className="insp-sechead">COMMS</h4>
        <Row k="BANDS">
          {asset.comms.bands.map((b) => BAND_PARAMS[b].label).join(' · ')}
        </Row>
        <Row k="ANTENNA FIGURE">{fmtDb(asset.comms.gainDb, 0)}</Row>
        {asset.comms.shieldingDb ? (
          <Row k="STORM SHIELDING">{fmtDb(asset.comms.shieldingDb, 0)}</Row>
        ) : null}
        <PowerControl asset={asset} />
        {userRelay && (
          <label className="insp-slider">
            <span className="insp-key">ORBIT PHASE</span>
            <input
              type="range"
              min={0}
              max={359}
              step={1}
              value={userRelay.phaseDeg}
              onChange={(e) =>
                updateRelay(asset.id, { phaseDeg: Number(e.target.value) })
              }
              aria-label={`${asset.name} orbit phase, degrees`}
            />
            <span className="insp-val insp-num">{userRelay.phaseDeg}°</span>
          </label>
        )}
      </section>

      {asset.kind === 'relay' && (
        <section className="insp-section">
          <h4 className="insp-sechead">LOAD</h4>
          {(() => {
            const carrying = Object.values(snapshot.routes).filter(
              (r) => r.connected && r.path.slice(1, -1).includes(asset.id),
            );
            const drawW = !asset.enabled
              ? 0
              : carrying.length > 0
                ? asset.comms.txPowerW
                : asset.comms.txPowerW * 0.12;
            return (
              <>
                <Row k="STATE">
                  {!asset.enabled
                    ? 'OFFLINE'
                    : carrying.length > 0
                      ? 'ACTIVE · CARRYING TRAFFIC'
                      : 'STANDBY · BEACON ONLY'}
                </Row>
                <Row k="ROUTES CARRIED">{String(carrying.length)}</Row>
                <Row k="PRESENT DRAW">{fmtW(drawW)}</Row>
                {carrying.map((r) => {
                  const owner = snapshot.assets.find((a) => a.id === r.assetId);
                  return (
                    <Row k="↳" key={r.assetId}>
                      <button
                        type="button"
                        className="linklike"
                        onClick={() => select({ kind: 'asset', id: r.assetId })}
                      >
                        {(owner?.name ?? r.assetId).toUpperCase()}
                      </button>
                    </Row>
                  );
                })}
              </>
            );
          })()}
        </section>
      )}

      {asset.critical && (
        <section className="insp-section">
          <h4 className="insp-sechead">ROUTE TO EARTH</h4>
          {route?.connected ? (
            <>
              <div className="insp-path" data-testid="route-path">
                {route.path.map((id, i) => {
                  const hop = snapshot.assets.find((a) => a.id === id);
                  return (
                    <span key={id} className="insp-hop">
                      {i > 0 && <span className="insp-hoparrow" aria-hidden="true">→</span>}
                      <button
                        type="button"
                        className="linklike"
                        onClick={() => select({ kind: 'asset', id })}
                      >
                        {(hop?.name ?? id).toUpperCase()}
                      </button>
                    </span>
                  );
                })}
              </div>
              <Row k="ONE-WAY LATENCY">{fmtLatency(route.latencyS)}</Row>
              <Row k="RELIABILITY">{fmtReliability(route.reliability)}</Row>
              <Row k="BOTTLENECK">{fmtMbps(route.bottleneckMbps)}</Row>
            </>
          ) : (
            <p className="insp-alarm" role="status">
              NO ROUTE TO EARTH AT {fmtMissionTime(snapshot.timeS)}
            </p>
          )}
          <label className="insp-select">
            <span className="insp-key">PREFERRED RELAY</span>
            <select
              value={plan.preferredRelay[asset.id] ?? ''}
              onChange={(e) =>
                setPreferredRelay(asset.id, e.target.value || null)
              }
              aria-label={`Preferred relay for ${asset.name}`}
              data-testid="preferred-relay"
            >
              <option value="">AUTO (BEST COST)</option>
              {relays.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="insp-section">
        <h4 className="insp-sechead">LINKS NOW</h4>
        <AssetLinksTable asset={asset} snapshot={snapshot} />
      </section>

      {(upcoming.length > 0 || windows.length > 0) && (
        <section className="insp-section">
          <h4 className="insp-sechead">SCHEDULE</h4>
          {windows.map((w) => (
            <Row k={`${fmtHoursMinutes(w.startS)}–${fmtHoursMinutes(w.endS)}`} key={w.id}>
              {w.label}
            </Row>
          ))}
          {upcoming.map((e) => (
            <Row k={fmtHoursMinutes(e.timeS)} key={e.id}>
              {e.title}
            </Row>
          ))}
        </section>
      )}

      {userRelay && (
        <section className="insp-section">
          <h4 className="insp-sechead">OPERATOR CONTROLS</h4>
          {renaming === null ? (
            <div className="insp-btnrow">
              <button type="button" onClick={() => { setRenaming(userRelay.name); setRenameError(null); }}>
                RENAME
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => removeRelay(asset.id)}
                data-testid="remove-relay"
              >
                DECOMMISSION
              </button>
            </div>
          ) : (
            <form
              className="insp-rename"
              onSubmit={(e) => {
                e.preventDefault();
                const res = updateRelay(asset.id, { name: renaming.trim() });
                if (res.ok) {
                  setRenaming(null);
                  setRenameError(null);
                } else {
                  setRenameError(res.errors[0] ?? 'Invalid name.');
                }
              }}
            >
              <input
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                maxLength={24}
                aria-label="New relay designation"
              />
              <button type="submit">APPLY</button>
              <button type="button" onClick={() => setRenaming(null)}>
                CANCEL
              </button>
              {renameError && (
                <p className="form-error" role="alert">
                  {renameError}
                </p>
              )}
            </form>
          )}
        </section>
      )}
    </div>
  );
}

function LinkInspector({
  link,
  snapshot,
}: {
  link: LinkState;
  snapshot: SimSnapshot;
}) {
  const scenario = useScenario();
  const select = useStore((s) => s.select);
  const setPreferredRelay = useStore((s) => s.setPreferredRelay);
  const a = snapshot.assets.find((x) => x.id === link.a);
  const b = snapshot.assets.find((x) => x.id === link.b);
  if (!a || !b) return null;
  const healthLoss =
    (2 -
      healthAt(scenario.degradations, a.id, snapshot.timeS) -
      healthAt(scenario.degradations, b.id, snapshot.timeS)) *
    14;
  const pathLoss = 20 * Math.log10(Math.max(link.distanceKm, 1) / 1000);
  const budget: Array<[string, number]> = [
    [`${a.name.toUpperCase()} TERMINAL`, powerDb(a.comms.txPowerW) + a.comms.gainDb],
    [`${b.name.toUpperCase()} TERMINAL`, powerDb(b.comms.txPowerW) + b.comms.gainDb],
    ['PATH LOSS', -pathLoss],
    [`BAND (${BAND_PARAMS[link.band].label.toUpperCase()})`, BAND_PARAMS[link.band].bonusDb],
    ['SOLAR EVENT', -link.stormDb],
    ['HEALTH', -healthLoss],
    ['NOISE FLOOR', -NOISE_FLOOR_DB],
  ];
  const critical = a.critical ? a : b.critical ? b : null;
  const relay = a.kind === 'relay' ? a : b.kind === 'relay' ? b : null;

  return (
    <div className="insp" data-testid="link-inspector">
      <header className="insp-header">
        <span className="insp-kind">COMM LINK · {link.band.toUpperCase()}</span>
        <h3 className="insp-name insp-linkname">
          <button type="button" className="linklike" onClick={() => select({ kind: 'asset', id: a.id })}>
            {a.name.toUpperCase()}
          </button>
          <span aria-hidden="true"> ⇌ </span>
          <button type="button" className="linklike" onClick={() => select({ kind: 'asset', id: b.id })}>
            {b.name.toUpperCase()}
          </button>
        </h3>
        <div className="insp-tags">
          {link.available ? (
            <span className="tag tag-ok">CLOSED · CARRIER LOCK</span>
          ) : (
            <span className="tag tag-off">
              {link.blocked === 'los'
                ? 'NO LINE OF SIGHT'
                : link.blocked === 'weak'
                  ? 'BELOW LINK MARGIN'
                  : 'ENDPOINT OFFLINE'}
            </span>
          )}
          {link.stormDb > 4 && <span className="tag tag-warn">STORM −{link.stormDb.toFixed(0)} dB</span>}
        </div>
      </header>

      <section className="insp-section">
        <h4 className="insp-sechead">CHANNEL</h4>
        <Row k="SLANT RANGE">{fmtDistanceKm(link.distanceKm)}</Row>
        <Row k="ONE-WAY LATENCY">{fmtLatency(link.latencyS)}</Row>
        <Row k="DATA RATE">{link.available ? fmtMbps(link.bandwidthMbps) : '—'}</Row>
        <Row k="RELIABILITY">{link.available ? fmtReliability(link.reliability) : '—'}</Row>
        <div className="insp-row">
          <span className="insp-key">QUALITY</span>
          <QualityBar value={link.quality} label="Link quality" />
        </div>
      </section>

      <section className="insp-section">
        <h4 className="insp-sechead">LINK BUDGET</h4>
        <table className="insp-table insp-budget">
          <tbody>
            {budget
              .filter(([, v]) => v !== 0)
              .map(([label, v]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className={`insp-num ${v < 0 ? 'is-neg' : ''}`}>{fmtDb(v)}</td>
                </tr>
              ))}
            <tr className="insp-budget-total">
              <td>MARGIN SCORE</td>
              <td className="insp-num">{fmtDb(link.scoreDb)}</td>
            </tr>
          </tbody>
        </table>
        <p className="insp-footnote">
          usable ≥ {SCORE_FLOOR_DB} dB · saturates at {SCORE_CEIL_DB} dB
        </p>
      </section>

      {critical && relay && (
        <section className="insp-section">
          <h4 className="insp-sechead">ROUTING</h4>
          <button
            type="button"
            onClick={() => setPreferredRelay(critical.id, relay.id)}
            data-testid="prefer-link"
          >
            PREFER {critical.name.toUpperCase()} VIA {relay.name.toUpperCase()}
          </button>
        </section>
      )}
    </div>
  );
}

export function InspectorPanel({ snapshot }: { snapshot: SimSnapshot }) {
  const selection = useStore((s) => s.selection);
  if (!selection) {
    return (
      <div className="insp-nosel">
        <p>NO SELECTION</p>
        <p className="insp-hint">
          Select an asset or link on the map, in the roster, or from an event
          to inspect geometry, link budgets and routing.
        </p>
      </div>
    );
  }
  if (selection.kind === 'asset') {
    const asset = snapshot.assets.find((a) => a.id === selection.id);
    if (!asset) return <div className="insp-nosel"><p>ASSET NO LONGER EXISTS</p></div>;
    return <AssetInspector asset={asset} snapshot={snapshot} />;
  }
  const link = snapshot.links.find((l) => l.id === selection.id);
  if (!link) return <div className="insp-nosel"><p>LINK NOT PRESENT AT THIS TIME</p></div>;
  return <LinkInspector link={link} snapshot={snapshot} />;
}
