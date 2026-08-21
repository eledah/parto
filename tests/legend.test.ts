import { afterEach, describe, expect, it } from 'vitest';
import { createArgumentMap } from '../src/ArgumentMapChart.js';

describe('chart legend', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders a centered semantic legend by default', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });

    const legend = document.querySelector('.pam-chart__legend');
    expect(legend).toBeTruthy();
    expect(legend?.textContent).toContain('Center');
    expect(legend?.textContent).toContain('Agree');
    expect(legend?.textContent).toContain('Disagree');

    chart.destroy();
  });

  it('can be disabled', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', null, {
      theme: 'light',
      legend: false,
    });

    expect(document.querySelector('.pam-chart__legend')).toBeNull();
    chart.destroy();
  });
});
