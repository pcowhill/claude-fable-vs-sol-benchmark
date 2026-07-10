import type {
  AssetId,
  EffectiveAsset,
  LinkState,
  PlanState,
  RouteState,
} from './types';
import {
  PREFERRED_LINK_FACTOR,
  ROUTE_HOP_COST,
  ROUTE_UNRELIABILITY_WEIGHT,
} from './constants';

interface Edge {
  to: AssetId;
  link: LinkState;
}

function buildAdjacency(links: LinkState[]): Map<AssetId, Edge[]> {
  const adj = new Map<AssetId, Edge[]>();
  const push = (from: AssetId, to: AssetId, link: LinkState) => {
    const list = adj.get(from) ?? [];
    list.push({ to, link });
    adj.set(from, list);
  };
  for (const link of links) {
    if (!link.available) continue;
    push(link.a, link.b, link);
    push(link.b, link.a, link);
  }
  return adj;
}

function edgeCost(link: LinkState, preferred: AssetId | undefined): number {
  let cost =
    link.latencyS +
    ROUTE_HOP_COST +
    (1 - link.reliability) * ROUTE_UNRELIABILITY_WEIGHT;
  if (preferred && (link.a === preferred || link.b === preferred)) {
    cost *= PREFERRED_LINK_FACTOR;
  }
  return cost;
}

/**
 * Dijkstra from the Earth terminal set outward. Terminals start at zero cost,
 * so each asset's predecessor chain is its best route back to Earth.
 */
function shortestPaths(
  assets: EffectiveAsset[],
  adj: Map<AssetId, Edge[]>,
  preferred: AssetId | undefined,
): Map<AssetId, { cost: number; prev: AssetId | null; prevLink: LinkState | null }> {
  const state = new Map<
    AssetId,
    { cost: number; prev: AssetId | null; prevLink: LinkState | null }
  >();
  const visited = new Set<AssetId>();
  for (const a of assets) {
    state.set(a.id, {
      cost: a.isEarthTerminal && a.enabled ? 0 : Infinity,
      prev: null,
      prevLink: null,
    });
  }
  // Simple O(n²) Dijkstra — asset counts are small (< 30).
  for (;;) {
    let current: AssetId | null = null;
    let best = Infinity;
    for (const [id, s] of state) {
      if (!visited.has(id) && s.cost < best) {
        best = s.cost;
        current = id;
      }
    }
    if (current === null) break;
    visited.add(current);
    for (const edge of adj.get(current) ?? []) {
      const next = state.get(edge.to);
      if (!next || visited.has(edge.to)) continue;
      const cost = best + edgeCost(edge.link, preferred);
      if (cost < next.cost) {
        next.cost = cost;
        next.prev = current;
        next.prevLink = edge.link;
      }
    }
  }
  return state;
}

function traceRoute(
  assetId: AssetId,
  state: Map<AssetId, { cost: number; prev: AssetId | null; prevLink: LinkState | null }>,
): RouteState {
  const s = state.get(assetId);
  if (!s || s.cost === Infinity) {
    return {
      assetId,
      connected: false,
      path: [],
      latencyS: 0,
      reliability: 0,
      bottleneckMbps: 0,
      hops: 0,
    };
  }
  const path: AssetId[] = [assetId];
  let latencyS = 0;
  let reliability = 1;
  let bottleneckMbps = Infinity;
  let cursor = assetId;
  let guard = 0;
  while (guard++ < 64) {
    const node = state.get(cursor);
    if (!node || node.prev === null) break;
    const link = node.prevLink!;
    latencyS += link.latencyS;
    reliability *= link.reliability;
    bottleneckMbps = Math.min(bottleneckMbps, link.bandwidthMbps);
    cursor = node.prev;
    path.push(cursor);
  }
  return {
    assetId,
    connected: path.length > 1,
    path,
    latencyS,
    reliability,
    bottleneckMbps: bottleneckMbps === Infinity ? 0 : bottleneckMbps,
    hops: path.length - 1,
  };
}

/** Routes to Earth for every critical (and enabled, non-terminal) asset. */
export function computeRoutes(
  assets: EffectiveAsset[],
  links: LinkState[],
  plan: PlanState,
): Record<AssetId, RouteState> {
  const adj = buildAdjacency(links);
  const baseState = shortestPaths(assets, adj, undefined);
  const routes: Record<AssetId, RouteState> = {};
  for (const asset of assets) {
    if (asset.isEarthTerminal) continue;
    const preferred = plan.preferredRelay[asset.id];
    if (!asset.enabled) {
      routes[asset.id] = {
        assetId: asset.id,
        connected: false,
        path: [],
        latencyS: 0,
        reliability: 0,
        bottleneckMbps: 0,
        hops: 0,
      };
      continue;
    }
    if (preferred) {
      const biased = shortestPaths(assets, adj, preferred);
      routes[asset.id] = traceRoute(asset.id, biased);
    } else {
      routes[asset.id] = traceRoute(asset.id, baseState);
    }
  }
  return routes;
}
