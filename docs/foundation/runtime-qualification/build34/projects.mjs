import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  lstatSync,
  readlinkSync,
} from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function tree(root) {
  const files = {};
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name),
        s = lstatSync(path),
        key = relative(root, path);
      if (s.isSymbolicLink()) files[key] = 'link:' + readlinkSync(path);
      else if (s.isDirectory()) walk(path);
      else if (s.isFile()) files[key] = sha(readFileSync(path));
    }
  }
  walk(root);
  return { sha256: sha(JSON.stringify(files)), files };
}
export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
export function tauriProject(root, pins, source) {
  mkdirSync(join(root, 'src-tauri/src'), { recursive: true });
  mkdirSync(join(root, 'src-tauri/CoreData'));
  mkdirSync(join(root, 'frontend'));
  writeJson(join(root, 'package.json'), {
    name: 'clutter-h01-tauri-build',
    version: '0.0.0',
    private: true,
    dependencies: { '@tauri-apps/cli': pins.tauriNpmCli },
  });
  writeFileSync(
    join(root, 'frontend/index.html'),
    '<!doctype html><title>H01 bootstrap placeholder</title>'
  );
  writeFileSync(
    join(root, 'src-tauri/CoreData/placeholder.txt'),
    'Final common CoreData copied only after native packaging.\n'
  );
  writeFileSync(
    join(root, 'src-tauri/Cargo.toml'),
    `[package]\nname = "clutter-h01-tauri"\nversion = "0.0.0"\nedition = "2021"\nrust-version = "1.90"\n[workspace]\nresolver = "3"\n[build-dependencies]\ntauri-build = "=${pins.tauriBuildCrate}"\n[dependencies]\ntauri = "=${pins.tauriCrate}"\nserde_json = "=1.0.145"\n`
  );
  writeFileSync(
    join(root, 'src-tauri/build.rs'),
    'fn main(){ tauri_build::build(); }\n'
  );
  copyFileSync(join(source, 'main.rs'), join(root, 'src-tauri/src/main.rs'));
  writeJson(join(root, 'src-tauri/tauri.conf.json'), {
    productName: 'Clutter H-T',
    version: '0.0.0',
    identifier: 'com.clutter.h01.ht',
    build: { frontendDist: '../frontend' },
    app: {
      windows: [],
      withGlobalTauri: false,
      security: { capabilities: [] },
    },
    bundle: {
      active: true,
      targets: ['app'],
      resources: ['CoreData'],
      macOS: { minimumSystemVersion: '14.0', signingIdentity: '-' },
    },
  });
}
export function checksumEntry(text, name) {
  const rows = text
    .split(/\r?\n/)
    .map((s) => s.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/))
    .filter((m) => m && m[2] === name);
  if (rows.length !== 1) throw Error('EXACT_RELEASE_CHECKSUM_REQUIRED');
  return rows[0][1].toLowerCase();
}
export function safeArchiveNames(text) {
  for (const name of text.trim().split('\n'))
    if (
      name.startsWith('/') ||
      name.split('/').includes('..') ||
      name.includes('\\')
    )
      throw Error('UNSAFE_ARCHIVE_ENTRY');
}

export function graphSourceHashes(graph, cwd) {
  const result = {};
  for (const name of [
    ...new Set([...graph.nodeInputs, ...graph.browserInputs]),
  ].sort())
    result[name] = name.startsWith('(disabled):')
      ? 'esbuild-disabled-module'
      : sha(readFileSync(resolve(cwd, name)));
  return result;
}
