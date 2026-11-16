import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  linkSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executableMatch } from './executable.mjs';
import { sanitizeSample } from '../instruments39/model.mjs';
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'clutter-identity41-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const sample = (pid, path) => ({
  pid,
  status: 'read',
  startTicks: '12345',
  physicalFootprintBytes: 100,
  executable: path,
});
const raw = (p) => ({
  format: 'clutter-process-counter39',
  api: 'proc_pid_rusage/RUSAGE_INFO_V4/ri_phys_footprint',
  units: 'bytes',
  processes: [p],
});
test('exact absolute paths preserve the old acceptance rule; malformed paths refuse', () => {
  assert.deepEqual(executableMatch('/unchanged/path', '/unchanged/path'), {
    matches: true,
    method: 'exact-path',
  });
  for (const pair of [
    [null, '/a'],
    ['relative', 'relative'],
    ['/a\0', '/a\0'],
  ])
    assert.equal(executableMatch(...pair).matches, false);
});
test('actual symlink alias matches only when canonical path and stable file identity both agree', () =>
  fixture((dir) => {
    const file = join(dir, 'binary'),
      alias = join(dir, 'alias');
    writeFileSync(file, 'binary');
    symlinkSync('binary', alias);
    assert.deepEqual(executableMatch(alias, file), {
      matches: true,
      method: 'canonical-file-identity',
    });
  }));
test('same basename, size and bytes in different files do not identify the same executable', () =>
  fixture((dir) => {
    mkdirSync(join(dir, 'a'));
    mkdirSync(join(dir, 'b'));
    const a = join(dir, 'a', 'binary'),
      b = join(dir, 'b', 'binary');
    writeFileSync(a, 'same');
    writeFileSync(b, 'same');
    assert.equal(executableMatch(a, b).matches, false);
  }));
test('unverified hardlink aliases with different canonical names remain rejected', () =>
  fixture((dir) => {
    const a = join(dir, 'binary'),
      b = join(dir, 'hardlink');
    writeFileSync(a, 'binary');
    linkSync(a, b);
    assert.equal(executableMatch(a, b).matches, false);
  }));
test('dangling alias or directory is unavailable, not permission-free success', () =>
  fixture((dir) => {
    const alias = join(dir, 'alias');
    symlinkSync('missing', alias);
    assert.equal(executableMatch(alias, join(dir, 'missing')).matches, false);
    symlinkSync('.', join(dir, 'directory'));
    assert.equal(executableMatch(dir, join(dir, 'directory')).matches, false);
  }));
test('full sanitizer admits verified aliases while retaining byte/identity/user gates and private paths', () =>
  fixture((dir) => {
    const file = join(dir, 'binary'),
      alias = join(dir, 'alias');
    writeFileSync(file, 'x');
    symlinkSync('binary', alias);
    const selected = [
        {
          pid: 10,
          uid: 501,
          role: 'shared-webkit-candidate',
          executable: alias,
        },
      ],
      after = [{ pid: 10, uid: 501, executable: alias }],
      result = sanitizeSample(selected, raw(sample(10, file)), after);
    assert.equal(result.processes[0].status, 'read');
    assert.equal(
      result.processes[0].pathValidation.before,
      'canonical-file-identity'
    );
    assert.equal(result.includingAllObservedSameUserWebKitBytes, 100);
    assert.equal(result.eligibleForRanking, false);
    assert(!JSON.stringify(result).includes(dir));
    assert.equal(
      sanitizeSample(selected, raw(sample(10, file)), [
        { ...after[0], uid: 502 },
      ]).processes[0].failureStage,
      'user-changed'
    );
    assert.equal(
      sanitizeSample(
        selected,
        raw({ ...sample(10, file), startTicks: '0' }),
        after
      ).processes[0].status,
      'unavailable-or-changed'
    );
    assert.equal(
      sanitizeSample(
        selected,
        raw({ ...sample(10, file), physicalFootprintBytes: -1 }),
        after
      ).includingAllObservedSameUserWebKitBytes,
      null
    );
  }));
test('retargeted symlink to a different binary remains a path mismatch and null total', () =>
  fixture((dir) => {
    const a = join(dir, 'a'),
      b = join(dir, 'b'),
      alias = join(dir, 'alias');
    writeFileSync(a, 'x');
    writeFileSync(b, 'x');
    symlinkSync('a', alias);
    rmSync(alias);
    symlinkSync('b', alias);
    const selected = [
        {
          pid: 10,
          uid: 501,
          role: 'shared-webkit-candidate',
          executable: alias,
        },
      ],
      result = sanitizeSample(selected, raw(sample(10, a)), selected);
    assert.equal(result.processes[0].failureStage, 'path-before-mismatch');
    assert.equal(result.includingAllObservedSameUserWebKitBytes, null);
  }));
