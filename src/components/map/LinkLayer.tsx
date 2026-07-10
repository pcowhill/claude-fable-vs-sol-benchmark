import { Fragment } from 'react';
import type { LinkState, Vec2 } from '../../sim/types';
import { useStore } from '../../state/store';
import { fmtDistanceKm, fmtMbps } from '../../lib/format';
import type { DisplayContext } from './projection';

function linkClass(link: LinkState): string {
  const cls = ['mv-link'];
  if (!link.available) cls.push('is-blocked');
  else if (link.stormDb > 4) cls.push('is-storm');
  else if (link.quality < 0.35) cls.push('is-thin');
  return cls.join(' ');
}

function LinkLine({
  link,
  a,
  b,
  selected,
  emphasized,
}: {
  link: LinkState;
  a: Vec2;
  b: Vec2;
  selected: boolean;
  emphasized: boolean;
}) {
  const select = useStore((s) => s.select);
  const width = link.available ? 0.7 + link.quality * 1.9 : 1;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return (
    <g
      className={`${linkClass(link)}${selected ? ' is-selected' : ''}${emphasized ? ' is-emph' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'link', id: link.id });
      }}
      role="button"
      tabIndex={-1}
      aria-label={`Link ${link.a} to ${link.b}${link.available ? '' : ', unavailable'}`}
    >
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="mv-link-hit" />
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        className="mv-link-line"
        strokeWidth={width}
      />
      {link.available && link.stormDb > 4 && (
        <text x={mid.x} y={mid.y - 4} className="mv-link-storm" textAnchor="middle">
          ≈
        </text>
      )}
      {!link.available && selected && (
        <text x={mid.x} y={mid.y + 3} className="mv-link-cross" textAnchor="middle">
          ✕
        </text>
      )}
      {selected && (
        <g className="mv-link-chip" transform={`translate(${mid.x},${mid.y + 14})`}>
          <rect x={-64} y={-9} width={128} height={18} rx={2} />
          <text y={4} textAnchor="middle">
            {link.available
              ? `${fmtDistanceKm(link.distanceKm)} · ${link.band.toUpperCase()} · ${fmtMbps(link.bandwidthMbps)}`
              : `${fmtDistanceKm(link.distanceKm)} · ${link.blocked === 'los' ? 'NO LINE OF SIGHT' : link.blocked === 'weak' ? 'BELOW MARGIN' : 'ENDPOINT OFFLINE'}`}
          </text>
        </g>
      )}
      <title>
        {`${link.a} ↔ ${link.b}: ${link.available ? `quality ${(link.quality * 100).toFixed(0)}%` : `blocked (${link.blocked})`}`}
      </title>
    </g>
  );
}

/** Active links, blocked links of the selected asset, and route overlays. */
export function LinkLayer({
  ctx,
  positionsPx,
}: {
  ctx: DisplayContext;
  positionsPx: Record<string, Vec2>;
}) {
  const selection = useStore((s) => s.selection);
  const { snapshot } = ctx;
  const selectedAssetId = selection?.kind === 'asset' ? selection.id : null;
  const selectedLinkId = selection?.kind === 'link' ? selection.id : null;

  const routeSegments = new Set<string>();
  const routes = Object.values(snapshot.routes).filter((r) => r.connected);
  for (const route of routes) {
    const asset = snapshot.assets.find((a) => a.id === route.assetId);
    if (!asset?.critical) continue;
    for (let i = 0; i < route.path.length - 1; i++) {
      const [x, y] = [route.path[i], route.path[i + 1]].sort();
      routeSegments.add(`${x}::${y}`);
    }
  }

  const visible = snapshot.links.filter((link) => {
    if (link.available) return true;
    if (selectedLinkId === link.id) return true;
    // Blocked links appear only for the selected endpoint, LOS/weak reasons.
    return (
      selectedAssetId !== null &&
      (link.a === selectedAssetId || link.b === selectedAssetId) &&
      link.blocked !== 'disabled'
    );
  });

  return (
    <g className="mv-links">
      {visible.map((link) => {
        const a = positionsPx[link.a];
        const b = positionsPx[link.b];
        if (!a || !b) return null;
        const onRoute = routeSegments.has(link.id);
        const touchesSelection =
          selectedAssetId !== null &&
          (link.a === selectedAssetId || link.b === selectedAssetId);
        return (
          <Fragment key={link.id}>
            {onRoute && link.available && (
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="mv-route"
              />
            )}
            <LinkLine
              link={link}
              a={a}
              b={b}
              selected={selectedLinkId === link.id}
              emphasized={touchesSelection}
            />
          </Fragment>
        );
      })}
    </g>
  );
}
