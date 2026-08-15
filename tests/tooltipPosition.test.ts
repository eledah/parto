import { describe, expect, it } from 'vitest';
import { clampTooltipPosition, TOUCH_TOOLTIP_OFFSET } from '../src/ui/tooltipPosition.js';

describe('clampTooltipPosition', () => {
  it('places touch tooltips above the contact point', () => {
    const card = document.createElement('div');
    Object.defineProperty(card, 'getBoundingClientRect', {
      value: () => ({ width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100 }),
    });

    const { x, y } = clampTooltipPosition({ x: 300, y: 400 }, card, 'touch');
    expect(x).toBe(200); // centered on touch x
    expect(y).toBe(400 - 100 - TOUCH_TOOLTIP_OFFSET);
  });

  it('keeps mouse tooltips offset down-right by default', () => {
    const card = document.createElement('div');
    Object.defineProperty(card, 'getBoundingClientRect', {
      value: () => ({ width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100 }),
    });

    const { x, y } = clampTooltipPosition({ x: 100, y: 100 }, card, 'mouse');
    expect(x).toBe(120);
    expect(y).toBe(120);
  });
});
