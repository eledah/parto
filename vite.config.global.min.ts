import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(rootDir, 'src/global.ts'),
      formats: ['iife'],
      name: 'PartoArgumentMap',
      fileName: () => 'parto-argument-map.global.min.js',
    },
    minify: 'esbuild',
  },
});
