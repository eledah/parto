const INLINED_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linejoin',
  'opacity',
  'font-size',
  'font-weight',
  'letter-spacing',
  'paint-order',
  'dominant-baseline',
  'text-anchor',
] as const;

/**
 * Serializes the live chart SVG into a standalone, style-independent string:
 * computed presentation is inlined as attributes and a background rect is
 * inserted, so the file renders identically outside the page's CSS.
 */
export function serializeChartSVG(svg: SVGSVGElement, background: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svg.viewBox.baseVal;
  const width = vb.width || svg.clientWidth || 800;
  const height = vb.height || svg.clientHeight || 600;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', '0');
  bgRect.setAttribute('y', '0');
  bgRect.setAttribute('width', String(width));
  bgRect.setAttribute('height', String(height));
  bgRect.setAttribute('fill', background);
  clone.insertBefore(bgRect, clone.firstChild);

  const sourceElements = svg.querySelectorAll<SVGElement>('*');
  const cloneElements = clone.querySelectorAll<SVGElement>('*');
  // First clone element is the inserted bg rect; pairs offset by one.
  cloneElements.forEach((cloneEl, i) => {
    if (i === 0) return;
    const sourceEl = sourceElements[i - 1];
    if (!sourceEl) return;
    const computed = window.getComputedStyle(sourceEl);
    for (const prop of INLINED_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== 'none' && value !== '') {
        cloneEl.style.setProperty(prop, value);
      }
    }
    cloneEl.removeAttribute('tabindex');
    cloneEl.removeAttribute('aria-describedby');
    cloneEl.removeAttribute('role');
  });

  return new XMLSerializer().serializeToString(clone);
}

/** Rasterizes serialized SVG markup to a PNG blob at the given scale. */
export async function rasterizeToPng(
  markup: string,
  width: number,
  height: number,
  scale = 2,
): Promise<Blob> {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to rasterize chart SVG'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Canvas toBlob returned null'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function backgroundColorOf(container: HTMLElement): string {
  const surface = getComputedStyle(container).getPropertyValue('--pam-bg').trim();
  return surface || getComputedStyle(container).backgroundColor || '#ffffff';
}
