import { createArgumentMap } from './index.js';

declare global {
  interface Window {
    PartoArgumentMap: {
      createArgumentMap: typeof createArgumentMap;
    };
  }
}

if (typeof window !== 'undefined') {
  window.PartoArgumentMap = { createArgumentMap };
}

export { createArgumentMap };
