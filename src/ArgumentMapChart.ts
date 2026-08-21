import {
  applyColorOverridesInto,
  DEFAULT_COLORS,
  DEFAULT_LABELS,
  resolveConfig,
  syncColorsFromCssInto,
} from './config.js';
import type { ResolvedChartConfig } from './config.js';
import { buildTree } from './core/buildTree.js';
import { validateMapData } from './core/validateMapData.js';
import { ZoomController } from './core/ZoomController.js';
import { createRenderer, type MapRenderer } from './render/index.js';
import { createDefaultTooltip, TooltipController } from './ui/TooltipController.js';
import { ChartStatusOverlay } from './ui/ChartStatus.js';
import { BreadcrumbBar } from './ui/BreadcrumbBar.js';
import { LegendChips } from './ui/LegendChips.js';
import { ZoomControls } from './ui/ZoomControls.js';
import { ValidationError } from './errors.js';
import { backgroundColorOf, rasterizeToPng, serializeChartSVG } from './core/exportImage.js';
import type {
  ArgumentMapChart,
  ArgumentMapColors,
  ArgumentMapData,
  ArgumentMapLabels,
  ArgumentMapOptions,
  NodeContext,
  ThemeMode,
  TooltipRenderer,
  TreeNode,
} from './types.js';

function resolveContainer(target: string | HTMLElement): HTMLElement {
  if (typeof target === 'string') {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) throw new Error(`Container not found: ${target}`);
    return el;
  }
  return target;
}

function mergeLabels(partial?: Partial<ArgumentMapLabels>): ArgumentMapLabels {
  return { ...DEFAULT_LABELS, ...partial };
}

class ArgumentMapChartImpl implements ArgumentMapChart {
  private container: HTMLElement;
  private zoom = new ZoomController();
  private config: ResolvedChartConfig;
  private renderer: MapRenderer;
  private tooltip: TooltipController | null = null;
  private options: Required<
    Pick<ArgumentMapOptions, 'theme' | 'zoom' | 'direction' | 'lang' | 'ariaLabel'>
  > & {
    tooltip: boolean | TooltipRenderer;
    arcLabels: boolean;
    breadcrumb: boolean;
    legend: boolean;
    layoutMode: 'sunburst' | 'icicle';
    labels: ArgumentMapLabels;
    onNodeHover?: ArgumentMapOptions['onNodeHover'];
    onNodeLeave?: ArgumentMapOptions['onNodeLeave'];
    onNodeClick?: ArgumentMapOptions['onNodeClick'];
    onZoomChange?: ArgumentMapOptions['onZoomChange'];
    onWarning?: ArgumentMapOptions['onWarning'];
  };
  private themeMedia: MediaQueryList | null = null;
  private themeListener: ((e: MediaQueryListEvent) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private status: ChartStatusOverlay;
  private breadcrumbs: BreadcrumbBar | null = null;
  private controls: ZoomControls | null = null;
  private legend: LegendChips | null = null;
  private overlayObserver: ResizeObserver | null = null;

  constructor(
    target: string | HTMLElement,
    data?: ArgumentMapData | null,
    options: ArgumentMapOptions = {},
  ) {
    this.container = resolveContainer(target);
    this.container.classList.add('pam-chart');

    const direction = options.direction ?? 'inherit';
    if (direction !== 'inherit') {
      this.container.setAttribute('dir', direction);
    }
    if (options.lang) {
      this.container.setAttribute('lang', options.lang);
    }

    this.options = {
      theme: options.theme ?? 'auto',
      zoom: options.zoom ?? true,
      direction,
      lang: options.lang ?? 'en',
      ariaLabel: options.ariaLabel ?? 'Argument map chart',
      tooltip: options.tooltip ?? true,
      arcLabels: options.arcLabels ?? false,
      breadcrumb: options.breadcrumb ?? true,
      legend: options.legend ?? true,
      layoutMode: options.layoutMode ?? 'sunburst',
      labels: mergeLabels(options.labels),
      onNodeHover: options.onNodeHover,
      onNodeLeave: options.onNodeLeave,
      onNodeClick: options.onNodeClick,
      onZoomChange: options.onZoomChange,
      onWarning: options.onWarning,
    };

    this.config = resolveConfig({
      limits: { autoFocusDepth: options.layout?.maxVisibleDepth },
      spacing: { minAngle: options.layout?.minAngle },
      layout: {
        angleWeight: options.layout?.angleWeight,
        ringScale: options.layout?.ringScale,
        aggregation: options.layout?.aggregation,
      },
    });

    if (options.colors) {
      applyColorOverridesInto(this.container, options.colors, this.config.colors);
    }

    this.status = new ChartStatusOverlay(this.container, {
      loading: this.options.labels.statusLoading,
      empty: this.options.labels.statusEmpty,
      error: this.options.labels.statusError,
    });

    this.renderer = createRenderer(this.container, {
      ariaLabel: this.options.ariaLabel,
      zoomEnabled: this.options.zoom,
      arcLabels: this.options.arcLabels,
      onHover: (node, event) => this.handleHover(node, event),
      onLeave: () => this.handleLeave(),
      onClick: (node, depth, hasChildren) => this.handleClick(node, depth, hasChildren),
    }, this.config, this.options.layoutMode);

    if (this.options.tooltip !== false) {
      const renderer =
        typeof this.options.tooltip === 'function'
          ? this.options.tooltip
          : createDefaultTooltip;
      this.tooltip = new TooltipController(
        document.body,
        this.renderer.getTooltipElementId(),
        renderer,
        this.options.labels,
      );
    }

    this.createOverlays();
    this.applyTheme(this.options.theme);
    this.bindKeyboard();

    if (data) {
      this.setData(data);
    } else {
      this.status.show('empty');
    }
  }

  setData(data: ArgumentMapData): void {
    try {
      const { data: validated, warnings } = validateMapData(data);
      for (const w of warnings) this.options.onWarning?.(w);

      const { tree, warnings: treeWarnings } = buildTree(validated.new_nodes);
      for (const w of treeWarnings) this.options.onWarning?.(w);

      if (!tree) {
        this.options.onWarning?.('Could not build tree from map data');
        this.status.show('error', this.options.labels.statusError);
        return;
      }

      this.status.hide();
      this.zoom.setTree(tree);
      this.zoom.autoFocusDeep(this.config.limits.autoFocusDepth);
      this.render();
      this.emitZoomChange();
    } catch (err) {
      const message =
        err instanceof ValidationError
          ? err.issues.join('; ')
          : err instanceof Error
            ? err.message
            : this.options.labels.statusError;
      this.options.onWarning?.(message);
      this.status.show('error', message);
    }
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.status.show('loading');
      this.tooltip?.hide();
    } else if (this.status.getState() === 'loading') {
      this.status.hide();
    }
  }

