# Changelog

## 0.2.0 (unreleased)

### Readability (Phase 2)

- **Lineage highlight**: hovering or focusing an arc lights its ancestor chain
  from the thesis with a distinct accent outline; ancestors are exempt from
  dimming and never receive the hover glow. `highlight()` applies the same
  lineage treatment.
- **Score encoding**: argument intensity modulates fill saturation; confidence
  below 0.5 renders a dashed border. Tooltips unchanged.
- **Opt-in on-arc labels** (`arcLabels`, default off): truncated titles along a
  mid-band guide path, flipped upright on the lower half, drawn only when the
  arc has room for them.
- New option: `arcLabels?: boolean`; new example `examples/06-arc-labels`.

### Layout engine (deep maps)

- **Leaf-weighted angles**: arc width now reflects subtree size (descendant leaf
  count) instead of equal slices per sibling — busy branches get the space they need.
- **Sliver-proof ring allocation** (`computeRingBoundaries`): radial bands are
  sized so the shortest arc at each depth is never shorter than the ring is
  thick; maps with 4+ layers no longer render as narrow, long outer wedges.
- **"+N" collapse wedges**: branches narrower than `spacing.minAngle` collapse
  into dashed wedges with argument counts and hover previews of hidden titles;
  clicking a wedge expands it into focus. Tiny leaf runs group into wedges too;
  lone tiny leaves pass through unwrapped.
- **Auto-focus for deep maps**: trees deeper than `limits.autoFocusDepth` open
  focused on their heaviest first-level branch; `resetZoom()` returns to that
  entry point rather than the full cramped tree.

### API

- New exports: `applyCollapse`, `expandWedge`, `isWedge`, `computeRingBoundaries`.
- `TreeNode` gained optional `wedgeMeta` (`count`, `titles`, `hidden`).

### Internal

- Removed dead equal-angle pass and unused radius-exponent path in
  `SunburstRenderer`; partition values now drive layout directly via
  `hierarchy.sum()`.
- New test suites: ring-layout invariants (incl. randomized adversarial spans),
  collapse behavior, leaf weights, auto-focus/wedge navigation.

## 0.1.0

- Publish as `@eledah/parto` (npm package rename)
- Mobile tooltips, status overlays, JSON Schema, validation CLI, CI
- ESM and browser global (`Parto`) builds
- Yellow center, green support, red attack semantic colors

## 0.1.2 (unpublished `@parto/argument-map`)

- Mobile tooltips: pointer events, tap-to-show (sticky), tap-again-to-zoom
- Touch placement: tooltip appears above the finger with a fixed offset
- `pointer-events: none` on tooltip host so taps reach the chart

## 0.1.1

- Built-in loading, empty, and error overlays on the chart
- `setLoading()` and `showError()` on chart instances
- `createArgumentMap()` accepts optional initial data (`null` for fetch flows)
- JSON Schema at `schema/argument-map.schema.json`
- CLI: `parto-validate-map <file.json>`
- GitHub Actions CI (test, build, validate samples)

## 0.1.0

- Initial read-only release: sunburst rendering, zoom, hover tooltip, light/dark/auto themes
- ESM and browser global (`PartoArgumentMap`) builds
- Yellow center, green support, red attack semantic colors
