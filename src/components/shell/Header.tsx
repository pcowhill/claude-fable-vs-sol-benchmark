import { useScenario, useStore } from '../../state/store';
import { scenarios } from '../../scenarios';
import { fmtClock, fmtMissionTime } from '../../lib/format';
import { downloadJson } from '../../lib/download';

function Wordmark() {
  return (
    <div className="hdr-wordmark">
      <svg viewBox="0 0 32 32" className="hdr-mark" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M16 5v7M16 20v7M6.5 21.5l6-3.5M25.5 21.5l-6-3.5" />
        </g>
        <circle cx="16" cy="16" r="2.4" fill="var(--amber)" stroke="none" />
        <circle cx="16" cy="5" r="1.7" fill="currentColor" />
        <circle cx="6.5" cy="21.5" r="1.7" fill="currentColor" />
        <circle cx="25.5" cy="21.5" r="1.7" fill="currentColor" />
      </svg>
      <div className="hdr-title">
        <span className="hdr-name">ASTERISM</span>
        <span className="hdr-sub">RELAY PLANNING CONSOLE</span>
      </div>
    </div>
  );
}

export function Header() {
  const scenario = useScenario();
  const setScenario = useStore((s) => s.setScenario);
  const timeS = useStore((s) => s.timeS);
  const playing = useStore((s) => s.playing);
  const saveBaseline = useStore((s) => s.saveBaseline);
  const setDialog = useStore((s) => s.setDialog);
  const exportJson = useStore((s) => s.exportJson);
  const pushToast = useStore((s) => s.pushToast);

  const onExport = () => {
    downloadJson(`asterism-${scenario.id}-plan.json`, exportJson());
    pushToast({ message: 'Plan exported as JSON.', tone: 'success' });
  };

  return (
    <header className="hdr">
      <Wordmark />
      <div className="hdr-scenario">
        <label className="hdr-field">
          <span className="hdr-label">SCENARIO</span>
          <select
            value={scenario.id}
            onChange={(e) => setScenario(e.target.value)}
            aria-label="Mission scenario"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="hdr-epoch">
          <span className="hdr-label">EPOCH</span>
          <span className="hdr-mono">{scenario.epochLabel}</span>
        </div>
      </div>
      <div className="hdr-spacer" />
      <div className="hdr-clock" data-testid="mission-clock">
        <div className="hdr-clock-met">
          <span className="hdr-label">MISSION ELAPSED</span>
          <span className="hdr-mono hdr-met" data-testid="met-readout">
            {fmtMissionTime(timeS)}
          </span>
        </div>
        <div className="hdr-clock-utc">
          <span className="hdr-label">STATION TIME</span>
          <span className="hdr-mono">{fmtClock(timeS)}</span>
        </div>
        <span
          className={`hdr-run ${playing ? 'is-running' : ''}`}
          aria-live="polite"
        >
          {playing ? 'RUNNING' : 'HOLD'}
        </span>
      </div>
      <div className="hdr-actions">
        <button type="button" onClick={saveBaseline} title="Capture current plan as baseline (S)">
          BASELINE
        </button>
        <button type="button" onClick={onExport} title="Export scenario + plan as JSON">
          EXPORT
        </button>
        <button type="button" onClick={() => setDialog('import')} title="Import a plan JSON file">
          IMPORT
        </button>
        <button
          type="button"
          onClick={() => setDialog('reset-confirm')}
          title="Reset scenario to seeded state"
        >
          RESET
        </button>
        <button
          type="button"
          className="hdr-help"
          onClick={() => setDialog('shortcuts')}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          ?
        </button>
      </div>
    </header>
  );
}
