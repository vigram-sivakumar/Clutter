import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { startAnnouncement, controlledResult } from './model.mjs';
import { traceProcess } from '../recovery40/trace-process.mjs';
const source = dirname(fileURLToPath(import.meta.url));
test('record-start message can span chunks and triggers operator announcement exactly once', () => {
  const announce = startAnnouncement();
  assert.equal(announce('Ctrl-C to stop '), false);
  assert.equal(announce('the recording'), true);
  assert.equal(announce('Ctrl-C to stop the recording'), false);
});
test('capture/export alone never becomes latency or attribution pass', () => {
  assert.equal(
    controlledResult({ status: 0, tracePresent: true, tocExit: 0 }),
    'method-trial-recorded-correlation-unvalidated'
  );
  for (const state of [
    { tracePresent: false, tocExit: 0 },
    { tracePresent: true, tocExit: 10 },
    { errorCode: 'TIMEOUT', tracePresent: true, tocExit: 0 },
  ])
    assert.equal(controlledResult(state), 'method-trial-capture-blocked');
});
test('frozen method trial uses native manual input and finite failure disposition, not a product budget rewrite', () => {
  const c = JSON.parse(readFileSync(join(source, 'contract.json')));
  assert.equal(c.nativeCaptureSeconds, 20);
  assert.equal(c.input.eventInjection, false);
  assert.equal(c.input.rawKeystrokeLogging, false);
  assert.match(c.bound, /One method trial/);
  assert(
    c.evidenceRequiredBeforeMetrics.some((x) => x.includes('units/clocks'))
  );
});
test('streaming observer sees real trace child output without changing normal completion', async () => {
  let seen = '';
  const p = await traceProcess(
    process.execPath,
    ['-e', 'console.log("Starting recording")'],
    {
      interruptMs: 500,
      terminateMs: 800,
      killMs: 1000,
      onStdout: (s) => (seen += s),
    }
  );
  assert.equal(p.status, 0);
  assert.match(seen, /Starting recording/);
  assert.deepEqual(p.signalsSent, []);
});
test('observer failure is reported without stopping a normally finishing trace child', async () => {
  const p = await traceProcess(
    process.execPath,
    ['-e', 'console.log("hello")'],
    {
      interruptMs: 500,
      terminateMs: 800,
      killMs: 1000,
      onStdout: () => {
        throw Error('observer');
      },
    }
  );
  assert.equal(p.status, 0);
  assert.equal(p.observerFailed, true);
});
test(
  'non-Mac controlled runner refuses before recording or touching app',
  { skip: process.platform === 'darwin' },
  () => {
    const p = spawnSync(
      process.execPath,
      [join(source, 'run.mjs'), '--run', 'sample', '--candidate', 'H-T'],
      { encoding: 'utf8' }
    );
    assert.equal(p.status, 2, p.stderr);
    assert.equal(JSON.parse(p.stdout).recording, 'not-run');
  }
);
