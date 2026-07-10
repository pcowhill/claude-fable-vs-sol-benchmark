import { useSnapshot } from './state/hooks';
import { useScenario } from './state/store';
import { useSimClock } from './components/shell/useSimClock';
import { useGlobalShortcuts } from './components/shell/useGlobalShortcuts';
import { Header } from './components/shell/Header';
import { Dialogs } from './components/shell/Dialogs';
import { Toasts } from './components/shell/Toasts';
import { LeftRail } from './components/rail/LeftRail';
import { RightRail } from './components/panels/RightRail';
import { MapView } from './components/map/MapView';
import { TimelineBar } from './components/timeline/TimelineBar';

export default function App() {
  useSimClock();
  useGlobalShortcuts();
  const scenario = useScenario();
  const snapshot = useSnapshot();

  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <LeftRail snapshot={snapshot} />
        <MapView scenario={scenario} snapshot={snapshot} />
        <RightRail snapshot={snapshot} />
      </main>
      <TimelineBar />
      <Toasts />
      <Dialogs />
    </div>
  );
}
