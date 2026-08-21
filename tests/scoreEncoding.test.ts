import { describe, expect, it } from 'vitest';
import { scoreFillStyle, scoreStrokeDash } from '../src/render/scoreEncoding.js';
import type { TreeNode } from '../src/types.js';

function nodeWithScore(score?: { intensity: number; confidence: number }): TreeNode {
  return {
    id: 'n',
    type: 'claim',
    title: 'N',
    description: '',
    quote: '',
    speaker: '',
    relations: [],
    children: [],
    value: 1,
    pathKey: 'n',
    ...(score ? { score } : {}),
  };
}

describe('scoreFillStyle', () => {
  it('returns null without a score or color', () => {
    expect(scoreFillStyle(nodeWithScore(), '#2e9d61')).toBeNull();
    expect(scoreFillStyle(nodeWithScore({ intensity: 1, confidence: 1 }), '')).toBeNull();
  });

  it('maps intensity onto the configured saturation range', () => {
    const low = scoreFillStyle(nodeWithScore({ intensity: 0, confidence: 1 }), '#2e9d61')!;
    const high = scoreFillStyle(nodeWithScore({ intensity: 1, confidence: 1 }), '#2e9d61')!;
    expect(low).toContain('45%');
    expect(high).toContain('95%');
    const mid = scoreFillStyle(nodeWithScore({ intensity: 0.5, confidence: 1 }), '#2e9d61')!;
    expect(mid).toContain('70%');
  });

  it('clamps out-of-range intensities', () => {
    const clamped = scoreFillStyle(nodeWithScore({ intensity: 4, confidence: 1 }), '#2e9d61')!;
    expect(clamped).toBe(scoreFillStyle(nodeWithScore({ intensity: 1, confidence: 1 }), '#2e9d61'));
    const nan = scoreFillStyle(nodeWithScore({ intensity: Number.NaN, confidence: 1 }), '#c')!;
    expect(nan).toBe(scoreFillStyle(nodeWithScore({ intensity: 1, confidence: 1 }), '#c'));
  });
});

describe('scoreStrokeDash', () => {
  it('returns null without a score', () => {
    expect(scoreStrokeDash(nodeWithScore())).toBeNull();
  });

  it('dashes below the confidence threshold, solid at or above it', () => {
    expect(scoreStrokeDash(nodeWithScore({ intensity: 1, confidence: 0.2 }))).toBe('4 3');
    expect(scoreStrokeDash(nodeWithScore({ intensity: 1, confidence: 0.5 }))).toBeNull();
    expect(scoreStrokeDash(nodeWithScore({ intensity: 1, confidence: 0.9 }))).toBeNull();
  });
});
