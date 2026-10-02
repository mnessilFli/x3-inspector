import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Page hook: runs in the page world (manifest "world": "MAIN"), one self-contained IIFE file.
export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    sourcemap: false,
    minify: mode !== 'development',
    target: 'chrome120',
    lib: {
      entry: resolve(import.meta.dirname, 'src/hook/index.ts'),
      formats: ['iife'],
      name: 'X3InspectorHook',
      fileName: () => 'page-hook.js',
    },
  },
}));
