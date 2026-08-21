# Parto — argument map charts

[![npm version](https://img.shields.io/npm/v/@eledah/parto.svg)](https://www.npmjs.com/package/@eledah/parto)

**Parto** (پرتو) is a framework-agnostic JavaScript library for visualizing debate argument structures as interactive sunburst charts.

- Yellow center (thesis), green agree (support), red disagree (attack)
- Light / dark / system themes
- Hover tooltips and click-to-zoom
- Deep-map friendly: leaf-weighted angles, sliver-proof ring sizing, "+N" collapse wedges, auto-focus into the heaviest branch
- Built-in navigation: breadcrumb trail, zoom controls, legend chips, wheel/pinch pan-zoom, animated zoom transitions
- ESM for bundlers + CDN global bundle for plain HTML

## Install

```bash
npm install @eledah/parto
```

## Quick start

```js
import { createArgumentMap } from '@eledah/parto';
import '@eledah/parto/styles.css';

const chart = createArgumentMap('#chart', mapData, {
  theme: 'auto',
  tooltip: true,
  zoom: true,
  // arcLabels: true,    // draw titles along arcs (off by default)
  // breadcrumb: false,  // hide the zoom-path trail
  // legend: false,      // hide the center/support/attack key
});
```

## Options

| Option | Default | Description |
| ------ | ------- | ----------- |
| `theme` | `'auto'` | `'light'` \| `'dark'` \| `'auto'` |
| `colors` | — | Override `center` / `support` / `attack` / `border` |
| `tooltip` | `true` | Boolean or custom `(node, labels) => HTMLElement` renderer |
| `zoom` | `true` | Click-to-focus navigation + wheel/pinch pan-zoom |
| `arcLabels` | `false` | Truncated titles along arcs where they fit |
| `breadcrumb` | `true` | Clickable trail of the current zoom path |
| `legend` | `true` | Color key chips (hidden on narrow containers) |
| `direction` / `lang` | inherit | RTL support and content language |
| `labels` | English | All UI strings incl. status overlays |
| `onNodeHover` / `onNodeLeave` / `onNodeClick` / `onZoomChange` / `onWarning` | — | Event hooks |
```

## CDN

```html
<link rel="stylesheet" href="https://unpkg.com/@eledah/parto/dist/parto.css" />
<script src="https://unpkg.com/@eledah/parto/dist/parto.global.min.js"></script>
<script>
  Parto.createArgumentMap('#chart', mapData);
</script>
```

## Load from JSON

Keep map data in a separate `.json` file and fetch it at runtime:

```html
<link rel="stylesheet" href="https://unpkg.com/@eledah/parto/dist/parto.css" />
<div id="chart" style="height: 480px"></div>
<script src="https://unpkg.com/@eledah/parto/dist/parto.global.min.js"></script>
<script>
  const chart = Parto.createArgumentMap('#chart', null, { theme: 'auto' });
  chart.setLoading(true);

  fetch('map.json')
    .then((r) => {
      if (!r.ok) throw new Error('Failed to load map');
      return r.json();
    })
    .then((mapData) => {
      chart.setLoading(false);
      chart.setData(mapData);
    })
    .catch((err) => {
      chart.setLoading(false);
      chart.showError(err.message);
    });
</script>
```

The chart shows built-in **loading**, **empty**, and **error** overlays — no need to build your own status UI.

### Mobile / touch

- Tooltips use **pointer events** (not hover-only mouse events).
- **First tap** on an arc shows the tooltip above your finger.
- **Second tap** on the same arc zooms in (when zoom is enabled).
- Tap outside the chart to dismiss the tooltip.

> **Note:** `fetch` needs a URL (local static server or hosted file). Opening HTML via `file://` will block cross-file requests in most browsers.

## Validate map JSON

### CLI (after install)

```bash
npx parto-validate-map my-map.json
# or multiple files
npx parto-validate-map maps/*.json
```

### Programmatic

```js
import { validateMapData, ValidationError } from '@eledah/parto';

try {
  const { data, warnings } = validateMapData(json);
  warnings.forEach(console.warn);
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.issues);
  }
}
```

### JSON Schema

A draft 2020-12 schema ships with the package:

```json
{
  "$ref": "https://unpkg.com/@eledah/parto/schema/argument-map.schema.json"
}
```

Or import from npm: `@eledah/parto/schema.json`

## Data format

```json
{
  "new_nodes": [
    {
      "id": "1",
      "type": "thesis",
      "title": "Central claim",
      "description": "",
      "quote": "",
      "speaker": "Alice",
      "relations": []
    },
    {
      "id": "2",
      "type": "claim",
      "title": "Supporting point",
      "description": "Reasoning text",
      "quote": "",
      "speaker": "Bob",
      "relations": [
        { "target_node_id": "1", "relation_type": "support", "reasoning": "Because..." }
      ]
    }
  ]
}
```

## API

`createArgumentMap(container, data, options?)` returns:

- `setData(data)` — replace map data
- `setLoading(true | false)` — show/hide loading overlay
- `showError(message?)` — show error overlay (e.g. failed fetch)
- `setTheme('light' | 'dark' | 'auto')`
- `setColors({ center, support, attack, border })`
- `highlight(nodeId | null)`
- `zoomTo(nodeId)` / `zoomToPath(ids)` / `zoomOut()` / `resetZoom()`
- `getZoomPath()` — breadcrumb data
- `resize()` / `destroy()`

## Development

```bash
npm install
npm test
npm run build
npm run pack:check
```

## Examples

**Live demos:** [eledah.ir/parto](https://eledah.ir/parto/) (GitHub Pages)

Local copies in `examples/` (run `npm run build` first, or serve with any static server):

- `examples/01-basic-cdn` — script tag, no build step
- `examples/02-theme-tooltip` — themes and custom tooltip
- `examples/03-esm-rtl` — ESM import with Persian/RTL data
- `examples/04-fetch-json` — load map data from a JSON file
- `examples/05-deep-map` — 7-level map exercising auto-focus and "+N" collapse wedges
- `examples/06-arc-labels` — opt-in `arcLabels` flag, score encoding, lineage highlight

## How deep maps stay readable

Argument maps grow fast. Parto keeps deep maps legible with three layout rules:

1. **Leaf-weighted angles** — a branch's arc width is proportional to how much
   argument it contains (descendant leaves), not just its sibling count.
2. **Sliver-proof rings** — ring thickness is allocated so the shortest arc at
   every depth is never shorter than the ring is thick; narrow "long thin wedge"
   arcs are geometrically impossible.
3. **"+N" wedges** — branches too small to read collapse into dashed wedges
   showing their argument count. Hover previews the hidden titles; click to
   expand the group into focus.

Maps deeper than four levels open focused on their heaviest branch instead of
cramming everything into one view (`Esc` / `Backspace` / center-click zoom out).

## Reading scores and lineage at a glance

- **Intensity** fades a claim's fill (low intensity washes toward the surface color).
- **Confidence** below 0.5 switches the border to a dashed pattern.
- **Hovering** an arc lights its full lineage from the thesis with a yellow
  thread — the hovered arc keeps its own glow, ancestors never do.
- **`arcLabels: true`** draws truncated titles along arcs when there is room
  (off by default; see `examples/06-arc-labels`).

## Publish

```bash
npm login
npm publish --access public
```

## License

MIT
