import { build } from '../../experiments/r07-two-view/node_modules/esbuild/lib/main.js';
import {
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../../../../packages/foundation-runtime/src/adapters/media-formats.mjs';
const source = dirname(fileURLToPath(import.meta.url));
export async function pack(resources, nodePath) {
  mkdirSync(join(resources, 'web'), { recursive: true });
  mkdirSync(join(resources, 'runtime'), { recursive: true });
  mkdirSync(join(resources, 'bin'), { recursive: true });
  copyFileSync(nodePath, join(resources, 'runtime/node'));
  chmodSync(join(resources, 'runtime/node'), 0o755);
  const browser = await build({
    entryPoints: [join(source, 'browser.mjs')],
    outfile: join(resources, 'web/app.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'safari17',
    metafile: true,
  });
  if (
    Object.keys(browser.metafile.inputs).some((n) =>
      /sqlite|media-files|media-formats|qualified-engine|editor\/(backend|engine|page-codec|page-model|qualified-replica)\.mjs|durable\/model|entities\/model/.test(
        n
      )
    )
  )
    throw Error('NODE_CODE_IN_BROWSER');
  const nodeInputs = [];
  for (const name of ['owner', 'launcher']) {
    const result = await build({
      entryPoints: [join(source, name + '.mjs')],
      outfile: join(resources, name + '.mjs'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node24',
      metafile: true,
    });
    nodeInputs.push(...Object.keys(result.metafile.inputs));
  }
  if (nodeInputs.some((n) => /durable\/store|joined-native\/model/.test(n)))
    throw Error('OLD_STORE_IN_NEW_CORE');
  copyFileSync(
    join(source, '../native-contract.json'),
    join(resources, 'native-contract.json')
  );
  for (const name of ['index.html', 'style.css'])
    copyFileSync(join(source, name), join(resources, 'web', name));
  const fixture = join(source, '../../experiments/r07-two-view/media/fixtures');
  copyFileSync(join(fixture, 'tiny.png'), join(resources, 'sample.png'));
  copyFileSync(join(fixture, 'tiny.pdf'), join(resources, 'sample.pdf'));
  copyFileSync(
    join(source, 'fixtures/cover-blue.png'),
    join(resources, 'sample-alt.png')
  );
  writeFileSync(
    join(resources, 'bin/clutter-core28'),
    '#!/bin/sh\nclutter_bin="${0%/*}"\nclutter_bin="$(CDPATH= cd "$clutter_bin" && pwd)"\nexec "$clutter_bin/../runtime/node" "$clutter_bin/../launcher.mjs" "$@"\n',
    { mode: 0o755 }
  );
  return {
    nodeInputs,
    browserInputs: Object.keys(browser.metafile.inputs),
    browserBytes: readFileSync(join(resources, 'web/app.js')).length,
  };
}
export function manifest(resources, extra = {}) {
  const files = Object.fromEntries(
    [
      'runtime/node',
      'bin/clutter-core28',
      'owner.mjs',
      'launcher.mjs',
      'web/app.js',
      'web/index.html',
      'web/style.css',
      'native-contract.json',
      'sample.png',
      'sample.pdf',
      'sample-alt.png',
    ].map((n) => [n, hash(readFileSync(join(resources, n)))])
  );
  writeFileSync(
    join(resources, 'bundle.json'),
    JSON.stringify(
      { format: 'clutter-native-core28', files, ...extra },
      null,
      2
    ) + '\n'
  );
}
