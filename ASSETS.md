# External assets and packages

## Fonts

| Asset | Source | License | Used for | Delivery |
|---|---|---|---|---|
| IBM Plex Sans (400/500/600) | `@fontsource/ibm-plex-sans` (npm) | SIL OFL 1.1 | Interface prose, roster, panels | Bundled locally at build time (woff2 in `dist/`); no runtime network fetch |
| IBM Plex Mono (400/500/600) | `@fontsource/ibm-plex-mono` (npm) | SIL OFL 1.1 | All numeric/tabular data, micro-labels, buttons, map annotations | Bundled locally |
| IBM Plex Serif (400 italic) | `@fontsource/ibm-plex-serif` (npm) | SIL OFL 1.1 | Mission-brief editorial text | Bundled locally |

IBM Plex was chosen deliberately: a technical grotesque + matching mono with
true tabular figures reads like flight-operations tooling rather than a
marketing site, and the OFL license permits bundling.

## Iconography and artwork

All glyphs are original SVG drawn for this project: the asterism wordmark,
asset symbols (relay, ground station, surface station, vehicle), severity
glyphs (triangle/diamond/dot), transport icons, favicon, body shading and
map chrome. No third-party icon sets, textures, photographs or space imagery
are used. Scenario names, spacecraft designations and mission text are
invented for this simulation (DSS-14/43/63 are real public antenna
designations used as flavor; no insignia or branding is reproduced).

## Runtime npm dependencies (by purpose)

| Package | Purpose | License |
|---|---|---|
| `react`, `react-dom` | UI rendering | MIT |
| `zustand` | Predictable app state store | MIT |
| `@fontsource/*` | Self-hosted fonts (above) | SIL OFL 1.1 (fonts), MIT (packaging) |

## Development dependencies (by purpose)

Vite (build/dev server), TypeScript, `@vitejs/plugin-react`, Vitest (unit
tests), `@playwright/test` (browser tests + screenshots), `@types/*` type
definitions. All MIT/Apache-2.0 licensed. No other external code, data,
audio or visual assets were acquired.
