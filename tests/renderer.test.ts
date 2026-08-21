import { describe, expect, it, vi } from 'vitest';
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

describe('lineage highlight', () => {
  function threeLevelMap(): ArgumentMapData {
    return {
      new_nodes: [
        thesis('T', 'Root'),
        claim('S', 'T', 'support', 'Support branch'),
        claim('SC', 'S', 'support', 'Support child'),
        claim('A', 'T', 'attack', 'Attack branch'),
      ],
    };
  }

  function hover(pathId: string, type: string): void {
    document
      .querySelector(`path[data-node-id="${pathId}"]`)!
      .dispatchEvent(new PointerEvent('pointerenter', { pointerType: type }));
  }

  it('marks the ancestor chain distinctly without overlapping the hover style', () => {
    document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(threeLevelMap());

    hover('SC', 'mouse');

    expect(document.querySelector('path[data-node-id="SC"]')?.classList).toContain(
      'pam-arc--highlighted',
    );
    // Thesis and S are ancestors: accent thread, no dimming, and never the glow.
    for (const id of ['T', 'S']) {
      const el = document.querySelector(`path[data-node-id="${id}"]`)!;
      expect(el.classList).toContain('pam-arc--ancestor');
      expect(el.classList).not.toContain('pam-arc--dimmed');
      expect(el.classList).not.toContain('pam-arc--highlighted');
    }
    // Unrelated branch dims.
    expect(document.querySelector('path[data-node-id="A"]')?.classList).toContain(
      'pam-arc--dimmed',
    );

    document
      .querySelector('path[data-node-id="SC"]')!
      .dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    expect(document.querySelectorAll('.pam-arc--ancestor')).toHaveLength(0);
    chart.destroy();
  });

  it('applies lineage treatment to programmatic highlight() too', () => {
    document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(threeLevelMap());
    chart.highlight('SC');

    expect(document.querySelector('path[data-node-id="S"]')?.classList).toContain(
      'pam-arc--ancestor',
    );
    expect(document.querySelector('path[data-node-id="A"]')?.classList).toContain(
      'pam-arc--dimmed',
    );
    chart.highlight(null);
    expect(document.querySelectorAll('.pam-arc--ancestor')).toHaveLength(0);
    expect(document.querySelectorAll('.pam-arc--dimmed')).toHaveLength(0);
    chart.destroy();
  });

  it('score encodes fills and dashed borders without breaking class colors', () => {
    document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
    const data: ArgumentMapData = {
      new_nodes: [
        thesis('T', 'Root'),
        {
          ...claim('HI', 'T', 'support'),
          score: { intensity: 0.9, confidence: 0.9 },
        },
        {
          ...claim('LO', 'T', 'support'),
          score: { intensity: 0.2, confidence: 0.2 },
        },
        claim('NS', 'T', 'attack'),
      ],
    };
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(data);

    const hi = document.querySelector<SVGPathElement>('path[data-node-id="HI"]')!;
    const lo = document.querySelector<SVGPathElement>('path[data-node-id="LO"]')!;
    const ns = document.querySelector<SVGPathElement>('path[data-node-id="NS"]')!;

    expect(hi.style.fill).toContain('color-mix');
    expect(lo.style.fill).toContain('color-mix');
    expect(hi.style.fill).not.toBe(lo.style.fill); // intensity differentiates
    expect(ns.style.fill).toBe(''); // unscored keeps its class fill

    expect(lo.getAttribute('style')).toContain('stroke-dasharray'); // low confidence
    expect(hi.getAttribute('style')).not.toContain('stroke-dasharray');
    chart.destroy();
  });
});

describe('on-arc labels (opt-in)', () => {
  function wideShallowMap(): ArgumentMapData {
    return {
      new_nodes: [
        thesis('T', 'Remote work increases productivity'),
        claim('S1', 'T', 'support', 'Fewer commute hours'),
        claim('S2', 'T', 'support', 'Flexible schedules help focus'),
        claim('A1', 'T', 'attack', 'Collaboration suffers online'),
      ],
    };
  }

  function sizedChart(arcLabels: boolean) {
    document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
    const container = document.querySelector('#chart')!;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 600,
      top: 0,
      left: 0,
      right: 600,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    return createArgumentMap('#chart', null, { theme: 'light', arcLabels });
  }

  it('does not render labels by default', () => {
    const chart = sizedChart(false);
    chart.setData(wideShallowMap());
    expect(document.querySelector('.pam-labels')).toBeNull();
    chart.destroy();
  });

  it('renders upright textPath labels when enabled with room', () => {
    const chart = sizedChart(true);
    chart.setData(wideShallowMap());

    const layer = document.querySelector('.pam-labels');
    expect(layer).toBeTruthy();
    const texts = layer!.querySelectorAll('text');
    expect(texts.length).toBeGreaterThan(0);
    const pathsInLayer = layer!.querySelectorAll('path');
    expect(pathsInLayer.length).toBe(texts.length);
    chart.destroy();
  });
});
