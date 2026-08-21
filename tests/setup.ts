class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

// jsdom parses the viewBox *attribute* but its `viewBox` IDL getter is
// unusable, crashing d3-zoom's defaultExtent (reads .baseVal) whenever a
// zoom transition starts. Provide a tolerant getter backed by the attribute.
if (typeof SVGSVGElement !== 'undefined') {
  const nativeDescriptor = Object.getOwnPropertyDescriptor(
    SVGSVGElement.prototype,
    'viewBox',
  );
  Object.defineProperty(SVGSVGElement.prototype, 'viewBox', {
    configurable: true,
    get(this: SVGSVGElement) {
      try {
        const native = nativeDescriptor?.get?.call(this);
        // jsdom returns a hollow SVGAnimatedRect (baseVal undefined) — only
        // trust the native getter when it actually carries geometry.
        if (native && native.baseVal) return native;
      } catch {
        /* fall through to attribute-backed shim */
      }
      const parts = (this.getAttribute('viewBox') ?? '')
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      const baseVal = {
        x: parts[0] ?? 0,
        y: parts[1] ?? 0,
        width: parts[2] ?? 0,
        height: parts[3] ?? 0,
      };
      return { baseVal, animVal: baseVal };
    },
  });
}

if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as typeof PointerEvent;
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
});
