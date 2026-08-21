import * as d3 from 'd3';
import type { HierarchyRectangularNode } from 'd3-hierarchy';
import { chartConfig, syncColorsFromCss } from '../config.js';
import { getNodeArcClass, getNodeColor } from '../core/buildTree.js';
import { applyCollapse, isWedge } from '../core/collapse.js';
import { computeRingBoundaries } from '../core/ringLayout.js';
import type { TreeNode } from '../types.js';

type D3Node = HierarchyRectangularNode<TreeNode>;
type InteractionEvent = PointerEvent | FocusEvent;

export interface SunburstRendererOptions {
  ariaLabel: string;
  zoomEnabled: boolean;
  onHover?: (node: TreeNode, event: InteractionEvent) => void;
  onLeave?: () => void;
  onClick?: (node: TreeNode, depth: number, hasChildren: boolean) => void;
}

export class SunburstRenderer {
  private container: HTMLElement;
  private chartRoot: HTMLElement;
  private width = 0;
  private height = 0;
  private radius = 0;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g: d3.Selection<SVGGElement, unknown, null, undefined>;
  private partition = d3.partition<TreeNode>();
  private arc: d3.Arc<unknown, D3Node>;
  private currentRoot: TreeNode | null = null;
  private highlightId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private options: SunburstRendererOptions;
  private tooltipId: string;
  /** First touch tap shows tooltip; second tap on same arc triggers zoom. */
  private touchZoomPathKey: string | null = null;
  private touchOutsideHandler: ((event: PointerEvent) => void) | null = null;

  constructor(container: HTMLElement, options: SunburstRendererOptions) {
    this.container = container;
    this.options = options;
    this.tooltipId = `pam-tooltip-${Math.random().toString(36).slice(2, 9)}`;

    this.chartRoot = document.createElement('div');
    this.chartRoot.className = 'pam-chart__canvas';
    container.appendChild(this.chartRoot);

    syncColorsFromCss(container);

    this.svg = d3
      .select(this.chartRoot)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', options.ariaLabel);

    this.g = this.svg.append('g');

    this.partition = d3.partition<TreeNode>().size([2 * Math.PI, 1]);

    this.arc = d3
      .arc<unknown, D3Node>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle(chartConfig.spacing.padAngle.inner)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1);

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
    this.radius = Math.min(this.width, this.height) / 2 - chartConfig.chart.radiusPadding;

    if (this.radius < chartConfig.chart.minRadius) return;

