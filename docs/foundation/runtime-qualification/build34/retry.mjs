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
