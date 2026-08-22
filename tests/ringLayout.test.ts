import { describe, expect, it } from 'vitest';
import { computeRingBoundaries } from '../src/core/ringLayout.js';

const TOLERANCE = 3;

/** Deterministic LCG so failures reproduce. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function assertShape(bands: number[], radius: number): void {
  expect(bands.length).toBeGreaterThanOrEqual(3);
  expect(bands[0]).toBe(0);
  // Always exactly filled — both the feasible and degraded paths close the gap.
  expect(bands[bands.length - 1]).toBeCloseTo(radius, 6);
  for (let i = 1; i < bands.length; i++) {
    expect(bands[i]).toBeGreaterThan(bands[i - 1]!);
  }
}

function assertNoSlivers(bands: number[], spans: number[]): void {
  for (let d = 1; d < bands.length - 1; d++) {
    const thickness = bands[d + 1]! - bands[d]!;
    const mid = (bands[d]! + bands[d + 1]!) / 2;
    const arcLength = (spans[d] ?? Infinity) * mid;
    if (!Number.isFinite(arcLength)) continue;
    expect(thickness).toBeLessThanOrEqual(TOLERANCE * arcLength * (1 + 1e-6));
  }
}

/**
 * Replicates the allocator's closed-form maximum strict-feasible extent so
 * tests can branch on feasibility exactly like the implementation does.
 */
function feasibleExtent(spansByDepth: number[], radius: number): number {
  const n = spansByDepth.length - 1;
  const cap = radius * 0.32;
  const minThickness = radius * 0.015;
  const SPAN_MAX = 2 / TOLERANCE - 1e-6;
  const B1 = Math.min(
    Math.max(radius * Math.pow(1 / (n + 1), 0.7), Math.min(minThickness, cap)),
    cap,
  );
  let a = B1;
  for (let d = 1; d <= n; d++) {
    const raw = spansByDepth[d] ?? 0;
    const s = Number.isFinite(raw) && raw > 0 ? Math.min(raw, SPAN_MAX) : SPAN_MAX;
    const x = TOLERANCE * s;
    a *= x >= 2 ? Number.POSITIVE_INFINITY : (2 * x) / (2 - x);
  }
  return a;
}

function maxRatio(bands: number[], spans: number[]): number {
  let worst = 0;
  for (let d = 1; d < bands.length - 1; d++) {
    const mid = (bands[d]! + bands[d + 1]!) / 2;
    const arcLength = (spans[d] ?? Infinity) * mid;
    if (!Number.isFinite(arcLength)) continue;
    worst = Math.max(worst, (bands[d + 1]! - bands[d]!) / (TOLERANCE * arcLength));
  }
  return worst;
}

describe('computeRingBoundaries', () => {
  it('returns degenerate output for empty input', () => {
    expect(computeRingBoundaries([], { radius: 100 })).toEqual([0]);
  });

  it('handles a single band', () => {
    const spans = [Number.POSITIVE_INFINITY, 1];
    const bands = computeRingBoundaries(spans, { radius: 100 });
    assertShape(bands, 100);
    assertNoSlivers(bands, spans);
  });

  it('keeps the center disc within its cap on shallow wide maps', () => {
    // Regression: focused deep-map views rendered a ~2/3-radius thesis because
    // origin rescaling amplified clamped-down inner bands.
    const radius = 300;
    const spans = [Number.POSITIVE_INFINITY, 0.76, 0.76];
    const bands = computeRingBoundaries(spans, { radius });
    expect(bands[1]).toBeLessThanOrEqual(radius * 0.32 + 1e-9);
    expect(bands[1]).toBeGreaterThanOrEqual(radius * 0.05); // still a usable disc
    assertShape(bands, radius);
    assertNoSlivers(bands, spans);
  });

  it('fills exactly when constraints are satisfiable', () => {
    const radius = 300;
    const spans = [Number.POSITIVE_INFINITY, 0.9, 0.9, 0.9];
    const bands = computeRingBoundaries(spans, { radius });
    expect(bands[bands.length - 1]).toBe(radius);
    assertShape(bands, radius);
    assertNoSlivers(bands, spans);
  });

  it('degrades predictably on geometrically impossible inputs', () => {
    // Stacked tiny spans make strict feasibility + full fill mutually
    // exclusive: ratios may lift uniformly by up to ~R/E, never locally
    // explode, and the chart still fills.
    const random = makeRandom(7);
    for (let trial = 0; trial < 100; trial++) {
      const depthCount = 3 + Math.floor(random() * 5);
      const spans: number[] = [Number.POSITIVE_INFINITY];
      for (let d = 1; d <= depthCount; d++) {
        spans.push(Math.max(0.001, Math.pow(random(), 3) * 0.02));
      }
      const radius = 60 + random() * 340;
      const bands = computeRingBoundaries(spans, { radius });
      assertShape(bands, radius);
      expect(bands[1]).toBeLessThanOrEqual(radius * 0.33);

      const f = radius / feasibleExtent(spans, radius);
      if (Number.isFinite(f)) {
        expect(maxRatio(bands, spans)).toBeLessThanOrEqual(TOLERANCE * f * 1.25 + 0.05);
      }
    }
  });

  it('survives randomized renderer-realistic spans without slivers', () => {
    const random = makeRandom(42);
    for (let trial = 0; trial < 200; trial++) {
      const depthCount = 2 + Math.floor(random() * 6); // 2..7 bands
      const spans: number[] = [Number.POSITIVE_INFINITY];
      for (let d = 1; d <= depthCount; d++) {
        // Post-collapse floors: wedges remove anything below spacing.minAngle,
        // so realistic surviving spans start near it and grow inward-biased.
        const bias = Math.pow(random(), 1.5 + d * 0.3);
        spans.push(Math.max(0.04, bias * Math.PI));
      }
      const radius = 120 + random() * 330;
      const bands = computeRingBoundaries(spans, { radius });
      assertShape(bands, radius);
      if (feasibleExtent(spans, radius) >= radius) {
        assertNoSlivers(bands, spans);
      } else {
        const f = radius / feasibleExtent(spans, radius);
        expect(maxRatio(bands, spans)).toBeLessThanOrEqual(TOLERANCE * f * 1.25 + 0.05);
      }
    }
  });

  it('respects the center cap option', () => {
    const spans = [Number.POSITIVE_INFINITY, 1, 1, 1];
    const bands = computeRingBoundaries(spans, { radius: 200, centerCap: 40 });
    expect(bands[1]).toBeLessThanOrEqual(40 + 1e-9);
    assertShape(bands, 200);
    assertNoSlivers(bands, spans);
  });

  it('enforces minimum thickness on inner rings', () => {
    const spans = [Number.POSITIVE_INFINITY, 1, 1, 1];
    const bands = computeRingBoundaries(spans, {
      radius: 150,
      centerCap: 10,
      minThickness: 12,
    });
    for (let d = 1; d < bands.length - 1; d++) {
      expect(bands[d + 1]! - bands[d]!).toBeGreaterThanOrEqual(12 - 1e-9);
    }
  });
});
