import { describe, expect, it } from 'vitest';
import { lunarSouthPole } from '../scenarios/lunarSouthPole';
import { solarStorm } from '../scenarios/solarStorm';
import { deriveEvents } from './events';
import { emptyPlan } from './plan';
import { computeSnapshot } from './snapshot';

describe('mission events', () => {
  const events = deriveEvents(lunarSouthPole, emptyPlan());

  it('is deterministic and time-sorted', () => {
    const again = deriveEvents(lunarSouthPole, emptyPlan());
    expect(again).toEqual(events);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timeS).toBeGreaterThanOrEqual(events[i - 1].timeS);
    }
  });

  it('marks mission windows that open uncovered as critical gaps', () => {
    const gap = events.find((e) => e.kind === 'window-gap');
    expect(gap).toBeDefined();
    expect(gap!.severity).toBe('critical');
    // The scenario is authored so the VIREO traverse opens dark at 04:00.
    expect(gap!.timeS).toBe(4 * 3600);
    const snap = computeSnapshot(lunarSouthPole, emptyPlan(), gap!.timeS);
    expect(snap.routes[gap!.assetId!]?.connected).toBe(false);
  });

  it('AOS/LOS transitions match the simulation at the refined timestamps', () => {
    const losEvents = events.filter((e) => e.kind === 'los').slice(0, 3);
    expect(losEvents.length).toBeGreaterThan(0);
    for (const e of losEvents) {
      const before = computeSnapshot(lunarSouthPole, emptyPlan(), e.timeS - 30);
      const after = computeSnapshot(lunarSouthPole, emptyPlan(), e.timeS + 30);
      expect(before.routes[e.assetId!]?.connected).toBe(true);
      expect(after.routes[e.assetId!]?.connected).toBe(false);
    }
  });

  it('includes scripted storm milestones in the storm scenario', () => {
    const stormEvents = deriveEvents(solarStorm, emptyPlan());
    expect(stormEvents.some((e) => e.kind === 'storm-start')).toBe(true);
    expect(stormEvents.some((e) => e.kind === 'storm-end')).toBe(true);
    const start = stormEvents.find((e) => e.kind === 'storm-start')!;
    expect(start.timeS).toBe(9 * 3600);
  });

  it('emits ground-station handoffs as the Earth rotates', () => {
    expect(events.some((e) => e.kind === 'handoff')).toBe(true);
  });
});
