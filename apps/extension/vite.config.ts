import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Side panel (HTML entry) + background service worker (ES module).
// The content script is built separately as a single IIFE (vite.content.config.ts):
// content scripts declared or registered by an extension cannot be ES modules.
export default defineConfig(({ mode }) => ({
  root: resolve(import.meta.dirname, 'src'),
  publicDir: resolve(import.meta.dirname, 'public'),
  base: '/',
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: mode === 'development',
    minify: mode !== 'development',
    target: 'chrome120',
    // one side panel bundle loaded from disk: size is not a network concern here
    chunkSizeWarningLimit: 1500,
    // no modulepreload polyfill: it touches `document`, which the service worker does not have
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, 'src/sidepanel/index.html'),
        background: resolve(import.meta.dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
