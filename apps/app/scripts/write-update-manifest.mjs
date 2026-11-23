#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetDirectory = resolve(appDirectory, process.env.CARGO_TARGET_DIR || 'src-tauri/target');
const bundleDirectory = join(targetDirectory, 'release', 'bundle', 'macos');
const packageJson = JSON.parse(await readFile(join(appDirectory, 'package.json'), 'utf8'));
const files = await readdir(bundleDirectory);
const archive = files.find((file) => file.endsWith('.app.tar.gz'));

if (!archive) {
  throw new Error(`No Tauri updater archive found in ${bundleDirectory}`);
}

const signaturePath = join(bundleDirectory, `${archive}.sig`);
const signature = (await readFile(signaturePath, 'utf8')).trim();
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

const releaseTag = process.env.UPDATE_RELEASE_TAG || `v${packageJson.version}`;
const releaseUrl = `https://github.com/vigram-sivakumar/Clutter/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(basename(archive))}`;
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
