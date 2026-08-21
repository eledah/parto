# Parto Improvement Plan

Goal: make argument maps readable at **any depth**, starting with the ">3 layers looks ugly"
problem (outermost rings become narrow, long slivers), then layering on navigation, polish,
and API maturity.

Root cause (confirmed in code):

- Equal-angle sizing — `setEqualAngles` (`src/render/SunburstRenderer.ts:125`) ignores subtree size.
- Outward-growing rings — the radius exponent (`src/render/SunburstRenderer.ts:138`) makes the
  outermost ring the *thickest* (~33% of R at depth 4). High fan-out × thick ring = slivers
  (~1:6 aspect ratio at 10 siblings).
- No depth management — every layer is always rendered, so deep maps have nowhere to go.

Strategy (Kialo-style): weight angles by content, geometrically prevent slivers, collapse
low-space subtrees into "+N" wedges, and auto-focus deep maps instead of cramming all layers
into one view.

---

## Phase 1 — Layout Engine Overhaul (Kialo-style readability)

**Outcome:** maps with 5+ layers remain legible; no arc can render as a sliver.

### 1.1 Leaf-weighted angles

- `src/core/buildTree.ts`: post-order pass sets `TreeNode.value = descendantLeafCount`.
- `src/render/SunburstRenderer.ts`: delete `setEqualAngles`; let `d3.partition()` size angles
  from values (it currently computes results that get overwritten — dead work today).
- Busy branches get room; sparse branches stop wasting arc space.

### 1.2 Sliver-proof radial allocation

- New module `src/core/ringLayout.ts`: given max depth and fan-out stats, produce ring
  boundaries `r₀…rₙ` over `[0, radius]` such that for every level,
  **minimum expected arc length ≥ ring thickness** (slivers become geometrically impossible).
  - Greedy solve + iterative relaxation; clamp total to available radius.
  - Keep the existing exponent formula only as a fallback/clamp input.
- Renderer consumes boundary lookup instead of `getRadius(y)` pow-curve.

### 1.3 Aggregation wedges ("+N")

- New module `src/core/collapse.ts`: after layout, any node whose angular span falls below
  `minAngle` (default ~3°) collapses into a synthetic wedge node:
  - id: `<parentPathKey>__more`, title `+N more`, inherits relation styling, muted variant.
  - Carries hidden child ids/titles for tooltip preview (first ~5 titles + count).
- Interaction: hovering a wedge previews contents; clicking zooms focus to its parent so the
  hidden branch gets space (consistent with existing focus-zoom model).
- Styling hook: `.pam-arc--collapsed` (muted fill, dashed stroke).

### 1.4 Auto-focus deep maps

- If rendered depth > `maxVisibleDepth` (default 4): first render focuses the heaviest
  (leaf-weighted) branch instead of the whole tree.
- Breadcrumb path back to root comes free via `getZoomPath()` (UI lands in Phase 3;
  interim affordance: center-click / Esc already zoom out).
- Skipped when caller supplies an explicit initial zoom (`zoomTo*` before/after `setData`).

### 1.5 Engineering verification (dev-facing, not a11y)

- `tests/ringLayout.test.ts`: boundaries monotonic; min-arc-length ≥ thickness invariant;
  fits within radius for randomized trees.
- `tests/collapse.test.ts`: counts, ids, tooltip payloads, interaction targets.
- Extend `tests/buildTree.test.ts`: leaf-count values.

### Ship checklist

- [ ] Typecheck + full test suite green
- [ ] Example map with 6–7 layers renders legibly (add one to `examples/data/`)
- [ ] README note + CHANGELOG entry

---

## Phase 2 — Highlighting, Scores, Labels

**Outcome:** users can read structure and strength without hunting tooltips.

### 2.1 Lineage highlight (non-overlapping)

On hover/keyboard-focus of an arc:

| Element      | Class                | Style                                            |
| ------------ | -------------------- | ------------------------------------------------ |
| Hovered arc  | `.pam-arc--hovered`  | Current treatment: brightness + colored glow     |
| Ancestors    | `.pam-arc--ancestor` | Brightened fill + 2px accent stroke, **no glow** |
| Everything else | `.pam-arc--dimmed` | Reduced opacity                                 |

- Compute ancestor set via existing `pathToNode` (`src/core/buildTree.ts:111`).
- Non-overlap guarantees (CSS + logic):
  - Ancestor style explicitly resets `filter: none` so the hover glow never bleeds up-chain.
  - Ancestors excluded from the dimmed set; classes are mutually exclusive by construction.
- Same lineage treatment on keyboard focus; `clearHover` restores prior `highlight()` state.

### 2.2 Score encoding

- `intensity` → fill saturation/opacity modulation (via `color-mix` toward neutral).
- `confidence` → border treatment (solid ≥ high, dashed below configurable threshold).
- Tooltip percentages unchanged; encoding is additive, thresholds exposed as constants until
  Phase 4 moves them into per-instance config.

### 2.3 On-arc labels (opt-in flag)

User preference: labels-on-arcs risk clutter, so **off by default**.

- `ArgumentMapOptions.arcLabels?: boolean` (default `false`).
- Implementation when enabled:
  - `<text><textPath>` along a mid-ring guide path; truncated with ellipsis.
  - Hidden when span < `minLabelAngle` or ring thinner than font size; `pointer-events: none`.
  - Flip glyphs on the bottom half of the ring so text is never upside-down.
