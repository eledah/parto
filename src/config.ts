import type { ArgumentMapColors, ArgumentMapLabels } from './types.js';

export const DEFAULT_LABELS: ArgumentMapLabels = {
  center: 'Center',
  support: 'Agree',
  attack: 'Disagree',
  claim: 'Claim',
  unknownSpeaker: 'Unknown',
  intensity: 'Intensity',
  confidence: 'Confidence',
  statusLoading: 'Loading map…',
  statusEmpty: 'No map data yet.',
  statusError: 'Could not load this argument map.',
};

export const DEFAULT_COLORS: ArgumentMapColors = {
  center: '#f2c94c',
  support: '#2e9d61',
  attack: '#d64545',
  border: '#1a2328',
};

export interface ArgumentMapColorConfig {
  center: string;
  support: string;
  attack: string;
  border: string;
}

export const chartConfig = {
  colors: { ...DEFAULT_COLORS } as ArgumentMapColorConfig,
  chart: {
    maxCenterRadius: 0.4,
    radiusPadding: 5,
    minRadius: 10,
    cornerRadius: 3,
    strokeWidth: 0.5,
    /** Zoom/focus transition length in ms; 0 when prefers-reduced-motion. */
    transitionDuration: 450,
  },
  ui: {
    /** Hide breadcrumb/legend overlays below this container width (px). */
    minOverlayWidth: 320,
    /** Viewport scale limits for wheel/pinch pan-zoom. */
    scaleExtent: [0.5, 8] as [number, number],
  },
  spacing: {
    verticalGap: 0.01,
    padAngle: { inner: 0.025, outer: 0.012 },
    radiusExponent: { base: 1.2, perLevel: 0.2 },
    exponentDepthThreshold: 3,
    /** Angular span (radians) below which sibling subtrees collapse into "+N" wedges. */
    minAngle: 0.045,
  },
  limits: {
    /** Depth beyond which the chart auto-focuses into the heaviest branch on load. */
    autoFocusDepth: 4,
    /** Maximum hidden subtrees grouped per "+N" wedge. */
    wedgeChunkSize: 8,
    /** Minimum band thickness as a fraction of the chart radius. */
    ringMinThicknessFraction: 0.012,
  },
  labels: {
    /** Minimum angular span (radians) before an on-arc label is drawn. */
    minLabelAngle: 0.09,
    /** On-arc label font size in px (also drives fit checks and truncation). */
    fontSize: 11,
  },
  scoreEncoding: {
    /** Confidence below this renders a dashed border. */
    confidenceDashedBelow: 0.5,
    /** Fill saturation range mapped from intensity (percent mixed with surface). */
    intensityFill: { min: 45, max: 95 },
  },
  layout: {
    /** 0 = equal sibling angles, 1 = pure leaf weighting. */
    angleWeight: 1,
    /** Radial allocation strategy; 'exponent' is the legacy pow curve. */
    ringScale: 'sliver-proof' as 'sliver-proof' | 'exponent',
    /** Collapse narrow branches into "+N" wedges. */
    aggregation: true,
  },
};

export type ChartConfig = typeof chartConfig;

/**
 * Per-instance config snapshot. Charts resolve this once at construction so
 * two charts on one page never share mutable state (colors, spacing, ...).
 * The module-global `chartConfig` remains exported as the default source and
 * for backwards compatibility, but library internals no longer mutate it.
 */
export type ResolvedChartConfig = ChartConfig;

function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (typeof base !== 'object' || Array.isArray(base) || typeof override !== 'object' || Array.isArray(override)) {
    return override as T;
  }
  const out = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

/** Deep-clones the default config and applies user overrides. */
export function resolveConfig(overrides?: Record<string, unknown>): ResolvedChartConfig {
  const clone = JSON.parse(JSON.stringify(chartConfig)) as ChartConfig;
  if (!overrides) return clone;
  return deepMerge(clone, overrides);
}

const CSS_COLOR_VARS: Record<string, string> = {
  center: '--pam-center',
  support: '--pam-support',
  attack: '--pam-attack',
  border: '--pam-border',
};

function isUsableCssColor(value: string): boolean {
  return Boolean(value && (value.startsWith('#') || value.startsWith('rgb')));
}

/** Reads CSS custom properties into an instance's color table. */
export function syncColorsFromCssInto(element: HTMLElement, target: ArgumentMapColorConfig): void {
  const style = getComputedStyle(element);
  for (const [key, cssVar] of Object.entries(CSS_COLOR_VARS)) {
    const value = style.getPropertyValue(cssVar).trim();
    if (isUsableCssColor(value)) {
      target[key as keyof ArgumentMapColorConfig] = value;
    }
  }
}

/** @deprecated Mutates the global config; prefer per-instance resolution. */
export function syncColorsFromCss(element: HTMLElement): void {
  syncColorsFromCssInto(element, chartConfig.colors);
}

export function applyColorOverrides(
  element: HTMLElement,
  colors: Partial<ArgumentMapColors>,
): void {
  applyColorOverridesInto(element, colors, chartConfig.colors);
}

/** Instance-scoped variant: sets CSS vars then syncs into `target`. */
export function applyColorOverridesInto(
  element: HTMLElement,
  colors: Partial<ArgumentMapColors>,
  target: ArgumentMapColorConfig,
): void {
  const map: Record<string, string> = {
    center: '--pam-center',
    support: '--pam-support',
    attack: '--pam-attack',
    border: '--pam-border',
  };
  for (const [key, cssVar] of Object.entries(map)) {
    const value = colors[key as keyof ArgumentMapColors];
    if (value) element.style.setProperty(cssVar, value);
  }
  syncColorsFromCssInto(element, target);
}
