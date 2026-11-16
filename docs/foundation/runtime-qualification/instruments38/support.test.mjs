import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  linkSync,
  rmSync,
  lstatSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  installedBytes,
  prepareArgs,
  assessCalibration,
  trialSizeDisposition,
} from './model.mjs';
const source = dirname(fileURLToPath(import.meta.url));
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'clutter-instrument38-test-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const sample = {
  format: 'clutter-phys-counter38',
  api: 'proc_pid_rusage/RUSAGE_INFO_V4/ri_phys_footprint',
  units: 'bytes',
  crossProcessRead: true,
  sameProcessIdentity: true,
  allocatedBytes: 67108864,
  beforeBytes: 1048576,
  heldBytes: 68157440,
  releasedBytes: 1048576,
  deltaBytes: 67108864,
  status: 'counter-change-observed',
  hostRanking: 'not-qualified',
};
test('symlink aliases do not multiply framework contents; blocks and directories are explicit', () =>
  fixture((dir) => {
    mkdirSync(join(dir, 'Versions'));
    mkdirSync(join(dir, 'Versions', 'A'));
    writeFileSync(join(dir, 'Versions', 'A', 'binary'), Buffer.alloc(12345));
    symlinkSync('A', join(dir, 'Versions', 'Current'));
    symlinkSync('Versions/Current/binary', join(dir, 'binary'));
    const result = installedBytes(dir);
    const paths = [
      '',
      'Versions',
      'Versions/A',
      'Versions/A/binary',
      'Versions/Current',
      'binary',
    ];
    assert.equal(result.files, 1);
    assert.equal(result.directories, 3);
    assert.equal(result.symlinks, 2);
    assert.equal(
      result.logicalBytes,
      12345 +
        Buffer.byteLength('A') +
        Buffer.byteLength('Versions/Current/binary')
    );
    assert.equal(
      result.allocatedBytes,
      paths.reduce((n, p) => n + lstatSync(join(dir, p)).blocks * 512, 0)
    );
  }));
test('hardlinked file allocation is counted once; per-entry logical bytes stay disclosed', () =>
  fixture((dir) => {
    writeFileSync(join(dir, 'a'), Buffer.alloc(1000));
    linkSync(join(dir, 'a'), join(dir, 'b'));
    const result = installedBytes(dir);
    assert.equal(result.files, 2);
    assert.equal(result.logicalBytes, 2000);
    assert.equal(
      result.allocatedBytes,
      (lstatSync(dir).blocks + lstatSync(join(dir, 'a')).blocks) * 512
    );
  }));
test('external and dangling symlinks refuse rather than excluding required dependencies', () =>
  fixture((dir) => {
    const app = join(dir, 'app');
    mkdirSync(app);
    writeFileSync(join(dir, 'external'), 'x');
    symlinkSync('../external', join(app, 'escape'));
    assert.throws(() => installedBytes(app), /ESCAPES/);
    rmSync(join(app, 'escape'));
    symlinkSync('missing', join(app, 'broken'));
    assert.throws(() => installedBytes(app));
  }));
test('preparation requires one explicit completed run ID and accepts no fixture/reset switches', () => {
  assert.equal(prepareArgs(['--run', '2026-11-16-abc']), '2026-11-16-abc');
  for (const args of [
    [],
    ['--run', '../main'],
    ['--run', 'ok', '--new'],
    ['--run', 'ok', '--run', 'other'],
  ])
    assert.throws(() => prepareArgs(args));
});
test('counter validation requires actual physical bytes, child identity and observed change', () => {
  assert.equal(assessCalibration(sample, 0), 'counter-sanity-pass');
  for (const change of [
    { api: 'rss' },
    { units: 'KiB' },
    { crossProcessRead: false },
    { sameProcessIdentity: false },
    { deltaBytes: 100 },
    { heldBytes: sample.beforeBytes },
    { allocatedBytes: 100 },
    { hostRanking: 'winner' },
    { beforeBytes: NaN },
  ])
    assert.equal(
      assessCalibration({ ...sample, ...change }, 0),
      'inconclusive'
    );
  assert.equal(assessCalibration(sample, 2), 'inconclusive');
  assert.equal(assessCalibration(null, 0), 'inconclusive');
});
test('release counter need not instantly return to baseline; it is recorded without a false leak claim', () => {
  assert.equal(
    assessCalibration({ ...sample, releasedBytes: sample.heldBytes }, 0),
    'counter-sanity-pass'
  );
});
test('fixed size limits use bytes and preserve failing dispositions', () => {
  assert.equal(
    trialSizeDisposition(200 * 1024 * 1024, 200),
    'within-trial-limit'
  );
  assert.equal(
    trialSizeDisposition(200 * 1024 * 1024 + 1, 200),
    'exceeds-trial-limit'
  );
  assert.throws(() => trialSizeDisposition(-1, 200));
  assert.throws(() => trialSizeDisposition(10, 0));
});
test(
  'unsupported host refuses before creating reports, compiling or reading builds',
  { skip: process.platform === 'darwin' },
  () => {
    const child = spawnSync(
      process.execPath,
      [join(source, 'prepare.mjs'), '--run', 'sample'],
      { encoding: 'utf8' }
    );
    assert.equal(child.status, 2, child.stderr);
    assert.equal(JSON.parse(child.stdout).status, 'MAC_ARM64_REQUIRED');
  }
);
test(
  'native utility has an executable Linux refusal branch, never fake Mac footprint',
  { skip: process.platform !== 'linux' },
  () =>
    fixture((dir) => {
      const binary = join(dir, 'probe'),
        build = spawnSync(
          'cc',
          [
            '-std=c11',
            '-Wall',
            '-Wextra',
            '-Werror',
            join(source, 'physical-footprint.c'),
            '-o',
            binary,
          ],
          { encoding: 'utf8' }
        );
      assert.equal(build.status, 0, build.stderr);
      const run = spawnSync(binary, ['--self-test'], { encoding: 'utf8' });
      assert.equal(run.status, 2);
      assert.equal(JSON.parse(run.stdout).status, 'mac-required');
      const bad = spawnSync(binary, ['--pid', '1'], { encoding: 'utf8' });
      assert.equal(bad.status, 2);
    })
);
