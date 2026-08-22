/**
 * Sliver-proof radial allocation for sunburst rings.
 *
 * Problem this solves: with a fixed radius curve, outer rings become thick
 * while high fan-out makes their angular spans tiny, producing long narrow
 * wedges — and naive repair+rescale approaches re-inflate the center disc
 * (see BUG-ring-allocator.md).
 *
 * Guarantee: for every depth d >= 1 band [B(d), B(d+1)],
 *   bandThickness <= aspectTolerance * minSpan(d) * midRadius
 * whenever the geometry is feasible (E >= radius, see below). Long-enough
 * arcs impose no constraint at all, so shallow/wide trees keep natural
 * proportions and the center disc always respects its cap.
 *
 * Constructive method (no interacting loops, nothing can oscillate):
 *   1. Anchor B(1) inside the center cap.
 *   2. Per-band growth caps follow from w <= λ·K·s·(a + a + w)/2:
 *      B(d+1) = B(d) · 2λKs / (2 − λKs)   for λKs < 2, else unconstrained
 *      (effective spans are clamped below 2/K so factors stay finite).
 *   3. chainOuter(λ) is strictly increasing in λ. Its maximum E at λ=1 is
 *      the largest strictly-feasible extent. If E >= radius, binary-search
 *      the largest λ that fits and fill exactly. Otherwise emit the λ=1
 *      chain (maximum strict extent) and distribute the shortfall in one
 *      additive pass weighted by allowed arc budget — bounded, predictable
 *      degradation instead of gaps or explosions.
 */

export interface RingBoundaryOptions {
  /** Outer chart radius in px. */
  radius: number;
  /** Absolute cap on the center disc radius (outer edge of the depth-0 band). */
  centerCap?: number;
  /** Absolute minimum band thickness; keeps gaps/padding from swallowing arcs. */
  minThickness?: number;
  /**
   * How many times longer than its arc length a band may get before it counts
   * as a sliver. Higher = more tolerant, fewer constraints (default 3).
   */
  aspectTolerance?: number;
}

const SEARCH_ITERATIONS = 60;

export function worstViolationOf(
  bands: number[],
  spans: number[],
  tolerance: number,
): number {
  let worst = 0;
  for (let d = 1; d < bands.length - 1; d++) {
    const span = spans[d] ?? 0;
    if (!(span > 0)) continue;
    const thickness = bands[d + 1]! - bands[d]!;
    const mid = (bands[d]! + bands[d + 1]!) / 2;
    if (!(mid > 0)) continue;
    worst = Math.max(worst, thickness / (tolerance * span * mid));
  }
  return worst;
}

/**
 * Legacy pow-curve allocation (pre-0.2 behavior), selectable via
 * `layout.ringScale: 'exponent'`. No sliver guarantees — provided as an
 * escape hatch and for visual comparison.
 */
export function legacyExponentBoundaries(
  bandCount: number,
  radius: number,
  exponent: { base: number; perLevel: number },
  depthThreshold: number,
): number[] {
  if (bandCount < 1 || !(radius > 0)) return [0];
  const p = exponent.base + Math.max(0, bandCount - depthThreshold) * exponent.perLevel;
  const bands = [0];
  for (let d = 1; d <= bandCount + 1; d++) {
    bands.push(radius * Math.pow(d / (bandCount + 1), p));
  }
  return bands;
}

export function computeRingBoundaries(
  minSpansByDepth: number[],
  options: RingBoundaryOptions,
): number[] {
  const radius = options.radius;
  // minSpansByDepth[d] is the minimum pad-adjusted span at depth d; index 0 is
  // the center disc (never a sliver). Bands exist for depths 0..N, so N=len-1.
  const bandCount = minSpansByDepth.length - 1;
  if (bandCount < 1 || !(radius > 0)) return [0];

  const tolerance = Math.max(1, options.aspectTolerance ?? 3);
  const centerCap = options.centerCap ?? radius * 0.32;
  const minThickness = options.minThickness ?? radius * 0.015;

  // Effective per-band spans (depth 1..N), clamped so cap factors stay finite.
  const SPAN_MAX = 2 / tolerance - 1e-6;
  const spans: number[] = [];
  for (let d = 1; d <= bandCount; d++) {
    const s = minSpansByDepth[d];
    spans.push(Number.isFinite(s) && s > 0 ? Math.min(s, SPAN_MAX) : SPAN_MAX);
  }

  // Center anchor: seeded from the loosest power curve, clamped into the cap.
  const seedB1 = radius * Math.pow(1 / (bandCount + 1), 0.7);
  const B1 = Math.min(Math.max(seedB1, Math.min(minThickness, centerCap)), centerCap);

  const factor = (s: number, lambda: number): number => {
    const x = lambda * tolerance * s;
    return x >= 2 ? Number.POSITIVE_INFINITY : (2 * x) / (2 - x);
  };

  /** Outer edge of the whole chain under relaxation λ (finite by clamping). */
  const chainOuter = (lambda: number): number => {
    let a = B1;
    for (const s of spans) a *= factor(s, lambda);
    return a;
  };

  /** Build boundaries walking the chain at relaxation λ. */
  const buildChain = (lambda: number): number[] => {
    const bands = [0, B1];
    let a = B1;
    for (let i = 0; i < bandCount; i++) {
      a *= factor(spans[i]!, lambda);
      // Thickness floor: only ever matters at sub-10px scales, where visual
      // continuity outranks exactness.
      a = Math.max(a, bands[bands.length - 1]! + minThickness);
      bands.push(a);
    }
    return bands;
  };

  // Maximum strict-feasible extent.
  const feasibleExtent = chainOuter(1);

  let bands: number[];
  if (feasibleExtent >= radius) {
    // Largest relaxation that still fits; exact fill to float precision.
    let lo = 1e-6;
    let hi = 1;
    for (let i = 0; i < SEARCH_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (chainOuter(mid) <= radius) lo = mid;
      else hi = mid;
    }
    bands = buildChain(lo);
    bands[bands.length - 1] = radius;
  } else {
    // Geometrically impossible: emit the strict-max chain, then one additive
    // pass distributing the shortfall ∝ allowed arc budget K·s·mid (evaluated
    // once — single-shot cannot feed back and diverge).
    bands = buildChain(1);
    const excess = radius - bands[bands.length - 1]!;
    if (excess > 0) {
      const weights = spans.map((s, i) => {
        const mid = (bands[i + 1]! + bands[i + 2]!) / 2;
        return tolerance * s * mid;
      });
      const weightTotal = weights.reduce((sum, w) => sum + w, 0);
      let cursor = bands[1]!;
      for (let i = 0; i < bandCount; i++) {
        cursor += weights[i]! * (excess / weightTotal);
        bands[i + 2] = cursor;
      }
    }
  }

  return bands;
}
