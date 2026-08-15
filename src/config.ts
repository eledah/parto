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
  },
  spacing: {
    verticalGap: 0.01,
    padAngle: { inner: 0.025, outer: 0.012 },
    radiusExponent: { base: 1.2, perLevel: 0.2 },
    exponentDepthThreshold: 3,
  },
};

const CSS_COLOR_VARS: Record<string, string> = {
  center: '--pam-center',
  support: '--pam-support',
  attack: '--pam-attack',
  border: '--pam-border',
};

function isUsableCssColor(value: string): boolean {
  return Boolean(value && (value.startsWith('#') || value.startsWith('rgb')));
}

export function syncColorsFromCss(element: HTMLElement): void {
  const style = getComputedStyle(element);
  for (const [key, cssVar] of Object.entries(CSS_COLOR_VARS)) {
    const value = style.getPropertyValue(cssVar).trim();
    if (isUsableCssColor(value)) {
      chartConfig.colors[key as keyof typeof chartConfig.colors] = value;
    }
  }
}

export function applyColorOverrides(
  element: HTMLElement,
  colors: Partial<ArgumentMapColors>,
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
  syncColorsFromCss(element);
}
