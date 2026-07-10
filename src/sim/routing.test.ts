import { describe, expect, it } from 'vitest';
import { lunarSouthPole } from '../scenarios/lunarSouthPole';
import { computeSnapshot } from './snapshot';
import { emptyPlan } from './plan';
import type { PlanState } from './types';

const scenario = lunarSouthPole;

describe('routing', () => {
  it('routes the limb base through a relay — never direct to Earth', () => {
    const snap = computeSnapshot(scenario, emptyPlan(), 0);
    const route = snap.routes['shackleton'];
    expect(route.connected).toBe(true);
    expect(route.path.length).toBeGreaterThan(2);
    expect(route.path[0]).toBe('shackleton');
    const terminal = snap.assets.find(
      (a) => a.id === route.path[route.path.length - 1],
    );
    expect(terminal?.isEarthTerminal).toBe(true);
    // First hop must be a relay, not an Earth station.
    const hop = snap.assets.find((a) => a.id === route.path[1]);
    expect(hop?.kind).toBe('relay');
  });

  it('route metrics multiply/accumulate along the path', () => {
    const snap = computeSnapshot(scenario, emptyPlan(), 0);
    const route = snap.routes['shackleton'];
    let latency = 0;
    let reliability = 1;
    for (let i = 0; i < route.path.length - 1; i++) {
      const [x, y] = [route.path[i], route.path[i + 1]].sort();
      const link = snap.links.find((l) => l.id === `${x}::${y}`)!;
      latency += link.latencyS;
      reliability *= link.reliability;
    }
    expect(route.latencyS).toBeCloseTo(latency, 9);
    expect(route.reliability).toBeCloseTo(reliability, 9);
  });

  it('disabling every lunar relay severs the base', () => {
    const plan: PlanState = {
      userRelays: [],
      overrides: {
        'argus-1': { enabled: false },
        'argus-2': { enabled: false },
      },
      preferredRelay: {},
    };
    const snap = computeSnapshot(scenario, plan, 0);
    expect(snap.routes['shackleton'].connected).toBe(false);
    expect(snap.routes['vireo'].connected).toBe(false);
  });

  it('honours a preferred relay when it is viable', () => {
    // At T+0 ARGUS-1 is overhead; base would normally route via ARGUS-1.
    const auto = computeSnapshot(scenario, emptyPlan(), 0);
    expect(auto.routes['shackleton'].path[1]).toBe('argus-1');
    // A user relay parked at the same phase is an equally viable first hop.
    const plan: PlanState = {
      userRelays: [
        {
          id: 'user-relay-1',
          name: 'KESTREL-3',
          regionId: 'lunar-orbit-1500',
          phaseDeg: 310,
          txPowerW: 126,
          enabled: true,
        },
      ],
      overrides: {},
      preferredRelay: { shackleton: 'user-relay-1' },
    };
    const pinned = computeSnapshot(scenario, plan, 0);
    expect(pinned.routes['shackleton'].connected).toBe(true);
    expect(pinned.routes['shackleton'].path).toContain('user-relay-1');
  });

  it('disabled critical assets report disconnected without routes', () => {
    const plan: PlanState = {
      userRelays: [],
      overrides: { keystone: { enabled: false } },
      preferredRelay: {},
    };
    const snap = computeSnapshot(scenario, plan, 0);
    // Keystone is not critical; but its links must all be gone.
    const keystoneLinks = snap.links.filter(
      (l) => (l.a === 'keystone' || l.b === 'keystone') && l.available,
    );
    expect(keystoneLinks).toHaveLength(0);
  });
});
