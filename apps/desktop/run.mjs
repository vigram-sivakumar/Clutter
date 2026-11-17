// This bootstrap imports no TS/Core/build dependencies before selecting pinned Node.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { lock, acquireRuntime } from './tools/runtime.mjs';
import { windowArguments } from './host/window-records.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  root = resolve(source, '../..'),
  args = process.argv.slice(2);
windowArguments(args);
if (
  execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  }).trim() !== 'architecture/clutter-foundation'
)
  throw Error('FOUNDATION_BRANCH_REQUIRED');
if (args.includes('--check')) {
  console.log(
    JSON.stringify(
      {
        platform: process.platform,
        architecture: process.arch,
        developerNode: process.version,
        ownerRuntime: lock.version,
        macBuild: 'not-run',
        native: 'not-run',
        sharedUI: true,
        requires:
          'macOS14+ ARM64, Rust1.90.0/Xcode and checked-in native locks; no prior experiment cache or global toolchain changes',
      },
      null,
      2
    )
  );
} else if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.error(
    'This runner currently builds macOS ARM64 only. Shared UI/Core are platform-separated; Windows native support is not yet run.'
  );
  process.exitCode = 2;
} else {
  const gitPath = (part) =>
    resolve(
      root,
      execFileSync('git', ['rev-parse', '--git-path', part], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
    );
  const base = gitPath('clutter-structured53'),
    cache = join(base, 'cache');
  mkdirSync(cache, { recursive: true });
  console.log(
    'Preparing pinned Node ' +
      lock.version +
      ' without changing your global Node.'
  );
  try {
    const runtime = await acquireRuntime(cache, process.arch);
    const child = spawn(
      runtime.binary,
      [
        join(source, 'tools/build.mjs'),
        base,
        runtime.binary,
        runtime.license,
        ...args,
      ],
      { cwd: root, stdio: 'inherit' }
    );
    child.on('error', () => {
      console.error('Pinned build runner could not start.');
      process.exitCode = 1;
    });
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  } catch (e) {
    console.error('Structured setup stopped: ' + e.message);
    process.exitCode = 1;
  }
}
