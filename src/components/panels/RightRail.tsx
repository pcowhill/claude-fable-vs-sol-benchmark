import type { SimSnapshot } from '../../sim/types';
import { useStore, type RightTab } from '../../state/store';
import { InspectorPanel } from './InspectorPanel';
import { PlanPanel } from './PlanPanel';
import { ComparePanel } from './ComparePanel';

const TABS: Array<{ id: RightTab; label: string; key: string }> = [
  { id: 'inspect', label: 'INSPECT', key: 'I' },
  { id: 'plan', label: 'PLAN', key: 'P' },
  { id: 'compare', label: 'COMPARE', key: 'C' },
];

export function RightRail({ snapshot }: { snapshot: SimSnapshot }) {
  const tab = useStore((s) => s.rightTab);
  const setTab = useStore((s) => s.setRightTab);
  const hasBaseline = useStore((s) => s.baseline !== null);

  return (
    <aside className="rail rail-right" aria-label="Planning panels">
      <div className="tabs" role="tablist" aria-label="Panel selection">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
            title={`${t.label} (${t.key})`}
          >
            {t.label}
            {t.id === 'compare' && hasBaseline && (
              <span className="tab-dot" aria-label="baseline saved" />
            )}
          </button>
        ))}
      </div>
      <div
        className="rail-body"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'inspect' && <InspectorPanel snapshot={snapshot} />}
        {tab === 'plan' && <PlanPanel snapshot={snapshot} />}
        {tab === 'compare' && <ComparePanel />}
      </div>
    </aside>
  );
}
