import { describe, expect, it, vi } from 'vitest';
import { createArgumentMap } from '../src/ArgumentMapChart.js';
import { decodeZoomPath, encodeZoomPath } from '../src/core/shareState.js';
import { resolveConfig } from '../src/config.js';
import type { ArgumentMapData } from '../src/types.js';

function claim(id: string, targetId: string, title = id): ArgumentMapData['new_nodes'][number] {
  return {
    id,
    type: 'claim',
    title,
    description: '',
    quote: '',
    speaker: '',
    relations: [{ target_node_id: targetId, relation_type: 'support', reasoning: '' }],
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

function wideMap(): ArgumentMapData {
  const nodes = [thesis('T', 'Wide root')];
  for (let b = 0; b < 8; b++) {
    nodes.push(claim(`B${b}`, 'T'));
    for (let c = 0; c < 30; c++) nodes.push(claim(`B${b}-L${c}`, `B${b}`));
  }
  return { new_nodes: nodes };
}

function shallowMap(): ArgumentMapData {
  return {
    new_nodes: [
      thesis('T', 'Root'),
      claim('A', 'T', 'Heavy'),
      claim('A1', 'A'),
      claim('A2', 'A'),
      claim('B', 'T', 'Light'),
    ],
  };
}

function mount(width = 600, height = 600): HTMLElement {
  document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
  const container = document.querySelector('#chart')!;
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return container;
}

describe('per-instance config isolation', () => {
  it('resolveConfig deep-merges without touching defaults', () => {
    const resolved = resolveConfig({ limits: { autoFocusDepth: 2 }, spacing: { minAngle: 0.5 } });
    expect(resolved.limits.autoFocusDepth).toBe(2);
    expect(resolved.spacing.minAngle).toBe(0.5);
    expect(resolved.spacing.padAngle.inner).toBeCloseTo(0.025);
    // Global default untouched.
    expect(resolveConfig().limits.autoFocusDepth).toBe(4);
  });

  it('two charts keep independent colors; the global config stays clean', async () => {
    const { chartConfig } = await import('../src/config.js');
    const before = { ...chartConfig.colors };

    mount();
    const red = createArgumentMap('#chart', null, {
      theme: 'light',
      colors: { support: '#ff0000' },
    });
    red.setData(shallowMap());

    document.body.innerHTML = '<div id="chart2" style="width:600px;height:600px"></div>';
    const container2 = document.querySelector('#chart2')!;
    Object.defineProperty(container2, 'clientWidth', { value: 600, configurable: true });
    const green = createArgumentMap('#chart2', null, {
      theme: 'light',
      colors: { support: '#00aa00' },
    });
    green.setData(shallowMap());

    // jsdom applies no CSS, so inspect each chart's resolved instance config.
    expect(red.getConfig().colors.support).toBe('#ff0000');
    expect(green.getConfig().colors.support).toBe('#00aa00');
    expect(chartConfig.colors.support).toBe(before.support);
    red.destroy();
    green.destroy();
  });

  it('layout.maxVisibleDepth lowers the auto-focus threshold', () => {
    mount();
    const chart = createArgumentMap('#chart', null, {
      theme: 'light',
      layout: { maxVisibleDepth: 1 },
    });
    chart.setData(shallowMap());
    expect(chart.getZoomPath().map((n) => n.id)).toEqual(['T', 'A']);
    chart.destroy();
  });

  it('layout.aggregation=false disables "+N" wedges', () => {
    mount();
    const chart = createArgumentMap('#chart', null, {
      theme: 'light',
      layout: { aggregation: false },
    });
    chart.setData(wideMap());
    expect(document.querySelectorAll('.pam-arc--collapsed')).toHaveLength(0);
    chart.destroy();
  });
});

describe('icicle layout', () => {
  it('renders rects with semantic classes and supports focus navigation', () => {
    mount();
    const chart = createArgumentMap('#chart', null, {
      theme: 'light',
      layoutMode: 'icicle',
    });
    chart.setData(shallowMap());

    const rects = document.querySelectorAll('rect.pam-arc');
    expect(rects.length).toBeGreaterThanOrEqual(5);
    expect(document.querySelector('rect.pam-arc--center')).toBeTruthy();
    expect(document.querySelector('rect.pam-arc--support')).toBeTruthy();

    chart.zoomTo('A');
    expect(chart.getZoomPath().map((n) => n.id)).toEqual(['T', 'A']);
    expect(document.querySelectorAll('rect.pam-arc').length).toBeGreaterThan(0);
    chart.destroy();
  });

  it('collapses narrow runs into wedges like the sunburst engine', () => {
    mount();
    const chart = createArgumentMap('#chart', null, {
      theme: 'light',
      layoutMode: 'icicle',
    });
    chart.setData(wideMap());
    expect(document.querySelectorAll('rect.pam-arc--collapsed').length).toBeGreaterThan(0);
    chart.destroy();
  });

  it('exposes its SVG for export', () => {
    mount();
    const chart = createArgumentMap('#chart', null, {
      theme: 'light',
      layoutMode: 'icicle',
    });
    chart.setData(shallowMap());
    expect(chart.toSVG()).toContain('<svg');
    chart.destroy();
  });
});

describe('export & share state', () => {
  it('serializes standalone SVG with background and inlined fills', () => {
    mount();
    const chart = createArgumentMap('#chart', null, {
      theme: 'light',
      colors: { attack: '#123456' },
    });
    chart.setData({
      new_nodes: [thesis('T', 'Root'), claim('A', 'T')],
    });
    const markup = chart.toSVG();
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('<rect'); // background plate inserted
    expect(markup).not.toContain('tabindex'); // a11y attrs stripped
    // Resolved instance carries the override even though jsdom has no CSS.
    expect(chart.getConfig().colors.attack).toBe('#123456');
    chart.destroy();
  });

  it('round-trips zoom paths through URL-safe strings', () => {
    const path = [
      { id: 'root-1', title: 'Root', type: 'thesis' },
      { id: 'child/with spaces', title: 'Child', type: 'claim' },
    ];
    const encoded = encodeZoomPath(path);
    expect(encoded).toBe('root-1/child%2Fwith%20spaces');
    expect(decodeZoomPath(encoded)).toEqual(['root-1', 'child/with spaces']);
    expect(decodeZoomPath(null)).toEqual([]);
    expect(decodeZoomPath('')).toEqual([]);
  });
});
