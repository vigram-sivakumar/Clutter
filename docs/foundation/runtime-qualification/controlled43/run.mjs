// Retired entry point: matched method43 attempts blocked on both hosts. No retries.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureArgs } from '../instruments39/model.mjs';
captureArgs(process.argv.slice(2));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
if (
  execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  }).trim() !== 'architecture/clutter-foundation'
)
  throw Error('FOUNDATION_BRANCH_REQUIRED');
console.log(
  JSON.stringify({
    status:
      process.platform !== 'darwin' || process.arch !== 'arm64'
        ? 'MAC_ARM64_REQUIRED'
        : 'METHOD43_BLOCKED_AFTER_MATCHED_FAILURES',
    recording: 'not-run',
    next: 'Read manual44/README.md; no CLI record retry or automatic fallback.',
  })
);
process.exitCode = 2;
