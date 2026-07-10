import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';

function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [onClose]);
  return ref;
}

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause the mission clock'],
  ['← / →', 'Step time ±5 minutes'],
  ['Shift + ← / →', 'Step time ±1 hour'],
  ['Home', 'Return to scenario start'],
  ['E / Shift+E', 'Jump to next / previous event'],
  ['1 / 2 / 3', 'Playback rate ×60 / ×300 / ×1800'],
  ['S', 'Capture baseline'],
  ['I / P / C', 'Inspector / Plan / Compare tab'],
  ['Esc', 'Clear selection · close dialog'],
  ['?', 'This reference'],
];

function ShortcutsDialog() {
  const dialog = useStore((s) => s.dialog);
  const setDialog = useStore((s) => s.setDialog);
  const ref = useModal(dialog === 'shortcuts', () => setDialog(null));
  return (
    <dialog ref={ref} className="dlg" aria-label="Keyboard shortcuts">
      <header className="dlg-head">
        <h2>KEYBOARD REFERENCE</h2>
        <button type="button" onClick={() => setDialog(null)} aria-label="Close">
          ✕
        </button>
      </header>
      <table className="dlg-shortcuts">
        <tbody>
          {SHORTCUTS.map(([key, desc]) => (
            <tr key={key}>
              <td>
                <kbd>{key}</kbd>
              </td>
              <td>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </dialog>
  );
}

function ImportDialog() {
  const dialog = useStore((s) => s.dialog);
  const setDialog = useStore((s) => s.setDialog);
  const importJson = useStore((s) => s.importJson);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const open = dialog === 'import';
  const ref = useModal(open, () => setDialog(null));

  useEffect(() => {
    if (open) {
      setText('');
      setErrors([]);
    }
  }, [open]);

  const submit = (payload: string) => {
    const res = importJson(payload);
    if (!res.ok) setErrors(res.errors);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    submit(content);
  };

  return (
    <dialog ref={ref} className="dlg dlg-import" aria-label="Import plan">
      <header className="dlg-head">
        <h2>IMPORT PLAN</h2>
        <button type="button" onClick={() => setDialog(null)} aria-label="Close">
          ✕
        </button>
      </header>
      <p className="dlg-note">
        Load a previously exported <code>asterism.plan</code> JSON file. The
        active scenario, relay plan, baseline and clock are replaced.
      </p>
      <label className="dlg-file">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => void onFile(e.target.files?.[0])}
          data-testid="import-file"
        />
        <span>CHOOSE FILE…</span>
      </label>
      <label className="dlg-textlabel" htmlFor="import-text">
        or paste JSON
      </label>
      <textarea
        id="import-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        spellCheck={false}
        placeholder='{"format":"asterism.plan","version":1,…}'
        data-testid="import-text"
      />
      {errors.length > 0 && (
        <div className="dlg-errors" role="alert" data-testid="import-errors">
          <strong>Import rejected:</strong>
          <ul>
            {errors.slice(0, 6).map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}
      <footer className="dlg-foot">
        <button type="button" onClick={() => setDialog(null)}>
          CANCEL
        </button>
        <button
          type="button"
          className="is-primary"
          disabled={!text.trim()}
          onClick={() => submit(text)}
          data-testid="import-submit"
        >
          IMPORT
        </button>
      </footer>
    </dialog>
  );
}

function ResetDialog() {
  const dialog = useStore((s) => s.dialog);
  const setDialog = useStore((s) => s.setDialog);
  const resetScenario = useStore((s) => s.resetScenario);
  const ref = useModal(dialog === 'reset-confirm', () => setDialog(null));
  return (
    <dialog ref={ref} className="dlg" aria-label="Reset scenario">
      <header className="dlg-head">
        <h2>RESET SCENARIO</h2>
        <button type="button" onClick={() => setDialog(null)} aria-label="Close">
          ✕
        </button>
      </header>
      <p className="dlg-note">
        Discard the working relay plan, baseline and clock for this scenario
        and return to the seeded state. This cannot be undone.
      </p>
      <footer className="dlg-foot">
        <button type="button" onClick={() => setDialog(null)}>
          KEEP PLAN
        </button>
        <button
          type="button"
          className="is-danger"
          onClick={resetScenario}
          data-testid="reset-confirm"
        >
          RESET SCENARIO
        </button>
      </footer>
    </dialog>
  );
}

export function Dialogs() {
  return (
    <>
      <ShortcutsDialog />
      <ImportDialog />
      <ResetDialog />
    </>
  );
}
