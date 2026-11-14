import { build } from 'esbuild';
import {
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { sha } from './private-session.mjs';
export async function packResources(resources, nodePath) {
  resources = resolve(resources);
  mkdirSync(join(resources, 'runtime'), { recursive: true });
  mkdirSync(join(resources, 'web'), { recursive: true });
  mkdirSync(join(resources, 'bin'), { recursive: true });
  writeFileSync(join(resources, 'bin/clutter-lab'), wrapper, { mode: 0o755 });
  copyFileSync(nodePath, join(resources, 'runtime/node'));
  chmodSync(join(resources, 'runtime/node'), 0o755);
  for (const [entry, out] of [
    ['owner-entry', 'owner'],
    ['service', 'service'],
    ['launcher', 'launcher'],
  ]) {
    const r = await build({
      entryPoints: ['joined-native/' + entry + '.mjs'],
      outfile: join(resources, out + '.mjs'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node24',
      metafile: true,
    });
    if (
      out === 'launcher' &&
      Object.keys(r.metafile.inputs).some((n) => n.endsWith('/store.mjs'))
    )
      throw Error('CLIENT_MUST_NOT_BUNDLE_SQLITE_STORE');
  }
  for (const [source, name] of [
    ['origin.html', 'origin.html'],
    ['dist/joined-native.js', 'origin.js'],
    ['style.css', 'style.css'],
    ['dist/tables.css', 'tables.css'],
    ['dist/prosemirror.css', 'prosemirror.css'],
  ])
    copyFileSync(source, join(resources, 'web', name));
}
export function finishManifest(resources, extra = {}) {
  const names = [
    'runtime/node',
    'bin/clutter-lab',
    'owner.mjs',
    'service.mjs',
    'launcher.mjs',
    'web/origin.js',
    'web/origin.html',
    'web/style.css',
    'web/tables.css',
    'web/prosemirror.css',
  ];
  const files = Object.fromEntries(
    names.map((n) => [n, sha(readFileSync(join(resources, n)))])
  );
  writeFileSync(
    join(resources, 'bundle.json'),
    JSON.stringify(
      { format: 'clutter-joined-native-bundle-v1', files, ...extra },
      null,
      2
    ) + '\n'
  );
  return files;
}
export const wrapper =
  '#!/bin/sh\nclutter_bin_dir="${0%/*}"\nclutter_bin_dir="$(CDPATH= cd "$clutter_bin_dir" && pwd)"\nexec "$clutter_bin_dir/../runtime/node" "$clutter_bin_dir/../launcher.mjs" "$@"\n';
