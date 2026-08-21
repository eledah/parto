import * as d3 from 'd3';
import type { HierarchyRectangularNode } from 'd3-hierarchy';
import { resolveConfig, syncColorsFromCssInto } from '../config.js';
import type { ResolvedChartConfig } from '../config.js';
import { getNodeArcClass, getNodeColor } from '../core/buildTree.js';
import { applyCollapse, isWedge } from '../core/collapse.js';
import { computeRingBoundaries } from '../core/ringLayout.js';
import { scoreFillStyle, scoreStrokeDash } from './scoreEncoding.js';
import type { MapRenderer, MapRendererOptions } from './index.js';
import type { TreeNode } from '../types.js';

type D3Node = HierarchyRectangularNode<TreeNode>;
type InteractionEvent = PointerEvent | FocusEvent;
type RectSelection = d3.Selection<SVGRectElement, D3Node, SVGGElement, undefined>;

const PAD_X = 1;

/**
 * Horizontal icicle layout: depth grows downward, siblings share horizontal
 * space. Often reads better than a sunburst for deep hierarchies; shares the
 * collapse pipeline, wedge interaction, highlight semantics, and pan-zoom.
 */
export class IcicleRenderer implements MapRenderer {
  private config: ResolvedChartConfig;
  private container: HTMLElement;
  private chartRoot: HTMLElement;
  private width = 0;
  private height = 0;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private gRoot: d3.Selection<SVGGElement, unknown, null, undefined>;
  private g: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private partition = d3.partition<TreeNode>();
  private currentRoot: TreeNode | null = null;
  private highlightId: string | null = null;
  private animate = true;
  private prevGeometry = new Map<string, { x0: number; x1: number }>();
  private resizeObserver: ResizeObserver | null = null;
  private options: MapRendererOptions;
  private tooltipId: string;
  private touchZoomPathKey: string | null = null;
  private touchOutsideHandler: ((event: PointerEvent) => void) | null = null;

