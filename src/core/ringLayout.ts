/**
 * Sliver-proof radial allocation for sunburst rings.
 *
 * Problem this solves: with a fixed radius curve, outer rings become thick
 * while high fan-out makes their angular spans tiny, producing long narrow
 * wedges — and naive repair+rescale approaches re-inflate the center disc
 * (see BUG-ring-allocator.md).
 *
 * Guarantee: for every depth d >= 1 band [B(d), B(d+1)],
 *   bandThickness <= aspectTolerance · λ* · minSpan(d) · midRadius
 * where λ* is the unique relaxation that closes the outer boundary at the
 * chart radius. λ* <= 1 means the strict sliver invariant holds (λ* is the
 * worst ratio, uniformly across bands); λ* > 1 means the input is
 * geometrically impossible and every band degrades by the same factor λ*
 * — predictable, proportional, no local explosions. The center disc always
 * respects its cap.
 *
 * Constructive method (no interacting loops, nothing can oscillate):
 *   1. Anchor B(1) inside the center cap.
 *   2. Per-band growth caps follow from w <= λ·K·s·(a + a + w)/2:
 *      w <= a · 2λKs / (2 − λKs), i.e. the OUTER edge obeys
 *      B(d+1) <= B(d) · (2 + λKs) / (2 − λKs)
 *      (the multiplier is 1 + width-cap — never below 1, so boundaries can
 *      only grow; see BUG-ring-allocator.md §9.7 for the missing-+1 bug).
 *      Effective spans are clamped below 2/K so factors stay finite.
 *   3. chainOuter(λ) is strictly increasing in λ on (0, ∞): binary-search
 *      the unique λ* with chainOuter(λ*) = radius and build the chain.
 *      Every band ends up exactly at its relaxed cap, so degradation (when
 *      it exists at all) is uniform by construction. minThickness floors
 *      only ever bind at sub-10px scales where continuity outranks exactness.
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
const MAX_EXPANSIONS = 48;

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
    // Outer-edge multiplier = 1 + width-cap (2λKs/(2 − λKs)); always >= 1.
    return x >= 2 ? Number.POSITIVE_INFINITY : (2 + x) / (2 - x);
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

  /** Outer edge of the whole chain under relaxation λ, floors included. */
  const chainOuter = (lambda: number): number =>
    buildChain(lambda)[bandCount + 1]!;

  let bands: number[];
  if (B1 + bandCount * minThickness > radius) {
    // Degenerate corner: even zero relaxation overshoots the radius (tiny
    // charts, many bands). Hand out the space in equal slices —
    // deterministic, filled, monotone; continuity outranks exactness here.
    const step = Math.max(0, radius - B1) / bandCount;
    bands = [0, B1];
    for (let i = 1; i <= bandCount; i++) bands.push(B1 + i * step);
    bands[bands.length - 1] = radius;
  } else {
    // One unified monotone search. Every band on a λ-chain sits exactly AT
    // its relaxed cap, so its true-constraint aspect ratio is exactly λ:
    // λ* <= 1 means the strict invariant holds with full fill (feasible),
    // λ* > 1 means the input is geometrically impossible and every band
    // degrades uniformly by the unique factor that closes the radius — no
    // branch-specific stretch pass, nothing can dump excess into one band.
    let lo = 0;
    let hi = 1;
    let expanded = false;
    for (let i = 0; i < MAX_EXPANSIONS && chainOuter(hi) < radius; i++) hi *= 2;
    if (chainOuter(hi) >= radius) {
      expanded = true;
      for (let i = 0; i < SEARCH_ITERATIONS; i++) {
        const mid = (lo + hi) / 2;
        if (chainOuter(mid) <= radius) lo = mid;
        else hi = mid;
      }
    }
    if (!expanded) {
      // Absurd input (spans far below any renderable scale): equal slices.
      const step = Math.max(0, radius - B1) / bandCount;
      bands = [0, B1];
      for (let i = 1; i <= bandCount; i++) bands.push(B1 + i * step);
      bands[bands.length - 1] = radius;
    } else {
      // Search objective is the FLOORED outer, so the final snap to the
      // radius is upward float noise and can never invert a boundary.
      bands = buildChain(lo);
      bands[bands.length - 1] = radius;
    }
  }

  return bands;
}
