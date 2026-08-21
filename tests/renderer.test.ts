import { describe, expect, it } from 'vitest';
import { createArgumentMap } from '../src/ArgumentMapChart.js';
import type { ArgumentMapData } from '../src/types.js';

function claim(
  id: string,
  targetId: string,
  relation: 'support' | 'attack',
  title = id,
): ArgumentMapData['new_nodes'][number] {
  return {
    id,
    type: 'claim',
    title,
    description: '',
    quote: '',
    speaker: '',
    relations: [{ target_node_id: targetId, relation_type: relation, reasoning: '' }],
  };
}

function thesis(id: string, title: string): ArgumentMapData['new_nodes'][number] {
  return {
    id,
    type: 'thesis',
    title,
    description: '',
    quote: '',
    speaker: '',
    relations: [],
  };
}

/** Thesis + 8 branches x 30 leaf children: triggers "+N" wedges at depth 2. */
function wideMap(): ArgumentMapData {
  const nodes = [thesis('T', 'Wide root')];
  for (let b = 0; b < 8; b++) {
    const branchId = `B${b}`;
    nodes.push(claim(branchId, 'T', 'attack', `Branch ${b}`));
    for (let c = 0; c < 30; c++) {
      nodes.push(claim(`${branchId}-L${c}`, branchId, 'support'));
    }
  }
  return { new_nodes: nodes };
}

/** Single chain six levels deep: triggers auto-focus. */
function deepChainMap(): ArgumentMapData {
  const nodes = [thesis('T', 'Deep root')];
  const chain = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
  let prev = 'T';
  for (const id of chain) {
    nodes.push(claim(id, prev, 'support'));
    prev = id;
  }
  return { new_nodes: nodes };
}

describe('SunburstRenderer deep-map pipeline', () => {
  it('auto-focuses the heaviest branch of a deep map on load', () => {
    document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(deepChainMap());

    const pathIds = chart.getZoomPath().map((n) => n.id);
    expect(pathIds).toEqual(['T', 'C1']);

    // Full tree remains reachable.
    chart.resetZoom();
    expect(chart.getZoomPath().map((n) => n.id)).toEqual(['T', 'C1']);
    chart.destroy();
  });

  it('collapses narrow sibling runs into clickable "+N" wedges', () => {
    document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(wideMap());

    const wedges = Array.from(document.querySelectorAll('path.pam-arc--collapsed'));
    expect(wedges.length).toBeGreaterThan(0);

    const labels = wedges.map((w) => w.getAttribute('aria-label') ?? '');
    expect(labels.some((l) => /\d hidden arguments/.test(l))).toBe(true);
    chart.destroy();
  });

  it('expands a clicked wedge into a focused view', () => {
    document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(wideMap());

    const before = document.querySelectorAll('#chart path').length;
    const wedge = document.querySelector<SVGPathElement>('path.pam-arc--collapsed');
    expect(wedge).toBeTruthy();

    wedge!.dispatchEvent(
      new PointerEvent('click', { bubbles: true, clientX: 300, clientY: 300, pointerType: 'mouse' }),
    );

    // Focus stack: thesis -> expanded wedge (map is shallow, so no branch focus).
    const zoomIds = chart.getZoomPath().map((n) => n.id);
    expect(zoomIds).toHaveLength(2);
    expect(zoomIds[1]).toContain('__more');

    // Expanded wedge renders as center plus its materialized hidden children.
    const after = document.querySelectorAll('#chart path').length;
    expect(after).toBeGreaterThanOrEqual(3);

    const expandedKeys = Array.from(document.querySelectorAll('path[data-path-key]'))
      .map((p) => p.getAttribute('data-path-key') ?? '');
    expect(expandedKeys.some((k) => k.includes('__more/'))).toBe(true);
    chart.destroy();
  });

  it('renders plain shallow maps without any wedges', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData({
      new_nodes: [
        thesis('T', 'Root'),
        claim('S1', 'T', 'support'),
        claim('S2', 'T', 'support'),
        claim('A1', 'T', 'attack'),
      ],
    });

    expect(document.querySelectorAll('#chart path').length).toBeGreaterThanOrEqual(4);
    expect(document.querySelectorAll('path.pam-arc--collapsed')).toHaveLength(0);
    expect(document.querySelector('path.pam-arc--center')).toBeTruthy();
    chart.destroy();
  });
});
