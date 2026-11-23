#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetDirectory = resolve(appDirectory, process.env.CARGO_TARGET_DIR || 'src-tauri/target');
const bundleDirectory = join(targetDirectory, 'release', 'bundle', 'macos');
const dmgDirectory = join(targetDirectory, 'release', 'bundle', 'dmg');
const packageJson = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'));
const files = await readdir(bundleDirectory);
const archives = files.filter((file) => file.endsWith('.app.tar.gz'));

if (archives.length !== 1) {
  throw new Error(`Expected exactly one Tauri updater archive in ${bundleDirectory}; found ${archives.length}`);
}

const archive = archives[0];
const signaturePath = join(bundleDirectory, `${archive}.sig`);
let signature;
try {
  signature = (await readFile(signaturePath, 'utf8')).trim();
} catch {
  throw new Error(`Missing updater signature: ${signaturePath}`);
}

if (!signature) {
  throw new Error(`Updater signature is empty: ${signaturePath}`);
}

const dmgFiles = (await readdir(dmgDirectory)).filter((file) => file.endsWith('.dmg'));
if (dmgFiles.length !== 1) {
  throw new Error(`Expected exactly one DMG in ${dmgDirectory}; found ${dmgFiles.length}`);
}

const rustInfo = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
const targetTriple =
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  rustInfo.match(/^host: (.+)$/m)?.[1] ||
  '';

const platform = targetTriple.includes('aarch64')
  ? 'darwin-aarch64'
  : targetTriple.includes('x86_64')
    ? 'darwin-x86_64'
    : null;

if (!platform) {
  throw new Error(`Unsupported macOS updater target: ${targetTriple}`);
}

const releaseUrl = `https://clutter-updates.vigram-sivakumar.workers.dev/releases/${encodeURIComponent(basename(archive))}`;
const manifest = {
  version: packageJson.version,
  notes: process.env.UPDATE_RELEASE_NOTES || '',
  pub_date: new Date().toISOString(),
  platforms: {
    [platform]: {
      signature,
      url: releaseUrl,
    },
  },
};

const manifestPath = join(bundleDirectory, 'latest.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`Updater manifest: ${manifestPath}\n`);
