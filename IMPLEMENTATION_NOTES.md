# Implementation notes

## Design decisions

- **Schematic tilted plan view over "realistic" 3-D.** A 25°-tilted 2-D
  plan with log-compressed radial distances shows Earth, Moon and Mars
  regimes on one canvas, keeps every element selectable, and reads like an
  operations chart rather than a game. Physics never uses display
  coordinates — the projection is presentation only, and the map says so
  ("SCHEMATIC PROJECTION · RADIAL DISTANCES COMPRESSED").
- **Dark instrument theme with IBM Plex.** Hairline-divided square panels,
  10px letterspaced mono micro-labels, tabular numerals everywhere data
  appears, one accent (cyan) plus status amber/red/green, and a serif
  italic reserved for the mission brief as the single editorial voice.
  No cards, no gradients-for-decoration, no glassmorphism.
- **The console opens paused at T+0.** Deterministic first paint beats
  autoplay; the scenario geometry at T+0 is authored to be busy (active
  routes, inbound vehicle), and RUNNING/HOLD state is explicit in the
  header.
- **Severity is never color-only** — critical/warning/info have distinct
  shapes (triangle/diamond/dot) plus text labels; coverage gaps use
  hatching; improved/worse deltas carry arrows and words.
- **Authored planning problems.** Each scenario ships with deliberate
  deficiencies (uncovered windows, a degradation, a storm) whose fixes
  create real trade-offs — e.g. a third lunar relay closes the traverse gap
  but blows the energy budget priority.

## Engineering decisions

- **Pure simulation core** (`src/sim`) with no React imports: positions →
  links → routes → snapshot/metrics/events as plain functions of
  `(scenario, plan, time)`. All UI state derives from these; unit tests
  hit the same code paths the UI renders.
- **Determinism as a hard rule.** No `Math.random()`, no wall-clock in the
  model; identical inputs always produce identical outputs (tested).
  Event transition times are refined by bisection to ~2 s so the event log
  reads like a real pass schedule instead of 5-minute quantization.
- **Zustand store with explicit actions** returning `{ok, errors}` for
  anything user-validated; persistence is a thin localStorage layer with
  injectable storage for tests, and imports/storage share one deep
  validator (`validatePlanState`).
- **Metrics/event caching on `(scenarioId, JSON(plan))`** keys keeps
  scrubbing at interactive framerates; only plan edits recompute the 24 h
  sweep (289 samples × Dijkstra, ~tens of ms).
- **O(n²) Dijkstra, seeded from all Earth terminals at cost 0** — one pass
  yields every asset's best route; per-asset preference biasing multiplies
  costs on links touching the pinned relay (×0.55) instead of hard
  constraints, so a pin can never fabricate an invalid route.

## Assumptions

- A 24 h window with a fixed scenario epoch label; "scenario start" is T+0.
- Operator relays deploy only into scenario-defined regions (orbit shells
  with fixed hardware fit), which keeps deployments physically coherent and
  gives validation clear limits (6-relay budget, per-region power ranges).
- Seeded assets can be tuned (power, enable) but not renamed/removed; only
  operator relays can be renamed, re-phased and decommissioned.
- Mission-critical assets cannot be disabled from the comms console.
- Ground stations are grid-powered, so the energy metric tracks relay
  spacecraft only.

## Alternatives considered

- **Canvas/WebGL rendering** — rejected: SVG gives free hit-testing,
  crisp text, DOM accessibility hooks, and the element count (~150) is far
  below SVG's practical ceiling.
- **Real link-budget physics (FSPL at carrier frequency, EIRP, G/T)** —
  rejected: the ~230 dB dynamic range between LEO and Mars makes every
  regime either saturated or dead without per-regime constants anyway; the
  toy budget keeps the same monotonic structure with legible numbers, and
  the inspector exposes it honestly.
- **Contact-graph routing (CGR/DTN-style scheduling)** — out of scope;
  instantaneous best-path per sample is understandable and sufficient for
  comparing plans.
- **A command palette** — dropped in favor of finishing quality on the
  shortcut set + dialogs; nothing on screen is decorative or stubbed.
- **zod for validation** — hand-rolled validators produce precise,
  domain-specific error strings (surfaced verbatim in the import dialog)
  without a dependency.

## Changed after visual inspection

Nine screenshot-inspect-refine rounds against the running app. Highlights:

1. First render put the whole system in ~25% of the canvas — rescaled all
   three scenario layouts twice (Earth/Moon discs, ring radii, moon-zone
   enlarged ~2×) to fill the frame at 1920×1080.
2. Labels around the Moon (two surface sites + two orbiters in one sector)
   stacked illegibly — replaced side-flipped labels with radial placement
   fanning outward from the anchor body, plus shorter map designations
   (`SHACKLETON`, `TYCHO CAMP`) and a farther text radius for surface
   sites than orbiters.
3. The coverage strip rendered as broken dashes — merged sample runs were
   drawn without spanning the sampling step; widened each run by one step.
4. Roster rows truncated ("Shackleton Ridge Sta…") — moved status to a
   second line and shortened via-names to first tokens.
5. Empty top-right corner — added the live CUSTODY / LINKS UP / RELAYS /
   SOLAR EVENT readout, which also gives storms a persistent numeric home.
6. Relay inspectors ran sparse — added a LOAD section (state, routes
   carried with clickable owners, present power draw).
7. Ring labels collided with station labels — moved earth-ring labels to
   the lower-left quadrant, mars-ring labels upper-right.
8. At 1366×768 the brief crowded out live data — clamped to 3 lines and
   tightened rail spacing below 900px viewport height.
9. Playwright caught a real interaction bug: pointer capture on
   `pointerdown` (for map panning) retargeted click events and silently
   broke asset/link selection on the map — capture now begins only after
   the drag threshold. Map-level selection is asserted in e2e now.

## Remaining limitations

- No inclined/elliptical orbits (2-D model) — see README simplifications.
- Undo exists for destructive actions (decommission, restore-plan) but
  there is no general edit history.
- The routing preference is a soft bias; there is no "forbid this link"
  control.
- Metrics strips quantize to the 5-minute sample grid; sub-sample gaps
  shorter than ~5 min can be missed by coverage statistics (event times
  themselves are bisection-refined).
- `scripts/report.ts` is a dev calibration tool (run with
  `npx vite-node scripts/report.ts`); it is not part of the app build.
