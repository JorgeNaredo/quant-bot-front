export const CHART_TOOLTIP_BG = '#182033';
export const CHART_TOOLTIP_BORDER = '#263145';
export const CHART_TOOLTIP_TEXT = '#e8edf5';
export const CHART_TOOLTIP_MUTED = '#94a3b8';
export const CHART_GRID = 'rgba(38, 49, 69, 0.55)';

export function chartToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
