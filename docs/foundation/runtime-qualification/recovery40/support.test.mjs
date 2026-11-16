import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { traceProcess } from './trace-process.mjs';
import { sanitizeSample } from '../instruments39/model.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  selected = [
    {
      pid: 10,
      ppid: 1,
      uid: 501,
      role: 'shared-webkit-candidate',
      executable: '/private/path',
    },
  ];
const raw = (p) => ({
  format: 'clutter-process-counter39',
  api: 'proc_pid_rusage/RUSAGE_INFO_V4/ri_phys_footprint',
  units: 'bytes',
  processes: [{ pid: 10, ...p }],
});
test('native failure stage/errno survive sanitizing without paths or arbitrary error text', () => {
  const value = sanitizeSample(
    selected,
    raw({
      status: 'unavailable-or-changed',
      failureStage: 'counter-first',
      errorNumber: 1,
      executable: '/secret',
    }),
    selected
  );
  assert.equal(value.processes[0].failureStage, 'counter-first');
  assert.equal(value.processes[0].errorNumber, 1);
  assert.equal(value.includingAllObservedSameUserWebKitBytes, null);
  assert(!JSON.stringify(value).includes('/secret'));
  const hostile = sanitizeSample(
    selected,
    raw({
      status: 'unavailable-or-changed',
      failureStage: 'SECRET',
      errorNumber: 'TOKEN',
    }),
    selected
  );
  assert.equal(hostile.processes[0].failureStage, 'native-unavailable');
  assert(!JSON.stringify(hostile).includes('SECRET'));
  assert(!JSON.stringify(hostile).includes('TOKEN'));
});
test('path mismatch is distinguished from unavailable native API without accepting an alias', () => {
  const value = sanitizeSample(
    selected,
    raw({
      status: 'read',
      startTicks: '100',
      physicalFootprintBytes: 200,
      executable: '/different',
    }),
    selected
  );
  assert.equal(value.processes[0].failureStage, 'path-before-mismatch');
  assert.equal(value.processes[0].status, 'unavailable-or-changed');
});
test('normal trace child exit clears timers and requires no interrupt', async () => {
  const value = await traceProcess(
    process.execPath,
    ['-e', 'console.log("done")'],
    { interruptMs: 500, terminateMs: 800, killMs: 1000 }
  );
  assert.equal(value.status, 0);
  assert.deepEqual(value.signalsSent, []);
  assert.match(value.stdout, /done/);
});
test('slow finalization gets graceful SIGINT and preserves finalized output', async () => {
  const value = await traceProcess(
    process.execPath,
    [
      '-e',
      'process.on("SIGINT",()=>{console.log("finalized");process.exit(0)});setInterval(()=>{},100)',
    ],
    { interruptMs: 250, terminateMs: 1000, killMs: 1500 }
  );
  assert.equal(value.status, 0);
  assert.deepEqual(value.signalsSent, ['SIGINT']);
  assert.match(value.stdout, /finalized/);
});
test('unresponsive trace child escalates only its PID and reports timeout', async () => {
  const value = await traceProcess(
    process.execPath,
    [
      '-e',
      'process.on("SIGINT",()=>{});process.on("SIGTERM",()=>{});setInterval(()=>{},100)',
    ],
    { interruptMs: 250, terminateMs: 400, killMs: 550 }
  );
  assert.equal(value.errorCode, 'TRACE_FINALIZATION_TIMEOUT');
  assert.deepEqual(value.signalsSent, ['SIGINT', 'SIGTERM', 'SIGKILL']);
});
test('missing CLI and invalid deadlines are explicit failures', async () => {
  const value = await traceProcess('/no/such/clutter-trace', [], {
    interruptMs: 100,
    terminateMs: 200,
    killMs: 300,
  });
  assert.equal(value.errorCode, 'ENOENT');
  assert.throws(() =>
    traceProcess('x', [], { interruptMs: 500, terminateMs: 100, killMs: 200 })
  );
});
test(
  'non-Mac diagnostic refuses before reading fixture or launching trace',
  { skip: process.platform === 'darwin' },
  () => {
    const p = spawnSync(
      process.execPath,
      [join(source, 'diagnose.mjs'), '--run', 'sample', '--candidate', 'H-T'],
      { encoding: 'utf8' }
    );
    assert.equal(p.status, 2, p.stderr);
    assert.equal(JSON.parse(p.stdout).trace, 'not-run');
  }
);
