import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// The packages whose grammar the page analyzer depends on. Their resolved
// versions become part of the parsed-note cache fingerprint (ADR-053), so a
// dependency upgrade invalidates cached parse results. This detects version
// changes only, not a modified package at an unchanged version.
const PARSE_DEPENDENCIES = [
  '@lezer/markdown',
  '@lezer/common',
  '@lezer/highlight',
  '@codemirror/language',
  '@codemirror/state',
];

function resolvedPackageVersion(name: string): string {
  const require = createRequire(import.meta.url);
  let directory = path.dirname(require.resolve(name));
  for (;;) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (parsed.name === name) return String(parsed.version);
    }
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error(`Cannot find package.json for ${name}`);
    directory = parent;
  }
}

const parseDependencyVersions = Object.fromEntries(
  PARSE_DEPENDENCIES.map((name) => [name, resolvedPackageVersion(name)])
);

export default defineConfig({
  plugins: [react(), svgr()],

  define: {
    __PARSE_DEPENDENCY_VERSIONS__: JSON.stringify(parseDependencyVersions),
  },

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