  showError(message?: string): void {
    this.options.onWarning?.(message ?? this.options.labels.statusError);
    this.status.show('error', message);
    this.tooltip?.hide();
  }

  setTheme(theme: ThemeMode): void {
    this.options.theme = theme;
    this.applyTheme(theme);
  }

  setColors(colors: Partial<ArgumentMapColors>): void {
    applyColorOverridesInto(this.container, colors, this.config.colors);
    const focus = this.zoom.getFocusRoot();
    if (focus) this.renderer.render(focus);
  }

  highlight(nodeId: string | null): void {
    this.renderer.setHighlight(nodeId);
  }

  zoomTo(nodeId: string): void {
    if (this.zoom.zoomTo(nodeId)) {
      this.render();
      this.emitZoomChange();
    }
  }

  zoomToPath(nodeIds: string[]): void {
    if (this.zoom.zoomToPath(nodeIds)) {
      this.render();
      this.emitZoomChange();
    }
  }

  zoomOut(): void {
    if (this.zoom.zoomOut()) {
      this.render();
      this.emitZoomChange();
    }
  }

  resetZoom(): void {
    this.zoom.resetZoom();
    this.render();
    this.emitZoomChange();
  }

  resize(): void {
    this.renderer.resize();
  }

  getZoomPath(): NodeContext[] {
    return this.zoom.getZoomPath();
  }

  getConfig(): ResolvedChartConfig {
    return this.config;
  }

  toSVG(): string {
    return serializeChartSVG(this.renderer.getSVGElement(), backgroundColorOf(this.container));
  }

  async toPNG(scale = 2): Promise<Blob> {
    const svgEl = this.renderer.getSVGElement();
    const vb = svgEl.viewBox.baseVal;
    const width = vb.width || svgEl.clientWidth || 800;
    const height = vb.height || svgEl.clientHeight || 600;
    return rasterizeToPng(this.toSVG(), width, height, scale);
  }

