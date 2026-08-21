import type { ResolvedChartConfig } from '../config.js';
import type { TreeNode } from '../types.js';
import { SunburstRenderer, type SunburstRendererOptions } from './SunburstRenderer.js';
import { IcicleRenderer } from './IcicleRenderer.js';

/**
 * Layout-agnostic renderer contract. Both engines share the ZoomController,
 * collapse pipeline, tooltip wiring, and highlight semantics.
 */
export interface MapRenderer {
  render(root: TreeNode): void;
  setHighlight(nodeId: string | null): void;
  resize(): void;
  destroy(): void;
  getTooltipElementId(): string;
  /** Live SVG root, for export serialization. */
  getSVGElement(): SVGSVGElement;
  /** The chart's resolved per-instance configuration snapshot. */
  getConfig(): ResolvedChartConfig;
  /** Animate the viewport (pan/zoom) back to identity. */
  resetView(): void;
}

export type MapRendererOptions = SunburstRendererOptions;

export function createRenderer(
  container: HTMLElement,
  options: MapRendererOptions,
  config?: Partial<ResolvedChartConfig>,
  layoutMode: 'sunburst' | 'icicle' = 'sunburst',
): MapRenderer {
  if (layoutMode === 'icicle') {
    return new IcicleRenderer(container, options, config);
  }
  return new SunburstRenderer(container, options, config);
}
