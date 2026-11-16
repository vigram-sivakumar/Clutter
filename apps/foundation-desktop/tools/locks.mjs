import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
// Reuse verified dependency graph bytes from the user's completed controlled build,
// never its UI/Core binary, data or mutable source. The old build stays read-only.
export function prepareLockedTools(previous, project) {
  const report = JSON.parse(readFileSync(join(previous, 'build-report.json')));
  if (
    report.format !== 'clutter-matched-build34' ||
    report.status !== 'build-smoke-complete' ||
    report.manifestSha256 !==
      '0667db819cb04752002dea197b2973954c3a4628e0a31139b6c6eca7b6cd165f' ||
    report.candidates?.['H-T']?.status !== 'built-signed-headless-smoke-pass'
  )
    throw Error('VERIFIED_TAURI_LOCK_SOURCE_REQUIRED');
  const old = join(previous, 'tauri-project'),
    npm = readFileSync(join(old, 'package-lock.json')),
    cargo = readFileSync(join(old, 'src-tauri/Cargo.lock'));
  if (
    sha(npm) !== report.tauriLocks?.npmSha256 ||
    sha(cargo) !== report.tauriLocks?.cargoSha256
  )
    throw Error('DEPENDENCY_LOCK_INTEGRITY');
  const p = JSON.parse(npm);
  if (p.packages?.['']?.dependencies?.['@tauri-apps/cli'] !== '2.12.4')
    throw Error('TAURI_CLI_PIN_CHANGED');
  const toml = readFileSync(join(old, 'src-tauri/Cargo.toml'), 'utf8');
  for (const [name, version] of [
    ['tauri', '2.12.5'],
    ['tauri-build', '2.7.4'],
    ['serde_json', '1.0.145'],
  ]) {
    const line = toml.split('\n').find((s) => s.startsWith(name + ' = '));
    if (!line?.includes('"=' + version + '"'))
      throw Error('TAURI_CRATE_PIN_CHANGED');
  }
  const before = cargo.toString('utf8'),
    pattern =
      /\[\[package\]\]\r?\nname = "clutter-h01-tauri"\r?\nversion = "0\.0\.0"/g;
  if ([...before.matchAll(pattern)].length !== 1)
    throw Error('CARGO_ROOT_IDENTITY_REQUIRED');
  const nextCargo = before.replace(
    pattern,
    '[[package]]\nname = "clutter-foundation-desktop"\nversion = "0.0.0"'
  );
  p.name = 'clutter-foundation-desktop-build';
  p.packages[''].name = p.name;
  mkdirSync(join(project, 'src-tauri'), { recursive: true });
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({
      name: p.name,
      version: '0.0.0',
      private: true,
      dependencies: { '@tauri-apps/cli': '2.12.4' },
    })
  );
  writeFileSync(
    join(project, 'package-lock.json'),
    JSON.stringify(p, null, 2) + '\n'
  );
  writeFileSync(join(project, 'src-tauri/Cargo.lock'), nextCargo);
  return {
    sourceRun: report.id,
    npmSourceSha256: sha(npm),
    cargoSourceSha256: sha(cargo),
    npmSha256: sha(readFileSync(join(project, 'package-lock.json'))),
    cargoSha256: sha(Buffer.from(nextCargo)),
    change:
      'Root package names only; exact external dependency versions/integrities/checksums retained',
  };
}