  constructor(
    container: HTMLElement,
    options: MapRendererOptions,
    config?: Partial<ResolvedChartConfig>,
  ) {
    this.container = container;
    this.options = options;
    this.config = resolveConfig(config);
    this.tooltipId = `pam-tooltip-${Math.random().toString(36).slice(2, 9)}`;

    this.chartRoot = document.createElement('div');
    this.chartRoot.className = 'pam-chart__canvas';
    container.appendChild(this.chartRoot);

    syncColorsFromCssInto(container, this.config.colors);

    this.svg = d3
      .select(this.chartRoot)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', options.ariaLabel);

    this.gRoot = this.svg.append('g');
    this.g = this.gRoot.append('g');
    this.initPanZoom();

    this.partition = d3.partition<TreeNode>().size([1, 1]);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  destroy(): void {
    this.unbindTouchOutsideDismiss();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.chartRoot.remove();
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    if (this.height < this.config.chart.minRadius) return;

    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
    if (this.currentRoot) {
      const wasAnimated = this.animate;
      this.animate = false;
      try {
        this.render(this.currentRoot);
      } finally {
        this.animate = wasAnimated;
      }
    }
  }

  setHighlight(nodeId: string | null): void {
    this.highlightId = nodeId;
    const lineage = nodeId ? this.lineageIds(nodeId) : new Set<string>();
    this.g
      .selectAll<SVGRectElement, D3Node>('rect.pam-arc')
      .classed('pam-arc--highlighted', (d) => nodeId === d.data.id)
      .classed('pam-arc--ancestor', (d) => lineage.has(d.data.id))
      .classed('pam-arc--dimmed', (d) => {
        if (nodeId == null) return false;
        return nodeId !== d.data.id && !lineage.has(d.data.id);
      });
  }

  resetView(): void {
    if (!this.zoomBehavior) return;
    this.svg
      .transition()
      .duration(this.config.chart.transitionDuration)
      .call(this.zoomBehavior.transform, d3.zoomIdentity);
  }

  getTooltipElementId(): string {
    return this.tooltipId;
  }

  getSVGElement(): SVGSVGElement {
    return this.svg.node()!;
  }

  getConfig(): ResolvedChartConfig {
    return this.config;
  }

  render(rootNode: TreeNode): void {
    this.touchZoomPathKey = null;
    this.unbindTouchOutsideDismiss();

    this.currentRoot = rootNode;
    syncColorsFromCssInto(this.container, this.config.colors);
    const colors = this.config.colors;

    const maxDepth = (node: TreeNode): number =>
      node.children.reduce((max, child) => Math.max(max, maxDepth(child) + 1), 0);
    const safeMaxDepth = Math.max(maxDepth(rootNode), 1);

    const selfWeight = (node: TreeNode): number => {
      if (isWedge(node)) return Math.max(1, node.wedgeMeta?.count ?? 1);
      return node.children.length === 0 ? 1 : 0;
    };

    const layoutPass = (root: TreeNode): { hierarchy: D3Node; spans: Map<string, number> } => {
      const hierarchyRoot = d3.hierarchy(root).sum(selfWeight);
      this.partition.size([Math.max(1, this.width), safeMaxDepth + 1]);
      this.partition(hierarchyRoot as D3Node);
      const spans = new Map<string, number>();
      const total = Math.max(this.width, 1);
      (hierarchyRoot as D3Node).each((d) => {
        // Normalize to circle-fraction so spacing.minAngle (radians) keeps the
        // same meaning across sunburst and icicle engines.
        const normalized = ((d.x1 - d.x0 - PAD_X) / total) * 2 * Math.PI;
        spans.set(d.data.pathKey, Math.max(normalized, 1e-6));
      });
      return { hierarchy: hierarchyRoot as D3Node, spans };
    };

    const measuredSpans = layoutPass(rootNode).spans;

    const { root: displayRoot } = this.config.layout.aggregation
      ? applyCollapse(rootNode, {
          spans: measuredSpans,
          minAngle: this.config.spacing.minAngle,
          chunkSize: this.config.limits.wedgeChunkSize,
        })
      : { root: rootNode };

    const { hierarchy: root, spans: finalSpans } = layoutPass(displayRoot);

    const minSpansByDepth: number[] = new Array(safeMaxDepth + 1).fill(Number.POSITIVE_INFINITY);
    minSpansByDepth[0] = Number.POSITIVE_INFINITY;
    for (const node of root.descendants()) {
      if (node.depth === 0) continue;
      const span = finalSpans.get(node.data.pathKey);
      if (span === undefined) continue;
      minSpansByDepth[node.depth] = Math.min(minSpansByDepth[node.depth], span);
    }

    // Vertical band boundaries reuse the sliver-proof allocator with height as
    // the "radius": shortest row segment at each depth >= row thickness.
    const bands = computeRingBoundaries(minSpansByDepth, {
      radius: this.height,
      centerCap: this.height * this.config.chart.maxCenterRadius,
      minThickness: this.height * this.config.limits.ringMinThicknessFraction,
    });

    const gap = this.height * this.config.spacing.verticalGap;

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = this.animate === false || reducedMotion ? 0 : this.config.chart.transitionDuration;

    const oldFinals = this.prevGeometry;
    const starts = new Map<string, { x0: number; x1: number }>();
    for (const node of root.descendants()) {
      const prev = oldFinals.get(node.data.pathKey);
      if (prev) {
        starts.set(node.data.pathKey, prev);
        continue;
      }
      const parentStart = node.parent ? starts.get(node.parent.data.pathKey) : undefined;
      starts.set(node.data.pathKey, parentStart ?? { x0: node.x0, x1: node.x1 });
    }
    this.prevGeometry = new Map(
      root.descendants().map((n) => [n.data.pathKey, { x0: n.x0, x1: n.x1 } as const]),
    );

    this.g.selectAll('g.pam-labels').remove();

    const join = this.g
      .selectAll<SVGRectElement, D3Node>('rect.pam-arc')
      .data(root.descendants(), (d) => d.data.pathKey);

    const enterRects: RectSelection = join
      .enter()
      .append('rect')
      .attr('class', (d) => `pam-arc ${getNodeArcClass(d.data, rootNode)}`)
      .attr('x', (d) => starts.get(d.data.pathKey)!.x0)
      .attr('y', (d) => bands[d.depth]! + gap)
      .attr('height', (d) =>
        Math.max((bands[d.depth + 1] ?? 0) - bands[d.depth]! - 2 * gap, 0),
      );

    if (duration === 0) {
      join.exit().remove();
    } else {
      (join.exit() as unknown as RectSelection)
        .transition()
        .duration(duration)
        .style('opacity', 0)
        .remove();
    }

    const rects: RectSelection = enterRects.merge(join as unknown as RectSelection);

    if (duration > 0) {
      rects
        .transition()
        .duration(duration)
        .attr('x', (d) => d.x0)
        .attr('width', (d) => Math.max(d.x1 - d.x0 - PAD_X, 0));
    } else {
      rects.attr('x', (d) => d.x0).attr('width', (d) => Math.max(d.x1 - d.x0 - PAD_X, 0));
    }

    rects
      .attr('data-node-id', (d) => d.data.id)
      .attr('data-path-key', (d) => d.data.pathKey)
      .attr('tabindex', '0')
      .attr('role', 'button')
      .attr('aria-label', (d) =>
        isWedge(d.data) ? `Show ${d.data.wedgeMeta?.count ?? 0} hidden arguments` : d.data.title,
      )
      .attr('aria-describedby', this.tooltipId)
      .style('stroke', colors.border)
      .style('stroke-width', this.config.chart.strokeWidth)
      .style('fill', (d) => {
        if (!d.data.score) return null;
        return scoreFillStyle(d.data, getNodeColor(d.data, rootNode, colors), this.config.scoreEncoding.intensityFill);
      })
      .style('stroke-dasharray', (d) => scoreStrokeDash(d.data, this.config.scoreEncoding.confidenceDashedBelow))
      .style('cursor', this.options.zoomEnabled ? 'pointer' : 'default')
      .classed('pam-arc--highlighted', (d) => this.highlightId === d.data.id)
      .classed('pam-arc--dimmed', (d) => this.highlightId != null && this.highlightId !== d.data.id);

    if (this.options.arcLabels) {
      this.renderLabelLayer(root, bands, gap);
    }

    const showHover = (event: InteractionEvent, d: D3Node) => {
      const lineage = new Set<string>();
      for (let p = d.parent; p; p = p.parent) lineage.add(p.data.id);
      rects
        .classed('pam-arc--dimmed', (n) => n.data.id !== d.data.id && !lineage.has(n.data.id))
        .classed('pam-arc--ancestor', (n) => lineage.has(n.data.id))
        .classed('pam-arc--highlighted', (n) => n.data.id === d.data.id)
        .style('filter', function (n) {
          if (n.data.id !== d.data.id) return null;
          try {
            const nodeColor = getNodeColor(d.data, rootNode, colors);
            return `brightness(${d.depth === 0 ? 1.05 : 1.2}) drop-shadow(0 0 10px ${nodeColor})`;
          } catch {
            return null;
          }
        });
      this.options.onHover?.(d.data, event);
    };

    const clearHover = () => {
      rects
        .classed('pam-arc--dimmed', false)
        .classed('pam-arc--ancestor', false)
        .classed('pam-arc--highlighted', false)
        .style('filter', null);
      if (this.highlightId) {
        this.setHighlight(this.highlightId);
      }
      this.options.onLeave?.();
    };

    const hasChildren = (d: D3Node): boolean =>
      (d.data.children?.length ?? 0) > 0 || isWedge(d.data);

    const handleClick = (event: PointerEvent, d: D3Node) => {
      event.stopPropagation();
      if (event.pointerType === 'touch') {
        if (this.touchZoomPathKey === d.data.pathKey) {
          this.touchZoomPathKey = null;
          this.unbindTouchOutsideDismiss();
          if (this.options.zoomEnabled) this.options.onClick?.(d.data, d.depth, hasChildren(d));
        } else {
          this.touchZoomPathKey = d.data.pathKey;
          showHover(event, d);
          this.bindTouchOutsideDismiss(clearHover);
        }
        return;
      }
      if (this.options.zoomEnabled) this.options.onClick?.(d.data, d.depth, hasChildren(d));
    };

    rects
      .on('pointerenter', (event: PointerEvent, d) => {
        if (event.pointerType === 'touch') return;
        showHover(event, d);
      })
      .on('pointermove', (event: PointerEvent, d) => {
        if (event.pointerType === 'touch') return;
        showHover(event, d);
      })
      .on('pointerleave', (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        clearHover();
      })
      .on('focus', (_event: FocusEvent, d) => showHover({ type: 'focus' } as FocusEvent, d))
      .on('blur', () => clearHover())
      .on('click', (event: PointerEvent, d) => handleClick(event, d))
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (this.options.zoomEnabled) this.options.onClick?.(d.data, d.depth, hasChildren(d));
        }
      });
  }

  /** In-band horizontal labels; drawn only when the cell has room. */
  private renderLabelLayer(root: D3Node, bands: number[], gap: number): void {
    const fontSize = this.config.labels.fontSize;
    const charWidth = fontSize * 0.56;

    const layer = this.g
      .append('g')
      .attr('class', 'pam-labels')
      .attr('pointer-events', 'none')
      .attr('aria-hidden', 'true');

    for (const d of root.descendants()) {
      if (d.depth === 0) continue;
      const inner = bands[d.depth];
      const outer = bands[d.depth + 1];
      if (inner === undefined || outer === undefined || !(outer > inner)) continue;

      const width = d.x1 - d.x0 - PAD_X;
      const thickness = outer - inner - 2 * gap;
      if (!(width > 6 * charWidth) || !(thickness > fontSize * 1.25)) continue;

      let title = d.data.title.trim();
      if (!title) continue;
      const maxChars = Math.floor(width / charWidth) - 1;
      if (title.length > maxChars) {
        title = `${title.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
      }

      layer
        .append('text')
        .attr('x', d.x0 + 6)
        .attr('y', (inner + outer) / 2)
        .attr('dominant-baseline', 'central')
        .attr('font-size', String(fontSize))
        .text(title);
    }
  }

  private lineageIds(nodeId: string): Set<string> {
    const ids = new Set<string>();
    const target = this.g
      .selectAll<SVGRectElement, D3Node>('rect.pam-arc')
      .data()
      .find((d) => d.data.id === nodeId);
    for (let p = target?.parent; p; p = p.parent) ids.add(p.data.id);
    return ids;
  }

  private initPanZoom(): void {
    const [minScale, maxScale] = this.config.ui.scaleExtent;
    this.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([minScale, maxScale])
      .filter((event) => {
        if (event.type === 'dblclick') return false;
        return !event.ctrlKey || event.type === 'wheel';
      })
      .on('zoom', (event) => {
        this.gRoot.attr(
          'transform',
          `translate(${event.transform.x},${event.transform.y}) scale(${event.transform.k})`,
        );
      });
    this.svg.call(this.zoomBehavior).on('dblclick.zoom', null);
  }

  private bindTouchOutsideDismiss(onDismiss: () => void): void {
    this.unbindTouchOutsideDismiss();
    this.touchOutsideHandler = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && this.container.contains(target)) return;
      this.touchZoomPathKey = null;
      onDismiss();
      this.unbindTouchOutsideDismiss();
    };
    window.setTimeout(() => {
      if (this.touchOutsideHandler) {
        document.addEventListener('pointerdown', this.touchOutsideHandler, true);
      }
    }, 0);
  }

  private unbindTouchOutsideDismiss(): void {
    if (this.touchOutsideHandler) {
      document.removeEventListener('pointerdown', this.touchOutsideHandler, true);
      this.touchOutsideHandler = null;
    }
  }
}
