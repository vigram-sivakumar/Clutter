import { build } from 'esbuild';
import {
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hash,
  privateJSON,
} from '../../packages/desktop-runtime/src/host/session.mjs';
const source = dirname(fileURLToPath(import.meta.url));
export async function pack(resources, nodePath) {
  for (const name of ['web', 'runtime', 'bin'])
    mkdirSync(join(resources, name), { recursive: true });
  copyFileSync(nodePath, join(resources, 'runtime/node'));
  chmodSync(join(resources, 'runtime/node'), 0o755);
  const browser = await build({
    absWorkingDir: resolve(source, '../..'),
    entryPoints: [join(source, 'web/main.mjs')],
    outfile: join(resources, 'web/app.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'safari17',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    metafile: true,
  });
  const browserInputs = Object.keys(browser.metafile.inputs);
  if (
    browserInputs.some((p) =>
      /docs\/foundation|sqlite|node:|host\/|editor\/(?:src\/)?(backend|engine|page-codec|page-model|qualified-replica)\.mjs/.test(
        p
      )
    )
  )
    throw Error('INVALID_BROWSER_GRAPH');
  const nodeInputs = [];
  for (const name of ['owner', 'launcher']) {
    const result = await build({
      absWorkingDir: resolve(source, '../..'),
      entryPoints: [
        resolve(
          source,
          '../../packages/desktop-runtime/src/host',
          name + '.mjs'
        ),
      ],
      outfile: join(resources, name + '.mjs'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node24',
      metafile: true,
    });
    nodeInputs.push(...Object.keys(result.metafile.inputs));
  }
  if (nodeInputs.some((p) => /docs\/foundation|apps\/app\//.test(p)))
    throw Error('INVALID_NODE_GRAPH');
  copyFileSync(
    join(source, 'web/index.html'),
    join(resources, 'web/index.html')
  );
  copyFileSync(
    resolve(source, '../../packages/ui/src/style.css'),
    join(resources, 'web/style.css')
  );
  writeFileSync(
    join(resources, 'bin/clutter'),
    '#!/bin/sh\nclutter_bin="${0%/*}"\nclutter_bin="$(CDPATH= cd "$clutter_bin" && pwd)"\nexec "$clutter_bin/../runtime/node" "$clutter_bin/../launcher.mjs" "$@"\n',
    { mode: 0o755 }
  );
  return {
    browserInputs,
    nodeInputs,
    browserBytes: readFileSync(join(resources, 'web/app.js')).length,
  };
}
export function manifest(resources) {
  const files = Object.fromEntries(
    [
      'runtime/node',
      'owner.mjs',
      'launcher.mjs',
      'bin/clutter',
      'web/app.js',
      'web/style.css',
      'web/index.html',
    ].map((name) => [name, hash(readFileSync(join(resources, name)))])
  );
  privateJSON(join(resources, 'bundle.json'), {
    format: 'clutter-structured-desktop53',
    files,
  });
}
