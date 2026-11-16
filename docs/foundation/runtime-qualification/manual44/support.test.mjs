import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquisitionGate, validatePlan, reuseGui, planId } from './model.mjs';
const source = dirname(fileURLToPath(import.meta.url));
test('readable metadata never becomes latency qualification; missing schema/export fails gate', () => {
  const s = [
    'process-info',
    'hitches-frame-lifetimes',
    'displayed-surfaces-interval',
  ];
  assert.equal(acquisitionGate(0, null, s), 'readable-schema-gate-only');
  assert.match(acquisitionGate(10, null, s), /blocked/);
  assert.match(acquisitionGate(0, 'ETIMEDOUT', s), /blocked/);
  assert.match(acquisitionGate(0, null, s.slice(1)), /blocked/);
});
test('manual import is confined to the exact plan directory/name and bound target identity', () => {
  const p = {
    format: 'clutter-manual-plan44',
    candidate: 'H-T',
    targetUiPid: 123,
    bundleSha256: 'a'.repeat(64),
    tracePath: '/private/test/manual.trace',
  };
  assert.equal(validatePlan(p, '/private/test'), p);
  for (const patch of [
    { tracePath: '/other/manual.trace' },
    { tracePath: '/private/test/../manual.trace' },
    { targetUiPid: 0 },
    { bundleSha256: 'fake' },
    { candidate: 'H-S' },
  ])
    assert.throws(() => validatePlan({ ...p, ...patch }, '/private/test'));
  assert.throws(() => planId(['--plan', '../x']));
});
test('reuse requires correct image and exact private boot binding, without launching another window', () => {
  const p = { privateBootFile: '/private/session/unique.json' };
  assert.equal(
    reuseGui(p, '/app --host-config /private/session/unique.json', true),
    true
  );
  assert.equal(reuseGui(p, '/app --host-config /other.json', true), false);
  assert.equal(
    reuseGui(p, '/app --host-config /private/session/unique.json', false),
    false
  );
  assert.equal(reuseGui({}, '/app', true), false);
  assert.equal(
    reuseGui(p, '/app --host-config /private/session/unique.json.extra', true),
    false
  );
});
test(
  'manual method scripts refuse unsupported host before app/trace/plan access',
  { skip: process.platform === 'darwin' },
  () => {
    for (const [script, args] of [
      ['prepare.mjs', ['--run', 'sample', '--candidate', 'H-T']],
      ['validate.mjs', ['--plan', 'sample']],
    ]) {
      const p = spawnSync(process.execPath, [join(source, script), ...args], {
        encoding: 'utf8',
      });
      assert.equal(p.status, 2, p.stderr);
      assert.equal(JSON.parse(p.stdout).recording, 'not-run');
    }
  }
);
