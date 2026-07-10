import { useEffect, useMemo, useState } from 'react';
import { useScenario, useStore } from '../../state/store';
import { useMetrics } from '../../state/hooks';
import type { SimSnapshot } from '../../sim/types';
import { MAX_USER_RELAYS } from '../../state/validate';
import { fmtW } from '../../lib/format';
import { MetricsBlock } from './MetricsBlock';

function DeployForm({ onDone }: { onDone: () => void }) {
  const scenario = useScenario();
  const addRelay = useStore((s) => s.addRelay);
  const setPlanDraft = useStore((s) => s.setPlanDraft);
  const relayCounter = useStore((s) => s.relayCounter);
  const [name, setName] = useState(`RELAY-${String(relayCounter).padStart(2, '0')}`);
  const [regionId, setRegionId] = useState(scenario.regions[0]?.id ?? '');
  const [phaseDeg, setPhaseDeg] = useState(0);
  const region = scenario.regions.find((r) => r.id === regionId);
  const [txPowerW, setTxPowerW] = useState(region?.comms.defaultPowerW ?? 100);
  const [errors, setErrors] = useState<string[]>([]);

  // Live ghost preview on the map while configuring.
  useEffect(() => {
    setPlanDraft({ regionId, phaseDeg });
    return () => setPlanDraft(null);
  }, [regionId, phaseDeg, setPlanDraft]);

  useEffect(() => {
    if (region) setTxPowerW(region.comms.defaultPowerW);
  }, [regionId, region]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addRelay({ name, regionId, phaseDeg, txPowerW });
    if (res.ok) {
      onDone();
    } else {
      setErrors(res.errors);
    }
  };

  return (
    <form className="deploy" onSubmit={submit} data-testid="deploy-form">
      <label className="field">
        <span className="field-label">DESIGNATION</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="e.g. KESTREL-3"
          data-testid="deploy-name"
        />
      </label>
      <label className="field">
        <span className="field-label">DEPLOYMENT REGION</span>
        <select
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
          data-testid="deploy-region"
        >
          {scenario.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {region && <p className="field-note">{region.note}</p>}
      <label className="field field-range">
        <span className="field-label">ORBIT PHASE</span>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={phaseDeg}
          onChange={(e) => setPhaseDeg(Number(e.target.value))}
          data-testid="deploy-phase"
        />
        <span className="field-num">{phaseDeg}°</span>
      </label>
      {region && (
        <label className="field field-range">
          <span className="field-label">TX POWER</span>
          <input
            type="range"
            min={region.comms.minPowerW}
            max={region.comms.maxPowerW}
            step={1}
            value={txPowerW}
            onChange={(e) => setTxPowerW(Number(e.target.value))}
            data-testid="deploy-power"
          />
          <span className="field-num">{fmtW(txPowerW)}</span>
        </label>
      )}
      {errors.length > 0 && (
        <ul className="form-error" role="alert" data-testid="deploy-errors">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}
      <div className="deploy-actions">
        <button type="button" onClick={onDone}>
          CANCEL
        </button>
        <button type="submit" className="is-primary" data-testid="deploy-submit">
          DEPLOY RELAY
        </button>
      </div>
    </form>
  );
}

export function PlanPanel({ snapshot }: { snapshot: SimSnapshot }) {
  const scenario = useScenario();
  const metrics = useMetrics();
  const plan = useStore((s) => s.plan);
  const select = useStore((s) => s.select);
  const setAssetEnabled = useStore((s) => s.setAssetEnabled);
  const removeRelay = useStore((s) => s.removeRelay);
  const [deploying, setDeploying] = useState(false);

  const relays = useMemo(
    () => snapshot.assets.filter((a) => a.kind === 'relay'),
    [snapshot],
  );
  const budgetLeft = MAX_USER_RELAYS - plan.userRelays.length;

  return (
    <div className="plan" data-testid="plan-panel">
      <section className="insp-section">
        <h4 className="insp-sechead">PLAN METRICS · 24 H</h4>
        <MetricsBlock metrics={metrics} />
      </section>

      <section className="insp-section">
        <h4 className="insp-sechead">
          RELAY CONSTELLATION
          <span className="rail-count">{relays.length}</span>
        </h4>
        <ul className="relay-list">
          {relays.map((relay) => {
            const carrying = Object.values(snapshot.routes).filter(
              (r) => r.connected && r.path.slice(1, -1).includes(relay.id),
            ).length;
            return (
              <li key={relay.id} className={`relay-row${relay.enabled ? '' : ' is-off'}`}>
                <label className="relay-enable" title={relay.enabled ? 'Disable relay' : 'Enable relay'}>
                  <input
                    type="checkbox"
                    checked={relay.enabled}
                    onChange={(e) => setAssetEnabled(relay.id, e.target.checked)}
                    aria-label={`${relay.name} enabled`}
                  />
                  <span aria-hidden="true" />
                </label>
                <button
                  type="button"
                  className="relay-name linklike"
                  onClick={() => select({ kind: 'asset', id: relay.id })}
                  title={relay.role}
                >
                  {relay.name}
                  {relay.userCreated && <span className="roster-badge">OPR</span>}
                </button>
                <span className="relay-meta">
                  {fmtW(relay.comms.txPowerW)}
                  {relay.enabled
                    ? carrying > 0
                      ? ` · ${carrying} ROUTE${carrying > 1 ? 'S' : ''}`
                      : ' · STANDBY'
                    : ' · OFF'}
                </span>
                {relay.userCreated && (
                  <button
                    type="button"
                    className="relay-remove"
                    title={`Decommission ${relay.name}`}
                    aria-label={`Decommission ${relay.name}`}
                    onClick={() => removeRelay(relay.id)}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="insp-section">
        {deploying ? (
          <DeployForm onDone={() => setDeploying(false)} />
        ) : (
          <>
            <button
              type="button"
              className="is-primary plan-add"
              onClick={() => setDeploying(true)}
              disabled={budgetLeft <= 0}
              data-testid="open-deploy"
            >
              + DEPLOY NEW RELAY
            </button>
            <p className="field-note">
              {budgetLeft > 0
                ? `${budgetLeft} of ${MAX_USER_RELAYS} deployment slots available in ${scenario.name}.`
                : 'Deployment budget exhausted — decommission a relay to free a slot.'}
            </p>
          </>
        )}
      </section>

      <section className="insp-section">
        <h4 className="insp-sechead">ROUTING PREFERENCES</h4>
        {Object.keys(plan.preferredRelay).length === 0 ? (
          <p className="insp-empty">
            No pinned routes. Pin a preferred relay from an asset's inspector.
          </p>
        ) : (
          <ul className="pref-list">
            {Object.entries(plan.preferredRelay).map(([assetId, relayId]) => {
              const asset = snapshot.assets.find((a) => a.id === assetId);
              const relay = snapshot.assets.find((a) => a.id === relayId);
              return (
                <li key={assetId} className="pref-row">
                  <span>
                    {(asset?.name ?? assetId).toUpperCase()} →{' '}
                    {(relay?.name ?? relayId).toUpperCase()}
                  </span>
                  <button
                    type="button"
                    aria-label={`Clear preference for ${asset?.name ?? assetId}`}
                    onClick={() =>
                      useStore.getState().setPreferredRelay(assetId, null)
                    }
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
