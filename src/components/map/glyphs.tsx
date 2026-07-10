import type { AssetKind } from '../../sim/types';

/** Purpose-drawn asset symbols, centered on (0,0), ~14 px envelope. */
export function AssetSymbol({
  kind,
  className,
}: {
  kind: AssetKind;
  className?: string;
}) {
  switch (kind) {
    case 'relay':
      return (
        <g className={className}>
          <rect x={-10.5} y={-2.2} width={5.5} height={4.4} className="glyph-wing" />
          <rect x={5} y={-2.2} width={5.5} height={4.4} className="glyph-wing" />
          <path d="M0,-6 L5,0 L0,6 L-5,0 Z" className="glyph-hull" />
        </g>
      );
    case 'ground-station':
      return (
        <g className={className}>
          <path d="M-7,6 L7,6" className="glyph-line" />
          <path d="M0,6 L0,1" className="glyph-line" />
          <path d="M-6,1 A 6.5 6.5 0 0 1 6,-1 Z" className="glyph-hull" />
          <path d="M1,-1 L5,-6" className="glyph-line" />
        </g>
      );
    case 'surface':
      return (
        <g className={className}>
          <rect x={-5} y={-3} width={10} height={8} className="glyph-hull" />
          <path d="M0,-3 L0,-8 M-3,-8 L3,-8" className="glyph-line" />
        </g>
      );
    case 'ship':
      return (
        <g className={className}>
          <path d="M8,0 L-2,-5 L-6,-2.5 L-6,2.5 L-2,5 Z" className="glyph-hull" />
          <path d="M-7.5,-2 L-10,0 L-7.5,2" className="glyph-line" />
        </g>
      );
  }
}

/** Corner-bracket selection reticle. */
export function Reticle({ r }: { r: number }) {
  const c = r;
  const l = Math.max(4, r * 0.55);
  const seg = (x: number, y: number, dx: number, dy: number) =>
    `M${x + dx * l},${y} L${x},${y} L${x},${y + dy * l}`;
  return (
    <path
      className="mv-reticle"
      d={[
        seg(-c, -c, 1, 1),
        seg(c, -c, -1, 1),
        seg(c, c, -1, -1),
        seg(-c, c, 1, -1),
      ].join(' ')}
    />
  );
}

export function SeverityGlyph({ severity }: { severity: 'info' | 'warning' | 'critical' }) {
  if (severity === 'critical') {
    return (
      <svg viewBox="0 0 12 12" className={`sev sev-critical`} aria-hidden="true">
        <path d="M6 1 L11 10.5 H1 Z" fill="currentColor" />
        <rect x="5.35" y="4.4" width="1.3" height="3.4" fill="var(--bg0)" />
        <rect x="5.35" y="8.6" width="1.3" height="1.3" fill="var(--bg0)" />
      </svg>
    );
  }
  if (severity === 'warning') {
    return (
      <svg viewBox="0 0 12 12" className={`sev sev-warning`} aria-hidden="true">
        <path d="M6 1 L11 6 L6 11 L1 6 Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 12" className={`sev sev-info`} aria-hidden="true">
      <circle cx="6" cy="6" r="3.6" fill="currentColor" />
    </svg>
  );
}
