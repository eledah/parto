import * as d3 from 'd3';
import type { HierarchyRectangularNode } from 'd3-hierarchy';
import { DEFAULT_LABELS, resolveConfig, syncColorsFromCssInto } from '../config.js';
import type { ResolvedChartConfig } from '../config.js';
import { getNodeArcClass, getNodeColor } from '../core/buildTree.js';
import { applyCollapse, isWedge } from '../core/collapse.js';
import { computeRingBoundaries, legacyExponentBoundaries } from '../core/ringLayout.js';
import { scoreFillStyle, scoreStrokeDash } from './scoreEncoding.js';
import type { ArgumentMapLabels, TreeNode } from '../types.js';

type D3Node = HierarchyRectangularNode<TreeNode>;
type InteractionEvent = PointerEvent | FocusEvent;

export interface SunburstRendererOptions {
  ariaLabel: string;
  /** Show the centered semantic-color legend inside the canvas (default true). */
  legend?: boolean;
  labels?: ArgumentMapLabels;
  zoomEnabled: boolean;
  /** Draw truncated titles along arcs when there is room (default false). */
  arcLabels?: boolean;
  onHover?: (node: TreeNode, event: InteractionEvent) => void;
  onLeave?: () => void;
  onClick?: (node: TreeNode, depth: number, hasChildren: boolean) => void;
}

export class SunburstRenderer {
  private config: ResolvedChartConfig;
  private container: HTMLElement;
  private chartRoot: HTMLElement;
  private width = 0;
  private height = 0;
  private radius = 0;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  /** Pan/zoom target group (transformed by wheel/pinch). */
  private gRoot: d3.Selection<SVGGElement, unknown, null, undefined>;
  /** Content group, centered; arcs + labels live here. */
  private g: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private partition = d3.partition<TreeNode>();
  private legend: HTMLElement | null = null;
  private currentRoot: TreeNode | null = null;
  private highlightId: string | null = null;
  /** Disabled during resize-driven renders so window dragging never tweens. */
  private animate = true;
  private resizeObserver: ResizeObserver | null = null;
  private options: SunburstRendererOptions;
  private tooltipId: string;
  /** Final angles from the last render; the tween source for transitions. */
  private prevGeometry = new Map<string, { x0: number; x1: number }>();
  /** First touch tap shows tooltip; second tap on same arc triggers zoom. */
  private touchZoomPathKey: string | null = null;
  private touchOutsideHandler: ((event: PointerEvent) => void) | null = null;

  constructor(container: HTMLElement, options: SunburstRendererOptions, config?: Partial<ResolvedChartConfig>) {
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

    if (this.options.legend ?? true) {
      this.legend = this.createLegend(this.options.labels ?? DEFAULT_LABELS);
      this.chartRoot.appendChild(this.legend);
    }

    this.initPanZoom();

    this.partition = d3.partition<TreeNode>().size([2 * Math.PI, 1]);

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
    // Canvas is sized 100% to the container; measuring the container keeps
    // programmatic-resize callers honest even before canvas layout settles.
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const measuredLegendHeight = this.legend?.getBoundingClientRect().height ?? 0;
    const legendInset = this.legend ? Math.max(56, measuredLegendHeight + 28) : 0;
    const plotHeight = Math.max(0, this.height - legendInset);
    this.radius = Math.min(this.width, plotHeight) / 2 - this.config.chart.radiusPadding;

    if (this.radius < this.config.chart.minRadius) return;

    this.partition.size([2 * Math.PI, 1]);
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
    this.g.attr('transform', `translate(${this.width / 2}, ${plotHeight / 2})`);

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
      .selectAll<SVGPathElement, D3Node>('path.pam-arc')
      .classed('pam-arc--highlighted', (d) => nodeId === d.data.id)
      .classed('pam-arc--ancestor', (d) => lineage.has(d.data.id))
      .classed('pam-arc--dimmed', (d) => {
        if (nodeId == null) return false;
        return nodeId !== d.data.id && !lineage.has(d.data.id);
      });
  }

