import { describe, expect, it } from 'vitest';
import { createArgumentMap } from '../src/ArgumentMapChart.js';

const sampleData = {
  new_nodes: [
    {
      id: '1',
      type: 'thesis',
      title: 'Root',
      description: 'Center claim',
      quote: '',
      speaker: '',
      relations: [],
    },
    {
      id: '2',
      type: 'claim',
      title: 'Support',
      description: 'Supporting point',
      quote: '',
      speaker: '',
      relations: [{ target_node_id: '1', relation_type: 'support' as const, reasoning: '' }],
    },
  ],
};

describe('mobile touch tooltip', () => {
  it('shows tooltip on first touch tap without zooming', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', sampleData, { theme: 'light', zoom: true });
    const path = document.querySelector<SVGPathElement>('path[data-node-id="2"]');
    expect(path).toBeTruthy();

    path!.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 120,
        clientY: 140,
        pointerType: 'touch',
      }),
    );

    expect(document.querySelector('.pam-tooltip-host--visible')).toBeTruthy();
    expect(document.querySelector('.pam-tooltip-host--touch')).toBeTruthy();
    expect(document.querySelector('.pam-tooltip__title')?.textContent).toBe('Support');

    chart.destroy();
  });

  it('positions touch tooltip above the contact point', async () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', sampleData, { theme: 'light' });
    const path = document.querySelector<SVGPathElement>('path[data-node-id="2"]');

    path!.dispatchEvent(
      new PointerEvent('click', {
        bubbles: true,
        clientX: 200,
        clientY: 250,
        pointerType: 'touch',
      }),
    );

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const host = document.querySelector<HTMLElement>('.pam-tooltip-host--visible');
    expect(host).toBeTruthy();
    const top = Number.parseFloat(host!.style.top);
    expect(Number.isFinite(top)).toBe(true);
    expect(top).toBeLessThan(250 - 40);

    chart.destroy();
  });
});
