# Changelog

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