  /** Ids of every ancestor of the given node within the rendered hierarchy. */
  private lineageIds(nodeId: string): Set<string> {
    const ids = new Set<string>();
    const target = this.g
      .selectAll<SVGPathElement, D3Node>('path.pam-arc')
      .data()
      .find((d) => d.data.id === nodeId);
    for (let p = target?.parent; p; p = p.parent) {
      ids.add(p.data.id);
    }
    return ids;
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

    /** Angular weight of a node itself: leaves count 1, wedges count their hidden args. */
    const selfWeight = (node: TreeNode): number => {
      if (isWedge(node)) return Math.max(1, node.wedgeMeta?.count ?? 1);
      return node.children.length === 0 ? 1 : 0;
    };

    const getPadAngle = (depth: number) => {
      const depthFraction = depth / safeMaxDepth;
      return (
        this.config.spacing.padAngle.inner -
        depthFraction * (this.config.spacing.padAngle.inner - this.config.spacing.padAngle.outer)
      );
    };

    /** Partition pass returning each node's effective (pad-adjusted) visual span. */
    const layoutPass = (root: TreeNode): { hierarchy: D3Node; spans: Map<string, number> } => {
      const hierarchyRoot = d3.hierarchy(root).sum(selfWeight);
      this.partition(hierarchyRoot as D3Node);
      blendAngles(hierarchyRoot as D3Node);
      const spans = new Map<string, number>();
      (hierarchyRoot as D3Node).each((d) => {
        const raw = d.x1 - d.x0;
        spans.set(d.data.pathKey, Math.max(raw - getPadAngle(d.depth), 1e-6));
      });
      return { hierarchy: hierarchyRoot as D3Node, spans };
    };

    /**
     * angleWeight < 1 blends the leaf-weighted partition toward equal sibling
     * angles: x = equal + (weighted - equal) * w. At w=0 every sibling gets an
     * identical slice; at w=1 the weighted layout stands.
     */
    const blendAngles = (root: D3Node): void => {
      const w = Math.min(1, Math.max(0, this.config.layout.angleWeight));
      if (w >= 1) return;
      const equal = new Map<string, { x0: number; x1: number }>();
      const walk = (node: D3Node, a0: number, a1: number): void => {
        equal.set(node.data.pathKey, { x0: a0, x1: a1 });
        const count = node.children?.length ?? 0;
        if (count > 0) {
          const span = (a1 - a0) / count;
          node.children!.forEach((child, i) => walk(child, a0 + i * span, a0 + (i + 1) * span));
        }
      };
      walk(root, 0, 2 * Math.PI);
      root.each((node) => {
        const eq = equal.get(node.data.pathKey);
        if (!eq) return;
        node.x0 = eq.x0 + (node.x0 - eq.x0) * w;
        node.x1 = eq.x1 + (node.x1 - eq.x1) * w;
      });
    };

    // Measurement pass on the untouched subtree decides which branches collapse.
    const measuredSpans = layoutPass(rootNode).spans;

    const { root: displayRoot } = this.config.layout.aggregation
      ? applyCollapse(rootNode, {
          spans: measuredSpans,
          minAngle: this.config.spacing.minAngle,
          chunkSize: this.config.limits.wedgeChunkSize,
        })
      : { root: rootNode };

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

    const bands =
      this.config.layout.ringScale === 'exponent'
        ? legacyExponentBoundaries(
            safeMaxDepth,
            this.radius,
            this.config.spacing.radiusExponent,
            this.config.spacing.exponentDepthThreshold,
          )
        : computeRingBoundaries(minSpansByDepth, {
            radius: this.radius,
            centerCap: this.radius * this.config.chart.maxCenterRadius,
            minThickness: this.radius * this.config.limits.ringMinThicknessFraction,
            aspectTolerance: this.config.spacing.sliverAspectRatio,
          });

    const verticalGap = this.radius * this.config.spacing.verticalGap;

    // Radius accessors are static per render; only angles change (statically or
    // via tweens). Angle specs may be constants or per-datum accessors.
    type AngleSpec = (d: D3Node) => number;
    const buildArc = (getStart: AngleSpec, getEnd: AngleSpec): d3.Arc<unknown, D3Node> =>
      d3
        .arc<unknown, D3Node>()
        .startAngle(getStart)
        .endAngle(getEnd)
        .innerRadius((d) => bands[d.depth] + verticalGap)
        .outerRadius((d) => bands[d.depth + 1] - verticalGap)
        .padAngle((d) => getPadAngle(d.depth))
        .cornerRadius(this.config.chart.cornerRadius);
    const arcFinal = buildArc(
      (d) => d.x0,
      (d) => d.x1,
    );

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = this.animate === false || reducedMotion ? 0 : this.config.chart.transitionDuration;

    // Tween sources: last render's finals, falling back up the tree so new
    // subtrees grow out of their parent's previous position.
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

    type ArcSelection = d3.Selection<SVGPathElement, D3Node, SVGGElement, undefined>;
    const join = this.g
      .selectAll<SVGPathElement, D3Node>('path.pam-arc')
      .data(root.descendants(), (d) => d.data.pathKey);

    const enterPaths: ArcSelection = join
      .enter()
      .append('path')
      .attr('class', (d) => `pam-arc ${getNodeArcClass(d.data, rootNode)}`)
      .attr('d', (d) => {
        const start = starts.get(d.data.pathKey)!;
        return buildArc(
          () => start.x0,
          () => start.x1,
        )(d) ?? '';
      });

    if (duration === 0) {
      join.exit().remove();
    } else {
      (join.exit() as unknown as ArcSelection)
        .transition()
        .duration(duration)
        .style('opacity', 0)
        .remove();
    }

    const paths: ArcSelection = enterPaths.merge(join as unknown as ArcSelection);

    if (duration > 0) {
      paths
        .transition()
        .duration(duration)
        .attrTween('d', (d) => {
          const start = starts.get(d.data.pathKey)!;
          const ix0 = d3.interpolate(start.x0, d.x0);
          const ix1 = d3.interpolate(start.x1, d.x1);
          let a0 = start.x0;
          let a1 = start.x1;
          const arcAt = buildArc(
            () => a0,
            () => a1,
          );
          return (t: number) => {
            a0 = ix0(t);
            a1 = ix1(t);
            return arcAt(d) ?? '';
          };
        });
    } else {
      paths.attr('d', (d) => arcFinal(d) ?? '');
    }

    paths
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
      .style('stroke-linejoin', 'round')
      .style('fill', (d) => {
        if (!d.data.score) return null;
        return scoreFillStyle(d.data, getNodeColor(d.data, rootNode, colors), this.config.scoreEncoding.intensityFill);
      })
      .style('stroke-dasharray', (d) => scoreStrokeDash(d.data, this.config.scoreEncoding.confidenceDashedBelow))
      .style('cursor', this.options.zoomEnabled ? 'pointer' : 'default')
      .classed('pam-arc--highlighted', (d) => this.highlightId === d.data.id)
      .classed('pam-arc--dimmed', (d) => this.highlightId != null && this.highlightId !== d.data.id);

    const showHover = (event: InteractionEvent, d: D3Node) => {
      const lineage = new Set<string>();
      for (let p = d.parent; p; p = p.parent) lineage.add(p.data.id);

      paths
        .classed('pam-arc--dimmed', (n) => n.data.id !== d.data.id && !lineage.has(n.data.id))
        .classed('pam-arc--ancestor', (n) => lineage.has(n.data.id))
        .classed('pam-arc--highlighted', (n) => n.data.id === d.data.id)
        .style('filter', function (n) {
          // Glow belongs to the hovered arc only; ancestors stay clean.
          if (n.data.id !== d.data.id) return null;
          try {
            const nodeColor = getNodeColor(d.data, rootNode, colors);
            const shadowColor = d3.color(nodeColor);
            if (shadowColor) shadowColor.opacity = 0.28;
            return `brightness(${d.depth === 0 ? 1.02 : 1.06}) drop-shadow(0 2px 5px ${
              shadowColor?.formatRgb() ?? nodeColor
            })`;
          } catch {
            return null;
          }
        });
      this.options.onHover?.(d.data, event);
    };

    const clearHover = () => {
      paths
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

    if (this.options.arcLabels) {
      this.renderLabelLayer(root, bands, verticalGap, getPadAngle);
    }

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

  getSVGElement(): SVGSVGElement {
    return this.svg.node()!;
  }

  getConfig(): ResolvedChartConfig {
    return this.config;
  }

  /** Wheel/pinch viewport pan-zoom, scoped so double-click stays free for focus. */
  private initPanZoom(): void {
    const [minScale, maxScale] = this.config.ui.scaleExtent;
    this.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([minScale, maxScale])
      // Explicit extent: avoids d3-zoom's defaultExtent DOM probing (which
      // depends on viewBox/geometry quirks) and keeps panning bounds stable.
      .extent((): [[number, number], [number, number]] => [
        [0, 0],
        [Math.max(1, this.width), Math.max(1, this.height)],
      ])
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

  /** Animate the viewport back to identity. */
  resetView(): void {
    if (!this.zoomBehavior) return;
    this.svg
      .transition()
      .duration(this.config.chart.transitionDuration)
      .call(this.zoomBehavior.transform, d3.zoomIdentity);
  }

  /**
   * Opt-in on-arc titles. A label is drawn only when the arc's span and ring
   * thickness leave room; otherwise it fades out entirely (never squished).
   */
  private renderLabelLayer(
    root: D3Node,
    bands: number[],
    verticalGap: number,
    getPadAngle: (depth: number) => number,
  ): void {
    const fontSize = this.config.labels.fontSize;
    const minAngle = this.config.labels.minLabelAngle;
    const charWidth = fontSize * 0.56;

    const layer = this.g
      .append('g')
      .attr('class', 'pam-labels')
      .attr('pointer-events', 'none')
      .attr('aria-hidden', 'true');

    let seq = 0;
    for (const d of root.descendants()) {
      if (d.depth === 0) continue;
      const inner = bands[d.depth];
      const outer = bands[d.depth + 1];
      if (inner === undefined || outer === undefined || !(outer > inner)) continue;

      const span = d.x1 - d.x0 - getPadAngle(d.depth);
      const thickness = outer - inner - 2 * verticalGap;
      if (!(span >= minAngle) || !(thickness > fontSize * 1.25)) continue;

      const rMid = (inner + outer) / 2;
      const arcLength = span * rMid;
      const maxChars = Math.floor(arcLength / charWidth);
      if (!(maxChars >= 2)) continue;

      let title = d.data.title.trim();
      if (!title) continue;
      if (title.length > maxChars) {
        title = `${title.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
      }

      // Flip the guide path on the bottom half so glyphs stay upright.
      const mid = ((d.x0 + d.x1) / 2) % (2 * Math.PI);
      const flip = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
      const a0 = flip ? d.x1 : d.x0;
      const a1 = flip ? d.x0 : d.x1;
      const largeArc = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
      const pt = (angle: number): [number, number] => [
        rMid * Math.sin(angle),
        -rMid * Math.cos(angle),
      ];
      const [x0, y0] = pt(a0);
      const [x1, y1] = pt(a1);

      const pathId = `pam-lbl-${seq++}`;
      layer
        .append('path')
        .attr('id', pathId)
        .attr('d', `M ${x0} ${y0} A ${rMid} ${rMid} 0 ${largeArc} ${flip ? 0 : 1} ${x1} ${y1}`)
        .attr('fill', 'none');

      layer
        .append('text')
        .attr('font-size', String(fontSize))
        .append('textPath')
        .attr('href', `#${pathId}`)
        .attr('startOffset', '50%')
        .attr('text-anchor', 'middle')
        .text(title);
    }
  }

  private createLegend(labels: ArgumentMapLabels): HTMLElement {
    const legend = document.createElement('div');
    legend.className = 'pam-chart__legend';
    legend.setAttribute('role', 'list');
    legend.setAttribute('aria-label', labels.legend ?? 'Argument types');

    const items = [
      { type: 'center', label: labels.center },
      { type: 'support', label: labels.support },
      { type: 'attack', label: labels.attack },
    ] as const;

    for (const item of items) {
      const entry = document.createElement('span');
      entry.className = 'pam-chart__legend-item';
      entry.setAttribute('role', 'listitem');

      const swatch = document.createElement('span');
      swatch.className = `pam-chart__legend-swatch pam-chart__legend-swatch--${item.type}`;
      swatch.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.textContent = item.label;
      entry.append(swatch, text);
      legend.appendChild(entry);
    }

    return legend;
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
