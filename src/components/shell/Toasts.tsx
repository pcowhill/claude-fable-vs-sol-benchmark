import { useStore } from '../../state/store';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span className="toast-msg">{t.message}</span>
          {t.undo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                t.undo?.();
                dismiss(t.id);
              }}
            >
              {t.undoLabel ?? 'Undo'}
            </button>
          )}
          <button
            type="button"
            className="toast-x"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