- New example `examples/05-arc-labels/` (+ `docs/examples/` mirror) demonstrating the flag.

### Explicit non-goals (per decision)

- No text inside the center/thesis disc — stays a plain colored disc.
- No forced-on labels anywhere; flag remains opt-in.

### Ship checklist

- [ ] Hover/focus lineage verified against multi-parent copies (pathKey uniqueness)
- [ ] Label example added; README options table updated
- [ ] Reduced-motion + theme checks pass

---

## Phase 3 — Navigation & Interaction Polish

**Outcome:** orientation and motion quality of a mature viz tool.

### 3.1 Breadcrumb bar

- New `src/ui/BreadcrumbBar.ts`: overlay row inside the chart container, fed by
  `getZoomPath()`; each crumb clickable → `zoomToPath`.
- Truncation for long trails (first · … · last two); `aria-current="location"`; RTL-aware.

### 3.2 Zoom controls widget

- New `src/ui/ZoomControls.ts`: `+ / − / ⤾` stack (bottom-right corner).
- Wired to `zoomIn` (focus heaviest child of current root), `zoomOut`, `resetZoom`;
  disabled states derived from a new `ZoomController.canZoomOut()`.

### 3.3 Animated zoom transitions

- Replace `selectAll('*').remove()` rebuild (`src/render/SunburstRenderer.ts:170`) with a
  keyed d3-join on `pathKey`.
- Tween arcs between layouts (interpolate x0/x1/y0/y1), ~450ms ease-out; entering arcs grow
  from parent, exiting fade/shrink into parent.
- Honor existing `prefers-reduced-motion` handling (jump-cut when reduced).

### 3.4 Wheel / pinch pan-zoom

- `d3.zoom` on the SVG scoped to the focus root's bounds; complements (does not replace)
  click-to-focus zoom. Double-click filter kept for focus semantics.
- Reset control (3.2) also clears transform.

### 3.5 Legend chips

- Small bottom-left overlay: center/support/attack swatches using existing colors + labels.
- Auto-hidden below a minimum container width.

### Ship checklist

- [ ] All interactions keyboard-reachable; focus order sane
- [ ] Transition performance checked with ~500-node map
- [ ] Examples updated; CHANGELOG entry

---

## Phase 4 — API & Architecture Maturity

**Outcome:** multi-chart-safe configuration, pluggable layouts, shareable output.

### 4.1 Per-instance config (prerequisite hygiene for 4.2)

- `chartConfig` today is a mutable module-global singleton (`src/config.ts:30`) mutated per
  render/theme change — two charts on a page contaminate each other.
- Resolve a frozen per-instance config in the constructor; renderer/theme code reads the
  instance, never the global. Global export kept temporarily as deprecated default source.

### 4.2 Public layout options

```ts
interface ArgumentMapLayoutOptions {
  maxVisibleDepth?: number;   // default 4
  minAngle?: number;          // wedge-collapse threshold (radians)
  angleWeight?: number;       // 0 = equal angles, 1 = pure leaf weighting
  ringScale?: 'sliver-proof' | 'exponent';
  aggregation?: boolean;      // enable "+N" wedges (default true)
}
// ArgumentMapOptions gains layout?: ArgumentMapLayoutOptions
```

- Wires Phase 1 modules to user input; validates ranges with warnings via `onWarning`.

### 4.3 Second layout engine (icicle)

- Extract a `MapRenderer` interface from current `SunburstRenderer` usage surface
  (render/highlight/resize/destroy/getTooltipElementId).
- New `src/render/IcicleRenderer.ts` sharing ZoomController, collapse, tooltip pipeline.
- `layout: 'sunburst' | 'icicle'` option. Deep hierarchies often read better as icicles;
  cheap win given the existing clean seam.

### 4.4 Export & share state

- `toSVG(): string` — serialize live SVG with computed fills/strokes inlined (portable file).
- `toPNG(scale?): Promise<Blob>` — canvas rasterization of `toSVG`.
- URL helpers: encode `getZoomPath()` to `?parto=<ids>`; restore via existing `zoomToPath`.

### Ship checklist

- [ ] Two charts on one page with independent configs/colors (new test/example)
- [ ] Icicle example; export demo snippet in README
- [ ] Major/minor version bump + CHANGELOG

---

## Sequencing & Releases

| Phase | Scope                              | Version target | Size |
| ----- | ---------------------------------- | -------------- | ---- |
| 1     | Layout engine + wedges + autofocus | 0.2.0          | L    |
| 2     | Lineage, scores, opt-in labels     | 0.3.0          | M    |
| 3     | Navigation, transitions, pan-zoom  | 0.4.0          | M    |
| 4     | Config API, icicle, export         | 0.5.0          | L    |

Dependencies:

- Phase 2 builds on Phase 1 layout (label thresholds need real spans; lineage needs stable
  keyed arcs).
- Phase 3.3 transitions require the Phase 1 keyed-render groundwork to be worth doing.
- Phase 4.1 should land before heavy option growth; Phase 1 adds options behind a minimal
  internal `ResolvedConfig` shape so the singleton isn't further entrenched.

Verification per phase: `npm run typecheck && npm test`, plus manual pass over all
`examples/` in light/dark and touch.
