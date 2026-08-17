import {
  applyColorOverrides,
  chartConfig,
  DEFAULT_COLORS,
  DEFAULT_LABELS,
  syncColorsFromCss,
} from './config.js';
import { buildTree } from './core/buildTree.js';
import { validateMapData } from './core/validateMapData.js';
import { ZoomController } from './core/ZoomController.js';
import { SunburstRenderer } from './render/SunburstRenderer.js';
import { createDefaultTooltip, TooltipController } from './ui/TooltipController.js';
import { ChartStatusOverlay } from './ui/ChartStatus.js';
import { ValidationError } from './errors.js';
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
  private renderer: SunburstRenderer;
  private tooltip: TooltipController | null = null;
  private options: Required<
    Pick<
      ArgumentMapOptions,
      'theme' | 'legend' | 'zoom' | 'direction' | 'lang' | 'ariaLabel'
    >
  > & {
    tooltip: boolean | TooltipRenderer;
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
      legend: options.legend ?? true,
      zoom: options.zoom ?? true,
      direction,
      lang: options.lang ?? 'en',
      ariaLabel: options.ariaLabel ?? 'Argument map chart',
      tooltip: options.tooltip ?? true,
      labels: mergeLabels(options.labels),
      onNodeHover: options.onNodeHover,
      onNodeLeave: options.onNodeLeave,
      onNodeClick: options.onNodeClick,
      onZoomChange: options.onZoomChange,
      onWarning: options.onWarning,
    };

    if (options.colors) {
      applyColorOverrides(this.container, options.colors);
    }

    this.status = new ChartStatusOverlay(this.container, {
      loading: this.options.labels.statusLoading,
      empty: this.options.labels.statusEmpty,
      error: this.options.labels.statusError,
    });

    this.renderer = new SunburstRenderer(this.container, {
      ariaLabel: this.options.ariaLabel,
      legend: this.options.legend,
      labels: this.options.labels,
      zoomEnabled: this.options.zoom,
      onHover: (node, event) => this.handleHover(node, event),
      onLeave: () => this.handleLeave(),
      onClick: (node, depth, hasChildren) => this.handleClick(node, depth, hasChildren),
    });

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
    applyColorOverrides(this.container, {
      center: colors.center,
      support: colors.support,
      attack: colors.attack,
      border: colors.border,
    });
    syncColorsFromCss(this.container);
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

  destroy(): void {
    if (this.themeMedia && this.themeListener) {
      this.themeMedia.removeEventListener('change', this.themeListener);
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }
    this.tooltip?.destroy();
    this.status.destroy();
    this.renderer.destroy();
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
    this.options.onZoomChange?.(this.zoom.getZoomPath());
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
      chartConfig.colors.center = DEFAULT_COLORS.center;
      chartConfig.colors.support = DEFAULT_COLORS.support;
      chartConfig.colors.attack = DEFAULT_COLORS.attack;
      chartConfig.colors.border = DEFAULT_COLORS.border;
      syncColorsFromCss(this.container);
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
