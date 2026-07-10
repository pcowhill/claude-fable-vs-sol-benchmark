import { useEffect } from 'react';
import { useStore } from '../../state/store';
import { useEvents } from '../../state/hooks';
import { getScenario } from '../../scenarios';

const isFormField = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    el.isContentEditable
  );
};

const isInteractive = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'BUTTON' || el.tagName === 'A' || isFormField(el);
};

export function useGlobalShortcuts(): void {
  const events = useEvents();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.defaultPrevented) return;
      if (isFormField(e.target)) return;
      // While a dialog is open, only Escape (native) applies.
      if (s.dialog) return;

      const seekEvent = (direction: 1 | -1) => {
        const t = s.timeS;
        const sorted = events;
        const next =
          direction === 1
            ? sorted.find((ev) => ev.timeS > t + 1)
            : [...sorted].reverse().find((ev) => ev.timeS < t - 1);
        if (next) {
          s.setTime(next.timeS);
          if (next.assetId) s.select({ kind: 'asset', id: next.assetId });
        }
      };

      switch (e.key) {
        case ' ':
          if (isInteractive(e.target)) return;
          e.preventDefault();
          s.togglePlaying();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          s.stepTime(e.shiftKey ? -3600 : -300);
          break;
        case 'ArrowRight':
          e.preventDefault();
          s.stepTime(e.shiftKey ? 3600 : 300);
          break;
        case 'Home':
          e.preventDefault();
          s.setTime(getScenario(s.scenarioId).defaultTimeS);
          break;
        case 'e':
          seekEvent(1);
          break;
        case 'E':
          seekEvent(-1);
          break;
        case '1':
          s.setSpeed(60);
          break;
        case '2':
          s.setSpeed(300);
          break;
        case '3':
          s.setSpeed(1800);
          break;
        case 's':
          s.saveBaseline();
          break;
        case 'i':
          s.setRightTab('inspect');
          break;
        case 'p':
          s.setRightTab('plan');
          break;
        case 'c':
          s.setRightTab('compare');
          break;
        case '?':
          s.setDialog('shortcuts');
          break;
        case 'Escape':
          if (s.selection) s.select(null);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [events]);
}
