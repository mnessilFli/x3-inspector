import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Content script: one self-contained IIFE file, appended to dist/ after the main build.
export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    target: 'chrome120',
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'X3InspectorContent',
      fileName: () => 'content.js',
    },
  },
}));
