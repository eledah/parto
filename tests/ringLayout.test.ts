import { describe, expect, it } from 'vitest';
import { computeRingBoundaries } from '../src/core/ringLayout.js';

/** Deterministic LCG so failures reproduce. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function assertInvariants(bands: number[], spans: number[], radius: number): void {
  expect(bands.length).toBe(spans.length + 1);
  expect(bands[0]).toBe(0);
  expect(bands[bands.length - 1]).toBeCloseTo(radius, 6);
  for (let i = 1; i < bands.length; i++) {
    expect(bands[i]).toBeGreaterThan(bands[i - 1]);
  }
  // Sliver invariant: shortest arc at each depth >= ring thickness.
  for (let d = 1; d < bands.length - 1; d++) {
    const thickness = bands[d + 1] - bands[d];
    const mid = (bands[d] + bands[d + 1]) / 2;
    const arcLength = (spans[d] ?? 1.5) * mid;
    expect(thickness).toBeLessThanOrEqual(arcLength * (1 + 1e-6));
  }
}

describe('computeRingBoundaries', () => {
  it('returns degenerate output for empty input', () => {
    expect(computeRingBoundaries([], { radius: 100 })).toEqual([0]);
  });

  it('handles a single band', () => {
    const bands = computeRingBoundaries([Number.POSITIVE_INFINITY, 1], { radius: 100 });
    assertInvariants(bands, [Number.POSITIVE_INFINITY, 1], 100);
  });

  it('keeps arcs longer than ring thickness under heavy fan-out', () => {
    // 5 levels; outermost level crammed with tiny spans — the classic sliver case.
    const spans = [Number.POSITIVE_INFINITY, 1.2, 0.6, 0.25, 0.08, 0.03];
    const bands = computeRingBoundaries(spans, { radius: 300 });
    assertInvariants(bands, spans, 300);
  });

  it('respects the center cap', () => {
    const spans = [Number.POSITIVE_INFINITY, 1, 1, 1];
    const bands = computeRingBoundaries(spans, { radius: 200, centerCap: 40 });
    expect(bands[1]).toBeLessThanOrEqual(40 + 1e-9);
    assertInvariants(bands, spans, 200);
  });

  it('enforces minimum thickness on inner rings', () => {
    const spans = [Number.POSITIVE_INFINITY, 1, 1, 1];
    const bands = computeRingBoundaries(spans, {
      radius: 150,
      centerCap: 10,
      minThickness: 12,
    });
    for (let d = 1; d < bands.length - 1; d++) {
      expect(bands[d + 1] - bands[d]).toBeGreaterThanOrEqual(12 - 1e-9);
    }
  });

  it('survives randomized adversarial spans', () => {
    const random = makeRandom(42);
    for (let trial = 0; trial < 200; trial++) {
      const depthCount = 2 + Math.floor(random() * 6); // 2..7 bands
      const spans: number[] = [Number.POSITIVE_INFINITY];
      for (let d = 1; d <= depthCount; d++) {
        // Bias toward very small spans at deeper levels.
        const bias = Math.pow(random(), 2 + d * 0.5);
        spans.push(Math.max(0.01, bias * Math.PI));
      }
      const radius = 50 + random() * 400;
      const bands = computeRingBoundaries(spans, { radius });
      assertInvariants(bands, spans, radius);
    }
  });
});