  destroy(): void {
    if (this.themeMedia && this.themeListener) {
      this.themeMedia.removeEventListener('change', this.themeListener);
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }
    if (this.overlayObserver) {
      this.overlayObserver.disconnect();
      this.overlayObserver = null;
    }
    this.tooltip?.destroy();
    this.status.destroy();
    this.renderer.destroy();
    this.breadcrumbs?.destroy();
    this.controls?.destroy();
    this.legend?.destroy();
    this.container.classList.remove('pam-chart', 'pam-chart--light', 'pam-chart--dark');
    if (this.options.direction !== 'inherit') {
      this.container.removeAttribute('dir');
    }
  }

  private render(): void {
    const focus = this.zoom.getFocusRoot();
    if (focus) this.renderer.render(focus);
  }

  private emitZoomChange(): void {
    const path = this.zoom.getZoomPath();
    this.breadcrumbs?.update(path);
    this.controls?.setCanZoomOut(this.zoom.canZoomOut());
    this.options.onZoomChange?.(path);
  }

  private createOverlays(): void {
    if (this.options.breadcrumb && this.options.zoom) {
      this.breadcrumbs = new BreadcrumbBar(this.container, {
        onNavigate: (path) => this.zoomToPath(path.map((n) => n.id)),
      });
    }
    if (this.options.zoom) {
      this.controls = new ZoomControls(
        this.container,
        {
          zoomIn: () => {
            if (this.zoom.zoomIntoHeaviest()) {
              this.render();
              this.emitZoomChange();
            }
          },
          zoomOut: () => this.zoomOut(),
          reset: () => {
            this.resetZoom();
            this.renderer.resetView();
          },
        },
        this.options.labels,
      );
    }
    if (this.options.legend) {
      this.legend = new LegendChips(this.container, { labels: this.options.labels });
    }

    if (this.breadcrumbs || this.controls || this.legend) {
      this.overlayObserver = new ResizeObserver(() => this.syncOverlayVisibility());
      this.overlayObserver.observe(this.container);
      this.syncOverlayVisibility();
    }
  }

  private syncOverlayVisibility(): void {
    const wideEnough = this.container.clientWidth >= this.config.ui.minOverlayWidth;
    this.breadcrumbs?.setVisible(wideEnough);
    this.controls?.setVisible(wideEnough);
    this.legend?.setVisible(wideEnough);
  }

  private handleHover(node: TreeNode, event: MouseEvent | FocusEvent | PointerEvent): void {
    this.tooltip?.show(node, event);
    this.options.onNodeHover?.(node, event);
  }

  private handleLeave(): void {
    this.tooltip?.hide();
    this.options.onNodeLeave?.();
  }

  private handleClick(node: TreeNode, depth: number, hasChildren: boolean): void {
    if (this.options.zoom) {
      this.zoom.handleClick(node, depth, hasChildren);
      this.render();
      this.emitZoomChange();
    }
    this.options.onNodeClick?.(node, depth, hasChildren);
  }

  private applyTheme(theme: ThemeMode): void {
    this.container.classList.remove('pam-chart--light', 'pam-chart--dark');

    const setResolved = (resolved: 'light' | 'dark') => {
      this.container.classList.add(resolved === 'light' ? 'pam-chart--light' : 'pam-chart--dark');
      Object.assign(this.config.colors, DEFAULT_COLORS);
      syncColorsFromCssInto(this.container, this.config.colors);
      const focus = this.zoom.getFocusRoot();
      if (focus) this.renderer.render(focus);
    };

    if (this.themeMedia && this.themeListener) {
      this.themeMedia.removeEventListener('change', this.themeListener);
      this.themeMedia = null;
      this.themeListener = null;
    }

    if (theme === 'light' || theme === 'dark') {
      setResolved(theme);
      return;
    }

    this.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    setResolved(this.themeMedia.matches ? 'dark' : 'light');
    this.themeListener = (e) => setResolved(e.matches ? 'dark' : 'light');
    this.themeMedia.addEventListener('change', this.themeListener);
  }

  private bindKeyboard(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      if (!this.options.zoom) return;
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (this.zoom.zoomOut()) {
          e.preventDefault();
          this.render();
          this.emitZoomChange();
        }
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }
}

export function createArgumentMap(
  target: string | HTMLElement,
  data?: ArgumentMapData | null,
  options?: ArgumentMapOptions,
): ArgumentMapChart {
  return new ArgumentMapChartImpl(target, data, options);
}
