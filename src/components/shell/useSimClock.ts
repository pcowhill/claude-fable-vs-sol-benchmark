import { useEffect } from 'react';
import { useStore } from '../../state/store';

/** Advances mission time while playing (~30 fps updates, wall-clock based). */
export function useSimClock(): void {
  const playing = useStore((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      acc += dt;
      // Batch updates to ~30 Hz; the sim itself is continuous in time.
      if (acc >= 1 / 30) {
        useStore.getState().tick(acc);
        acc = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}
