# Parto — argument map charts

[![npm version](https://img.shields.io/npm/v/@eledah/parto.svg)](https://www.npmjs.com/package/@eledah/parto)

**Parto** (پرتو) is a framework-agnostic JavaScript library for visualizing debate argument structures as interactive sunburst charts.

- Yellow center (thesis), green agree (support), red disagree (attack)
- Light / dark / system themes
- Hover tooltips and click-to-zoom
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
});
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

## Publish

```bash
npm login
npm publish --access public
```

## License

MIT
