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
 * Replicates the allocator's λ-recursion so tests can compute the unique
 * relaxation λ* (worst uniform aspect ratio) exactly like the implementation:
 * chainOuter(λ*) = radius. λ* <= 1 ⇔ strict feasibility at full fill.
 */
function relaxationStar(spansByDepth: number[], radius: number): number {
  const n = spansByDepth.length - 1;
  const cap = radius * 0.32;
  const minThickness = radius * 0.015;
  const SPAN_MAX = 2 / TOLERANCE - 1e-6;
  const B1 = Math.min(
    Math.max(radius * Math.pow(1 / (n + 1), 0.7), Math.min(minThickness, cap)),
    cap,
  );
  if (B1 + n * minThickness > radius) return Number.POSITIVE_INFINITY;
  const spans: number[] = [];
  for (let d = 1; d <= n; d++) {
    const raw = spansByDepth[d] ?? 0;
    spans.push(Number.isFinite(raw) && raw > 0 ? Math.min(raw, SPAN_MAX) : SPAN_MAX);
  }
  // Floors included, mirroring the implementation's search objective.
  const outerFloored = (lambda: number): number => {
    let a = B1;
    for (const s of spans) {
      const x = lambda * TOLERANCE * s;
      const m = x >= 2 ? Number.POSITIVE_INFINITY : (2 + x) / (2 - x);
      a = Math.max(a * m, a + minThickness);
    }
    return a;
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48 && outerFloored(hi) < radius; i++) hi *= 2;
  if (outerFloored(hi) < radius) return Number.POSITIVE_INFINITY;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (outerFloored(mid) <= radius) lo = mid;
    else hi = mid;
  }
  return lo;
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
    // exclusive: every band's aspect ratio lifts by the same factor λ*
    // (the unique relaxation closing the radius), never locally exploding,
    // and the chart still fills.
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

      const lift = relaxationStar(spans, radius);
      if (Number.isFinite(lift)) {
        const minThickness = radius * 0.015;
        for (let d = 1; d < bands.length - 1; d++) {
          const mid = (bands[d]! + bands[d + 1]!) / 2;
          const budget = TOLERANCE * (spans[d] ?? 0) * mid;
          // Bands sit at the relaxed cap (ratio = λ*) unless the thickness
          // floor dominates, which only happens at sub-10px scales.
          const allowed = Math.max(budget * lift, minThickness);
          expect(bands[d + 1]! - bands[d]!).toBeLessThanOrEqual(
            allowed * 1.05 + 1e-6,
          );
        }
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
      if (relaxationStar(spans, radius) <= 1) {
        assertNoSlivers(bands, spans);
      } else {
        const lift = relaxationStar(spans, radius)!;
        expect(maxRatio(bands, spans)).toBeLessThanOrEqual(lift * 1.05 + 0.05);
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
