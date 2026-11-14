import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { preflight, stageBundle } from '../native-macos/support.mjs';
const cases = JSON.parse(readFileSync('native-macos/cases.json', 'utf8'));
test('non-Mac preflight blocks before invoking Apple tools', () => {
  let called = false;
  const r = preflight({
    platform: 'linux',
    exec: () => {
      called = true;
      throw new Error('should not execute');
    },
  });
  assert.equal(r.ready, false);
  assert.equal(called, false);
  assert.equal(r.nativeAcceptance, 'not-run');
});
test('missing SDK/compiler is blocked, not a passing native check', () => {
  const r = preflight({
    platform: 'darwin',
    exec: () => ({ status: 1, stdout: '', stderr: 'missing developer tools' }),
  });
  assert.equal(r.ready, false);
  assert.ok(r.checks.every((c) => c.status === 'blocked'));
  assert.equal(r.nativeAcceptance, 'not-run');
});
test('successful tool discovery permits launch preparation without declaring native acceptance', () => {
  const r = preflight({
    platform: 'darwin',
    exec: (_cmd, args) => ({
      status: 0,
      stdout:
        args[0] === '--find'
          ? '/Applications/Developer Tools/swiftc'
          : 'test-sdk',
      stderr: '',
    }),
  });
  assert.equal(r.ready, true);
  assert.equal(r.nativeAcceptance, 'not-run');
});
test('bundle staging handles directory spaces and preserves resource identities', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'clutter native space '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const b = stageBundle(dir, { test: 'synthetic' });
  assert.ok(
    b.executable.endsWith('Clutter R07 Lab.app/Contents/MacOS/ClutterR07Lab')
  );
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(b.bundle, 'Contents/Resources/cases.json'), 'utf8')
    ),
    cases
  );
  assert.equal(
    JSON.parse(
      readFileSync(join(b.bundle, 'Contents/Resources/build-info.json'), 'utf8')
    ).test,
    'synthetic'
  );
  const plist = readFileSync(join(b.bundle, 'Contents/Info.plist'), 'utf8');
  assert.ok(plist.includes('com.clutter.foundation.r07lab'));
  assert.ok(!plist.includes('NSAllowsArbitraryLoads'));
});
test('manual catalogue is unique, scoped and never supplies fake passing results', () => {
  assert.equal(cases.length, 9);
  assert.equal(new Set(cases.map((c) => c.id)).size, 9);
  assert.ok(
    cases.every(
      (c) =>
        c.steps.length >= 2 &&
        c.expected &&
        c.targets.length &&
        c.seeds.every((s) => /^EI-\d{3}$/.test(s))
    )
  );
  assert.ok(cases.every((c) => !('status' in c)));
  assert.deepEqual(cases.find((c) => c.id === 'NM-08').targets, ['step']);
});
test(
  'actual runner --check reports unsupported host with exit 2 on Linux',
  { skip: process.platform !== 'linux' },
  () => {
    const r = spawnSync(process.execPath, ['native-macos/run.mjs', '--check'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(r.status, 2);
    assert.equal(JSON.parse(r.stdout).ready, false);
  }
);
