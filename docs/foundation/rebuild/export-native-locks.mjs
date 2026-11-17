// Read only the generated, completed build's four public dependency files.
// No endpoint/session/host config, credentials, runtime binaries or traces exported.
import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  readFileSync,
  realpathSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
function read(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    if (!s.isFile() || s.size > 8 * 1024 * 1024)
      throw Error('BOUNDED_REGULAR_FILE_REQUIRED');
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function collectNativeLocks(gitDirectory) {
  const base = resolve(gitDirectory, 'clutter-foundation48'),
    latest = JSON.parse(read(join(base, 'latest.json'))),
    build = dirname(latest.app ?? '');
  const id = relative(join(base, 'builds'), build);
  if (
    !/^[0-9T-]+Z$/.test(id) ||
    realpathSync(build) !== build ||
    latest.app !== join(build, 'Clutter Foundation.app')
  )
    throw Error('GENERATED_BUILD_REQUIRED');
  const report = JSON.parse(read(join(build, 'build-report.json')));
  if (report.status !== 'built-signed-not-native-qualified')
    throw Error('COMPLETED_BUILD_REQUIRED');
  const paths = {
    'native-tools.package.json': 'project/package.json',
    'native-tools.package-lock.json': 'project/package-lock.json',
    'Cargo.toml': 'project/src-tauri/Cargo.toml',
    'Cargo.lock': 'project/src-tauri/Cargo.lock',
  };
  const files = Object.fromEntries(
    Object.entries(paths).map(([name, path]) => [name, read(join(build, path))])
  );
  if (
    sha(files['Cargo.lock']) !== report.dependencyProvenance?.cargoSha256 ||
    sha(files['native-tools.package-lock.json']) !==
      report.dependencyProvenance?.npmSha256
  )
    throw Error('GENERATED_LOCK_DIGEST_MISMATCH');
  const pkg = JSON.parse(files['native-tools.package.json']);
  if (pkg.dependencies?.['@tauri-apps/cli'] !== '2.12.4')
    throw Error('UNEXPECTED_NATIVE_TOOL_PIN');
  files['provenance.json'] = Buffer.from(
    JSON.stringify(
      {
        format: 'clutter-native-lock-export51',
        sourceBuild: id,
        files: Object.fromEntries(
          Object.entries(files).map(([n, b]) => [n, sha(b)])
        ),
        origin: Object.fromEntries(
          [
            'sourceRun',
            'npmSourceSha256',
            'cargoSourceSha256',
            'npmSha256',
            'cargoSha256',
          ]
            .filter((key) => report.dependencyProvenance[key] !== undefined)
            .map((key) => [key, report.dependencyProvenance[key]])
        ),
        scope: 'Dependency files only. Not a native qualification pass.',
      },
      null,
      2
    ) + '\n'
  );
  return files;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
    args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output')
    throw Error('USE_--output_ZIP_PATH');
  if (process.platform !== 'darwin') throw Error('MAC_EXPORT_RUNNER_REQUIRED');
  if (
    execFileSync('git', ['branch', '--show-current'], {
      cwd: root,
      encoding: 'utf8',
    }).trim() !== 'architecture/clutter-foundation'
  )
    throw Error('FOUNDATION_BRANCH_REQUIRED');
  const gitDirectory = resolve(
      root,
      execFileSync('git', ['rev-parse', '--git-path', '.'], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
    ),
    files = collectNativeLocks(gitDirectory),
    out = resolve(args[1]);
  if (existsSync(out)) throw Error('OUTPUT_ALREADY_EXISTS');
  const folder = join(
    gitDirectory,
    'clutter-rebuild',
    'exports',
    'native-locks-' + randomUUID()
  );
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const [name, bytes] of Object.entries(files))
    writeFileSync(join(folder, name), bytes, { mode: 0o600 });
  mkdirSync(dirname(out), { recursive: true });
  const zipped = spawnSync(
    '/usr/bin/ditto',
    ['-c', '-k', '--keepParent', folder, out],
    { encoding: 'utf8' }
  );
  if (zipped.status !== 0) throw Error('LOCK_EXPORT_ZIP_FAILED');
  chmodSync(out, 0o600);
  console.log(
    JSON.stringify(
      {
        status: 'dependency-files-exported',
        zip: out,
        files: Object.keys(files),
        sourceBuild: JSON.parse(files['provenance.json']).sourceBuild,
        scope:
          'No source/store/credentials/runtime/session files modified or exported',
      },
      null,
      2
    )
  );
}
