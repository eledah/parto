import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors.js';
import { createArgumentMap } from '../src/ArgumentMapChart.js';

describe('chart status overlay', () => {
  it('shows empty state when created without data', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    createArgumentMap('#chart', null, { theme: 'light' });
    const status = document.querySelector('.pam-chart__status--empty');
    expect(status).toBeTruthy();
    expect(status?.textContent).toContain('No map data');
  });

  it('shows error state for invalid data', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', { new_nodes: [] }, { theme: 'light' });
    const status = document.querySelector('.pam-chart__status--error');
    expect(status).toBeTruthy();
    chart.destroy();
  });

  it('shows loading state via setLoading', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setLoading(true);
    expect(document.querySelector('.pam-chart__status--loading')).toBeTruthy();
    chart.setLoading(false);
    chart.destroy();
  });

  it('hides status after valid setData', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.setData({
      new_nodes: [
        {
          id: '1',
          type: 'thesis',
          title: 'Root',
          description: '',
          quote: '',
          speaker: '',
          relations: [],
        },
      ],
    });
    expect(document.querySelector('.pam-chart__status[hidden]')).toBeTruthy();
    chart.destroy();
  });

  it('showError displays a custom message', () => {
    document.body.innerHTML = '<div id="chart" style="width:400px;height:400px"></div>';
    const chart = createArgumentMap('#chart', null, { theme: 'light' });
    chart.showError('Network failed');
    expect(document.querySelector('.pam-chart__status--error')?.textContent).toContain(
      'Network failed',
    );
    chart.destroy();
  });
});

describe('validateMapData integration', () => {
  it('throws ValidationError for duplicate ids', async () => {
    const { validateMapData } = await import('../src/core/validateMapData.js');
    expect(() =>
      validateMapData({
        new_nodes: [
          {
            id: '1',
            type: 'thesis',
            title: 'A',
            description: '',
            quote: '',
            speaker: '',
            relations: [],
          },
          {
            id: '1',
            type: 'claim',
            title: 'B',
            description: '',
            quote: '',
            speaker: '',
            relations: [],
          },
        ],
      }),
    ).toThrow(ValidationError);
  });
});
