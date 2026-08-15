# Parto — argument map charts

**Parto** (پرتو) is a framework-agnostic JavaScript library for visualizing debate argument structures as interactive sunburst charts.

- Yellow center (thesis), green agree (support), red disagree (attack)
- Light / dark / system themes
- Hover tooltips and click-to-zoom
- ESM for bundlers + CDN global bundle for plain HTML

## Install

```bash
npm install @parto/argument-map
```

## Quick start

```js
import { createArgumentMap } from '@parto/argument-map';
import '@parto/argument-map/styles.css';

const chart = createArgumentMap('#chart', mapData, {
  theme: 'auto',
  tooltip: true,
  zoom: true,
});
```

## CDN

```html
<link rel="stylesheet" href="https://unpkg.com/@parto/argument-map/dist/parto-argument-map.css" />
<script src="https://unpkg.com/@parto/argument-map/dist/parto-argument-map.global.min.js"></script>
<script>
  PartoArgumentMap.createArgumentMap('#chart', mapData);
</script>
```

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

Open after `npm run build` (or serve with any static server):

- `examples/01-basic-cdn` — script tag, no build step
- `examples/02-theme-tooltip` — themes and custom tooltip
- `examples/03-esm-rtl` — ESM import with Persian/RTL data

## Publish

```bash
npm login
npm publish --access public
```

## License

MIT
