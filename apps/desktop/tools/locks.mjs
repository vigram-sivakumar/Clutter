import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const nativeLockSource = fileURLToPath(
  new URL('./native-locks/', import.meta.url)
);
// Source-controlled manifests and full transitive locks. No previous build needed.
export function prepareLockedTools(project, source = nativeLockSource) {
  const provenance = JSON.parse(readFileSync(join(source, 'provenance.json')));
  if (provenance.format !== 'clutter-native-lock-export51')
    throw Error('DEPENDENCY_PROVENANCE_FORMAT');
  const names = [
    'native-tools.package.json',
    'native-tools.package-lock.json',
    'Cargo.toml',
    'Cargo.lock',
  ];
  const files = Object.fromEntries(
    names.map((name) => [name, readFileSync(join(source, name))])
  );
  for (const name of names) {
    if (sha(files[name]) !== provenance.files?.[name])
      throw Error('DEPENDENCY_LOCK_INTEGRITY: ' + name);
  }
  const pkg = JSON.parse(files['native-tools.package.json']);
  const npm = JSON.parse(files['native-tools.package-lock.json']);
  if (
    pkg.dependencies?.['@tauri-apps/cli'] !== '2.12.4' ||
    npm.packages?.['']?.dependencies?.['@tauri-apps/cli'] !== '2.12.4' ||
    npm.packages?.['node_modules/@tauri-apps/cli']?.version !== '2.12.4'
  )
    throw Error('TAURI_CLI_PIN_CHANGED');
  const toml = files['Cargo.toml'].toString('utf8');
  for (const [name, version] of [
    ['tauri', '2.12.5'],
    ['tauri-build', '2.7.4'],
    ['serde_json', '1.0.145'],
  ]) {
    const line = toml.split('\n').find((s) => s.startsWith(name + ' = '));
    if (!line?.includes('"=' + version + '"'))
      throw Error('TAURI_CRATE_PIN_CHANGED');
  }
  // Verify everything before creating or modifying the generated project.
  mkdirSync(join(project, 'src-tauri'), { recursive: true });
  for (const [name, output] of [
    ['native-tools.package.json', 'package.json'],
    ['native-tools.package-lock.json', 'package-lock.json'],
    ['Cargo.toml', 'src-tauri/Cargo.toml'],
    ['Cargo.lock', 'src-tauri/Cargo.lock'],
  ])
    writeFileSync(join(project, output), files[name]);
  return {
    source: 'checked-in-native-locks',
    sourceBuild: provenance.sourceBuild,
    files: Object.fromEntries(names.map((name) => [name, sha(files[name])])),
    npmSha256: sha(files['native-tools.package-lock.json']),
    cargoSha256: sha(files['Cargo.lock']),
    change:
      'Exact exported manifest/lock bytes; no dependency resolution or root renaming',
  };
}
