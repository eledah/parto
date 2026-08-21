import type { NodeContext } from '../types.js';

/**
 * Zoom-path <-> URL fragment helpers. Pure string utilities so hosts can wire
 * them into any router/hash strategy:
 *
 *   const ids = decodeZoomPath(new URLSearchParams(location.search).get('parto'));
 *   if (ids) chart.zoomToPath(ids);
 *   history.replaceState(null, '', `?parto=${encodeZoomPath(chart.getZoomPath())}`);
 */

export const ZOOM_PARAM = 'parto';

export function encodeZoomPath(path: NodeContext[]): string {
  return path.map((n) => encodeURIComponent(n.id)).join('/');
}

export function decodeZoomPath(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split('/')
    .filter(Boolean)
    .map((id) => decodeURIComponent(id));
}
