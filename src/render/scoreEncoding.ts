import { chartConfig } from '../config.js';
import type { TreeNode } from '../types.js';

/**
 * Score-to-visual encoding. Intensity modulates fill saturation; low confidence
 * switches the border to a dashed pattern. Both are additive to the existing
 * class-based colors and never affect tooltips.
 */

export function scoreFillStyle(
  node: TreeNode,
  color: string,
  range: { min: number; max: number } = chartConfig.scoreEncoding.intensityFill,
): string | null {
  if (!node.score || !color) return null;
  const intensity = clamp01(node.score.intensity);
  const pct = Math.round(range.min + (range.max - range.min) * intensity);
  return `color-mix(in srgb, ${color} ${pct}%, var(--pam-surface, #ffffff))`;
}

export function scoreStrokeDash(node: TreeNode, threshold = chartConfig.scoreEncoding.confidenceDashedBelow): string | null {
  if (!node.score) return null;
  return node.score.confidence < threshold ? '4 3' : null;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}
