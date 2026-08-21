import { describe, expect, it } from 'vitest';
import { buildTree } from '../src/core/buildTree.js';
import { ZoomController } from '../src/core/ZoomController.js';
import { createArgumentMap } from '../src/ArgumentMapChart.js';
import type { ArgumentMapData, ArgumentMapNode } from '../src/types.js';

function claim(id: string, targetId: string, title = id): ArgumentMapNode {
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

function thesis(id: string, title: string): ArgumentMapNode {
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

/** Root with two branches; branch A is heaviest (3 leaves vs 1). */
function sample(): ArgumentMapData {
  return {
    new_nodes: [
      thesis('T', 'Root claim'),
      claim('A', 'T', 'Heavy branch'),
      claim('A1', 'A'),
      claim('A2', 'A'),
      claim('B', 'T', 'Light branch'),
    ],
  };
}

describe('ZoomController navigation helpers', () => {
  it('tracks canZoomOut across the stack', () => {
    const { tree } = buildTree(sample().new_nodes);
    const zoom = new ZoomController();
    zoom.setTree(tree);
    expect(zoom.canZoomOut()).toBe(false);
    zoom.zoomIntoHeaviest();
    expect(zoom.canZoomOut()).toBe(true);
    expect(zoom.getFocusRoot()?.id).toBe('A');
    zoom.zoomOut();
    expect(zoom.canZoomOut()).toBe(false);
  });

  it('zoomIntoHeaviest picks the leaf-weighted branch and fails on leaves', () => {
    const { tree } = buildTree(sample().new_nodes);
    const zoom = new ZoomController();
    zoom.setTree(tree);
    expect(zoom.zoomIntoHeaviest()).toBe(true);
    expect(zoom.getFocusRoot()?.id).toBe('A');
    // A's subtree: children are leaves -> cannot go deeper
    expect(zoom.zoomIntoHeaviest()).toBe(false);
  });
});

describe('navigation overlays', () => {
  function mount(width = 600): HTMLElement {
    document.body.innerHTML = '<div id="chart" style="width:600px;height:600px"></div>';
    const container = document.querySelector('#chart')!;
    Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
    return container;
  }

  it('renders breadcrumbs reflecting the zoom path and navigates on click', () => {
    const container = mount();
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(sample());

    const nav = container.querySelector('.pam-breadcrumbs');
    expect(nav).toBeTruthy();
    expect(nav!.hidden).toBe(false);

    // Initial path is [T]; zoom into branch A via public API and check trail.
    chart.zoomTo('A');
    const crumbs = Array.from(container.querySelectorAll('.pam-breadcrumbs__crumb'));
    expect(crumbs.map((c) => c.textContent)).toEqual(['Root claim', 'Heavy branch']);
    expect(crumbs[0]!.disabled).toBe(false);
    expect(crumbs[1]!.getAttribute('aria-current')).toBe('location');

    crumbs[0]!.click();
    expect(chart.getZoomPath().map((n) => n.id)).toEqual(['T']);
    chart.destroy();
  });

  it('hides breadcrumbs when the container is narrow', () => {
    const container = mount(240);
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(sample());
    expect(container.querySelector('.pam-breadcrumbs')!.hidden).toBe(true);
    chart.destroy();
  });

  it('zoom controls drive in/out/reset and disable appropriately', () => {
    mount();
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(sample());

    const outButton = document.querySelector<HTMLButtonElement>(
      '.pam-zoom-controls__btn[aria-label="Zoom out"]',
    );
    const inButton = document.querySelector<HTMLButtonElement>(
      '.pam-zoom-controls__btn[aria-label="Zoom in"]',
    );
    const resetButton = document.querySelector<HTMLButtonElement>(
      '.pam-zoom-controls__btn[aria-label="Reset view"]',
    );
    expect(outButton).toBeTruthy();
    expect(inButton).toBeTruthy();
    expect(resetButton).toBeTruthy();

    // Shallow map, no auto-focus: cannot zoom out at the root.
    expect(chart.getZoomPath()).toHaveLength(1);
    expect(outButton!.disabled).toBe(true);

    inButton!.click();
    expect(chart.getZoomPath().map((n) => n.id)).toEqual(['T', 'A']); // heaviest
    expect(outButton!.disabled).toBe(false);

    outButton!.click();
    expect(chart.getZoomPath()).toHaveLength(1);
    expect(outButton!.disabled).toBe(true);

    // Reset with no auto-focus entry returns to the full tree.
    inButton!.click();
    resetButton!.click();
    expect(chart.getZoomPath().map((n) => n.id)).toEqual(['T']);
    chart.destroy();
  });

  it('the centered legend renders by default and can be disabled', () => {
    mount();
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(sample());
    expect(document.querySelector('.pam-chart__legend')).toBeTruthy();
    chart.destroy();

    mount();
    const bare = createArgumentMap('#chart', null, { theme: 'light', legend: false });
    bare.setData(sample());
    expect(document.querySelector('.pam-chart__legend')).toBeNull();
    bare.destroy();
  });

  it('breadcrumb can be disabled independently', () => {
    const container = mount();
    const chart = createArgumentMap('#chart', null, { theme: 'light', breadcrumb: false });
    chart.setData(sample());
    expect(container.querySelector('.pam-breadcrumbs')).toBeNull();
    chart.destroy();
  });

  it('animated zoom keeps the DOM consistent after focusing', () => {
    mount();
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData(sample());
    const before = document.querySelectorAll('path.pam-arc').length;
    expect(before).toBeGreaterThan(0);

    chart.zoomTo('A');
    const after = document.querySelectorAll('path.pam-arc').length;
    expect(after).toBeGreaterThan(0);
    // Focus view renders fewer or equal nodes than the full tree.
    expect(after).toBeLessThanOrEqual(before);
    chart.destroy();
  });
});
