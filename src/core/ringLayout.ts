/**
 * Sliver-proof radial allocation for sunburst rings.
 *
 * Problem this solves: with a fixed radius curve, outer rings become thick while
 * high fan-out makes their angular spans tiny, producing long narrow wedges.
 *
 * Guarantee: for every depth d >= 1 band [B(d), B(d+1)],
 *   minSpan(d) * midRadius >= bandThickness
 * i.e. the shortest arc at that depth is never shorter than the ring is thick.
 *
 * Derivation: the constraint w <= s * (a + (a + w)) / 2 for band width w, inner
 * edge a and span s rearranges to w <= a * 2s / (2 - s). Each band therefore has
 * a multiplicative growth cap relative to its inner edge, enforced in a
 * left-to-right repair pass. Uniform scaling about the origin afterwards keeps
 * every constraint intact (both sides scale linearly) while filling the radius.
 */

export interface RingBoundaryOptions {
  /** Outer chart radius in px. */
  radius: number;
  /** Absolute cap on the center disc radius (outer edge of the depth-0 band). */
  centerCap?: number;
  /** Absolute minimum band thickness; keeps gaps/padding from swallowing arcs. */
  minThickness?: number;
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

const EXPONENT_MIN = 0.7;
const EXPONENT_MAX = 2.6;
const EXPONENT_STEP = 0.05;
/** Spans can approach 2π; clamp so the cap factor stays finite and sane. */
const SPAN_CLAMP = 1.5;

interface InternalOptions {
  radius: number;
  centerCap: number;
  minThickness: number;
}

function capFactor(span: number): number {
  const s = Math.min(Math.max(span, 0), SPAN_CLAMP);
  return (2 * s) / (2 - s);
}

function boundariesForExponent(p: number, bandCount: number, radius: number): number[] {
  const bands = [0];
  for (let d = 1; d <= bandCount + 1; d++) {
    bands.push(radius * Math.pow(d / (bandCount + 1), p));
  }
  return bands;
}

function worstViolation(bands: number[], spans: number[]): number {
  let worst = 0;
  for (let d = 1; d < bands.length - 1; d++) {
    const span = spans[d] ?? SPAN_CLAMP;
    const thickness = bands[d + 1] - bands[d];
    const mid = (bands[d] + bands[d + 1]) / 2;
    if (!(mid > 0)) return Number.POSITIVE_INFINITY;
    worst = Math.max(worst, thickness / (span * mid));
  }
  return worst;
}

function rescaleToRadius(bands: number[], radius: number): void {
  const outer = bands[bands.length - 1];
  if (outer > 0 && Math.abs(outer - radius) > 1e-9) {
    const scale = radius / outer;
    for (let i = 1; i < bands.length; i++) bands[i] *= scale;
  }
}

/**
 * Enforce growth caps outward, then refill radius. The thickness floor doubles
 * as a monotonicity guard: near-zero spans can otherwise cap a band below its
 * inner edge.
 */
function repairPass(base: number[], spans: number[], options: InternalOptions): number[] {
  const bands = [...base];
  const { centerCap, minThickness } = options;

  bands[1] = Math.min(Math.max(bands[1]!, Math.min(minThickness, centerCap)), centerCap);

  for (let d = 1; d < bands.length - 1; d++) {
    const upper = bands[d]! * capFactor(spans[d]!);
    const next = Math.max(Math.min(bands[d + 1]!, upper), bands[d]! + minThickness);
    bands[d + 1] = next;
  }
  rescaleToRadius(bands, options.radius);
  return bands;
}

/**
 * Always-feasible fallback: maximal widths from a capped center disc. Caps bind
 * by construction, so constraints hold regardless of input severity.
 */
function greedyFill(spans: number[], options: InternalOptions): number[] {
  const bands = [0, Math.max(options.centerCap, 1e-6)];
  for (let d = 1; d < spans.length; d++) {
    const upper = bands[d]! * capFactor(spans[d]!);
    bands.push(Math.max(upper, bands[d]! * (1 + 1e-6)));
  }
  rescaleToRadius(bands, options.radius);
  return bands;
}

export function computeRingBoundaries(
  minSpansByDepth: number[],
  options: RingBoundaryOptions,
): number[] {  const radius = options.radius;
  // minSpansByDepth[d] is the minimum pad-adjusted span at depth d; index 0 is
  // the center disc (never a sliver). Bands exist for depths 0..N, so N = len-1.
  const bandCount = minSpansByDepth.length - 1;
  if (bandCount < 1 || !(radius > 0)) return [0];

  const internal: InternalOptions = {
    radius,
    centerCap: options.centerCap ?? radius * 0.4,
    minThickness: options.minThickness ?? radius * 0.015,
  };
  const spans = minSpansByDepth.map((s) =>
    Number.isFinite(s) && s > 0 ? s : SPAN_CLAMP,
  );

  // Candidate family 1: repaired power curves across a range of compression.
  const candidates: number[][] = [];
  for (let p = EXPONENT_MIN; p <= EXPONENT_MAX + 1e-9; p += EXPONENT_STEP) {
    const base = boundariesForExponent(p, bandCount, radius);
    candidates.push(repairPass(base, spans, internal));
  }
  // Candidate family 2: guaranteed-feasible greedy fill.
  candidates.push(greedyFill(spans, internal));

  // Pick the least-violating candidate; prefer thicker floors, then fuller fill.
  const score = (bands: number[]) => {
    let floorDeficit = 0;
    for (let d = 1; d < bands.length - 1; d++) {
      floorDeficit += Math.max(0, internal.minThickness - (bands[d + 1]! - bands[d]!));
    }
    return {
      violation: worstViolation(bands, spans),
      floorDeficit,
      fill: bands[bands.length - 1]!,
    };
  };

  let best = candidates[0]!;
  let bestScore = score(best);
  for (const candidate of candidates.slice(1)) {
    const s = score(candidate);
    const better =
      s.violation < bestScore.violation - 1e-9 ||
      (Math.abs(s.violation - bestScore.violation) <= 1e-9 &&
        (s.floorDeficit < bestScore.floorDeficit - 1e-9 ||
          (Math.abs(s.floorDeficit - bestScore.floorDeficit) <= 1e-9 &&
            s.fill > bestScore.fill)));
    if (better) {
      best = candidate;
      bestScore = s;
    }
  }
  return best;
}
