import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/browser.mjs'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/app.js',
  sourcemap: true,
});
copyFileSync('index.html', 'dist/index.html');
copyFileSync('style.css', 'dist/style.css');
copyFileSync(
  'node_modules/prosemirror-view/style/prosemirror.css',
  'dist/prosemirror.css'
);
copyFileSync(
  'node_modules/prosemirror-tables/style/tables.css',
  'dist/tables.css'
);

await build({
  entryPoints: ['src/control.mjs'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/control.js',
});
copyFileSync('control.html', 'dist/control.html');

await build({
  entryPoints: ['src/origin-browser.mjs'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/origin.js',
});
copyFileSync('origin.html', 'dist/origin.html');

await build({
  entryPoints: ['joined/browser.mjs'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/joined.js',
});
