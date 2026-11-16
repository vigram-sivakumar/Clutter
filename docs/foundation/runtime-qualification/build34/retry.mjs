import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tree, sha } from './projects.mjs';
export function retryId(args) {
  if (!args.length) return null;
  if (
    args.length !== 2 ||
    args[0] !== '--retry' ||
    !/^[A-Za-z0-9-]{1,100}$/.test(args[1])
  )
    throw Error('USE_--retry_BUILD_ID');
  return args[1];
}
export function loadRetry(builds, id, expectedManifest) {
  const dir = resolve(builds, id);
  if (!dir.startsWith(resolve(builds) + sep) || realpathSync(dir) !== dir)
    throw Error('INVALID_RETRY_DIRECTORY');
  const report = JSON.parse(
    readFileSync(join(dir, 'build-report.json'), 'utf8')
  );
  if (
    report.id !== id ||
    report.format !== 'clutter-matched-build34' ||
    report.manifestSha256 !== expectedManifest
  )
    throw Error('RETRY_PROFILE_MISMATCH');
  if (report.status !== 'build-smoke-incomplete')
    throw Error('RETRY_REQUIRES_INCOMPLETE_BUILD');
  if (tree(join(dir, 'CommonCore')).sha256 !== report.commonCore?.sha256)
    throw Error('RETRY_COMMON_CORE_CHANGED');
  const inputs = JSON.parse(
    readFileSync(join(dir, 'input-source-hashes.json'), 'utf8')
  );
  for (const [name, digest] of Object.entries(inputs))
    if (
      digest !== 'esbuild-disabled-module' &&
      sha(readFileSync(resolve(dir, name))) !== digest
    )
      throw Error('RETRY_COMPILED_INPUT_CHANGED_USE_FULL_BUILD');
  if (report.compiledInputSourceSha256 !== sha(JSON.stringify(inputs)))
    throw Error('RETRY_INPUT_MANIFEST_CHANGED');
  return { dir, report };
}

// Verified ancestry carries passed artifacts and dependency locks through partial retries.
// A retry may fail before copying its own locks, while still adding another passed app.
export function retryHistory(builds, previous) {
  const result = [],
    seen = new Set();
  let current = previous;
  for (let depth = 0; depth < 32; depth++) {
    const id = current.report.id;
    if (seen.has(id)) throw Error('RETRY_HISTORY_CYCLE');
    seen.add(id);
    result.push(current);
    const parent = current.report.retryOf;
    if (!parent) return result;
    retryId(['--retry', parent]);
    const dir = resolve(builds, parent);
    if (realpathSync(dir) !== dir) throw Error('INVALID_RETRY_ANCESTOR');
    const bytes = readFileSync(join(dir, 'build-report.json'));
    if (
      !current.report.previousReportSha256 ||
      sha(bytes) !== current.report.previousReportSha256
    )
      throw Error('RETRY_ANCESTOR_REPORT_CHANGED');
    const report = JSON.parse(bytes);
    if (
      report.id !== parent ||
      report.format !== previous.report.format ||
      report.manifestSha256 !== previous.report.manifestSha256 ||
      report.commonCore?.sha256 !== previous.report.commonCore?.sha256 ||
      report.compiledInputSourceSha256 !==
        previous.report.compiledInputSourceSha256
    )
      throw Error('RETRY_ANCESTOR_PROFILE_MISMATCH');
    current = { dir, report };
  }
  throw Error('RETRY_HISTORY_LIMIT');
}
export function tauriRetrySource(builds, previous) {
  const source = retryHistory(builds, previous).find(
    (r) => r.report.tauriLocks
  );
  if (!source) throw Error('RETRY_NO_VERIFIED_TAURI_LOCK_PROVENANCE');
  for (const [name, hash] of [
    ['package-lock.json', source.report.tauriLocks.npmSha256],
    ['src-tauri/Cargo.lock', source.report.tauriLocks.cargoSha256],
  ])
    if (
      typeof hash !== 'string' ||
      sha(readFileSync(join(source.dir, 'tauri-project', name))) !== hash
    )
      throw Error('RETRY_ANCESTOR_LOCK_CHANGED');
  return source;
}
export function keptArchive(builds, previous, candidate) {
  const history = retryHistory(builds, previous);
  let source = previous;
  const expected = previous.report.candidates[candidate];
  for (let depth = 0; depth < history.length; depth++) {
    const kept = source.report.candidates[candidate];
    if (
      !kept ||
      kept.status !== 'built-signed-headless-smoke-pass' ||
      kept.bundleSha256 !== expected.bundleSha256 ||
      kept.archiveSha256 !== expected.archiveSha256
    )
      throw Error('RETRY_KEPT_ARTIFACT_PROVENANCE_CHANGED');
    if (!kept.verifiedKeptFrom)
      return {
        path: join(source.dir, candidate + '-darwin-arm64.zip'),
        runId: source.report.id,
      };
    const parent = history.find((r) => r.report.id === kept.verifiedKeptFrom);
    if (!parent || parent.report.id === source.report.id)
      throw Error('RETRY_KEPT_ARTIFACT_HISTORY_INVALID');
    source = parent;
  }
  throw Error('RETRY_KEPT_ARTIFACT_HISTORY_LIMIT');
}
