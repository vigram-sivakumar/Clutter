import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), svgr()],

  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@design-system': path.resolve(__dirname, 'src/design-system'),
      '@styles': path.resolve(__dirname, 'src/design-system/styles'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@devtools': path.resolve(__dirname, 'devtools'),
    },
  },

  server: {
    // VITE_PORT lets the Tauri dev flow (dev:tauri, tauri.conf.json's
    // beforeDevCommand/devUrl) run its own Vite instance on a different
    // port than the plain web dev server (dev/dev:web, still 5173 by
    // default) — so a real Tauri/WKWebView window can run side-by-side
    // with an already-running web dev server instead of port-conflicting
    // with it.
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: true,
  },

  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
