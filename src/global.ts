import { createArgumentMap, decodeZoomPath, encodeZoomPath, ZOOM_PARAM } from './index.js';

declare global {
  interface Window {
    Parto: {
      createArgumentMap: typeof createArgumentMap;
      encodeZoomPath: typeof encodeZoomPath;
      decodeZoomPath: typeof decodeZoomPath;
      ZOOM_PARAM: typeof ZOOM_PARAM;
    };
  }
}

if (typeof window !== 'undefined') {
  window.Parto = { createArgumentMap, encodeZoomPath, decodeZoomPath, ZOOM_PARAM };
}

export { createArgumentMap };