    this.partition.size([2 * Math.PI, 1]);
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
    this.g.attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);

    if (this.currentRoot) this.render(this.currentRoot);
  }

  setHighlight(nodeId: string | null): void {
    this.highlightId = nodeId;
    this.g
      .selectAll<SVGPathElement, D3Node>('path')
      .classed('pam-arc--highlighted', (d) => nodeId === d.data.id)
      .classed('pam-arc--dimmed', (d) => nodeId != null && nodeId !== d.data.id);
  }

  render(rootNode: TreeNode): void {
    this.touchZoomPathKey = null;
    this.unbindTouchOutsideDismiss();

    this.currentRoot = rootNode;
    syncColorsFromCss(this.container);
    const colors = chartConfig.colors;

    const maxDepth = (node: TreeNode): number =>
      node.children.reduce((max, child) => Math.max(max, maxDepth(child) + 1), 0);
    const safeMaxDepth = Math.max(maxDepth(rootNode), 1);

    /** Angular weight of a node itself: leaves count 1, wedges count their hidden args. */
    const selfWeight = (node: TreeNode): number => {
      if (isWedge(node)) return Math.max(1, node.wedgeMeta?.count ?? 1);
      return node.children.length === 0 ? 1 : 0;
    };

    const getPadAngle = (depth: number) => {
      const depthFraction = depth / safeMaxDepth;
      return (
        chartConfig.spacing.padAngle.inner -
        depthFraction * (chartConfig.spacing.padAngle.inner - chartConfig.spacing.padAngle.outer)
      );
    };

    /** Partition pass returning each node's effective (pad-adjusted) visual span. */
    const layoutPass = (root: TreeNode): { hierarchy: D3Node; spans: Map<string, number> } => {
      const hierarchyRoot = d3.hierarchy(root).sum(selfWeight);
      this.partition(hierarchyRoot as D3Node);
      const spans = new Map<string, number>();
      (hierarchyRoot as D3Node).each((d) => {
        const raw = d.x1 - d.x0;
        spans.set(d.data.pathKey, Math.max(raw - getPadAngle(d.depth), 1e-6));
      });
      return { hierarchy: hierarchyRoot as D3Node, spans };
    };

    // Measurement pass on the untouched subtree decides which branches collapse.
    const measuredSpans = layoutPass(rootNode).spans;

    const { root: displayRoot } = applyCollapse(rootNode, {
      spans: measuredSpans,
      minAngle: chartConfig.spacing.minAngle,
      chunkSize: chartConfig.limits.wedgeChunkSize,
    });

    // Final geometry pass on the collapsed tree.
    const { hierarchy: root, spans: finalSpans } = layoutPass(displayRoot);

    const minSpansByDepth: number[] = new Array(safeMaxDepth + 1).fill(Number.POSITIVE_INFINITY);
    minSpansByDepth[0] = Number.POSITIVE_INFINITY;
    for (const node of root.descendants()) {
      if (node.depth === 0) continue;
      const span = finalSpans.get(node.data.pathKey);
      if (span === undefined) continue;
      minSpansByDepth[node.depth] = Math.min(minSpansByDepth[node.depth], span);
    }

    const bands = computeRingBoundaries(minSpansByDepth, {
      radius: this.radius,
      centerCap: this.radius * chartConfig.chart.maxCenterRadius,
      minThickness: this.radius * chartConfig.limits.ringMinThicknessFraction,
    });

    const verticalGap = this.radius * chartConfig.spacing.verticalGap;

    this.arc
      .innerRadius((d) => bands[d.depth] + verticalGap)
      .outerRadius((d) => bands[d.depth + 1] - verticalGap)
      .padAngle((d) => getPadAngle(d.depth))
      .cornerRadius(chartConfig.chart.cornerRadius);

    this.g.selectAll('*').remove();

    const paths = this.g
      .selectAll<SVGPathElement, D3Node>('path')
      .data(root.descendants())
      .enter()
      .append('path')
      .attr('d', this.arc)
      .attr('data-node-id', (d) => d.data.id)
      .attr('data-path-key', (d) => d.data.pathKey)
      .attr('class', (d) => getNodeArcClass(d.data, rootNode))
      .attr('tabindex', '0')
      .attr('role', 'button')
      .attr('aria-label', (d) =>
        isWedge(d.data) ? `Show ${d.data.wedgeMeta?.count ?? 0} hidden arguments` : d.data.title,
      )
      .attr('aria-describedby', this.tooltipId)
      .style('stroke', colors.border)
      .style('stroke-width', chartConfig.chart.strokeWidth)
      .style('stroke-linejoin', 'round')
      .style('cursor', this.options.zoomEnabled ? 'pointer' : 'default')
      .classed('pam-arc--highlighted', (d) => this.highlightId === d.data.id)
      .classed('pam-arc--dimmed', (d) => this.highlightId != null && this.highlightId !== d.data.id);

    const showHover = (event: InteractionEvent, d: D3Node) => {
      paths.classed('pam-arc--dimmed', (n) => n.data.id !== d.data.id);
      paths.classed('pam-arc--highlighted', (n) => n.data.id === d.data.id);
      try {
        const nodeColor = getNodeColor(d.data, rootNode, colors);
        d3.select(event.currentTarget as Element).style(
          'filter',
          `brightness(${d.depth === 0 ? 1.05 : 1.2}) drop-shadow(0 0 10px ${nodeColor})`,
        );
      } catch {
        /* ignore filter errors */
      }
      this.options.onHover?.(d.data, event);
    };

    const clearHover = () => {
      paths.classed('pam-arc--dimmed', false).classed('pam-arc--highlighted', false).style('filter', 'none');
      if (this.highlightId) {
        this.setHighlight(this.highlightId);
      }
      this.options.onLeave?.();
    };

    const hasChildren = (d: D3Node): boolean =>
      (d.data.children?.length ?? 0) > 0 || isWedge(d.data);

    const handlePointerClick = (event: PointerEvent, d: D3Node) => {
      event.stopPropagation();

      if (event.pointerType === 'touch') {
        if (this.touchZoomPathKey === d.data.pathKey) {
          this.touchZoomPathKey = null;
          this.unbindTouchOutsideDismiss();
          if (this.options.zoomEnabled) {
            this.options.onClick?.(d.data, d.depth, hasChildren(d));
          }
        } else {
          this.touchZoomPathKey = d.data.pathKey;
          showHover(event, d);
          this.bindTouchOutsideDismiss(clearHover);
        }
        return;
      }

      if (this.options.zoomEnabled) {
        this.options.onClick?.(d.data, d.depth, hasChildren(d));
      }
    };

    paths
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
      .on('focus', (event: FocusEvent, d) => showHover(event, d))
      .on('blur', () => clearHover())
      .on('click', (event: PointerEvent, d) => handlePointerClick(event, d))
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (this.options.zoomEnabled) {
            this.options.onClick?.(d.data, d.depth, hasChildren(d));
          }
        }
      });
  }

  getTooltipElementId(): string {
    return this.tooltipId;
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
