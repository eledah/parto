import { createArgumentMap } from './index.js';

declare global {
  interface Window {
    Parto: {
      createArgumentMap: typeof createArgumentMap;
    };
  }
}

if (typeof window !== 'undefined') {
  window.Parto = { createArgumentMap };
}

export { createArgumentMap };
