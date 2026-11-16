import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  captureArgs,
  parseProcessList,
  selectProcesses,
  sanitizeSample,
  schemaNames,
} from './model.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  app = '/test/Clutter T.app',
  resources = app + '/Contents/Resources/CoreData';
const rows = [
  { pid: 10, ppid: 1, uid: 501, executable: app + '/Contents/MacOS/host' },
  { pid: 11, ppid: 1, uid: 501, executable: resources + '/runtime/node' },
  {
    pid: 12,
    ppid: 1,
    uid: 501,
    executable:
      '/System/Library/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent',
  },
  { pid: 13, ppid: 10, uid: 501, executable: '/System/helper' },
  { pid: 14, ppid: 1, uid: 501, executable: '/Applications/Other.app/binary' },
  {
    pid: 15,
    ppid: 1,
    uid: 502,
    executable: '/System/Library/com.apple.WebKit.Networking',
  },
];
const options = { app, resources, uiPid: 10, uid: 501 };
const raw = (selected) => ({
  format: 'clutter-process-counter39',
  api: 'proc_pid_rusage/RUSAGE_INFO_V4/ri_phys_footprint',
  units: 'bytes',
  processes: selected.map((p) => ({
    pid: p.pid,
    status: 'read',
    executable: p.executable,
    startTicks: '10000000000000000001',
    physicalFootprintBytes: 100,
  })),
});
test('process parser preserves paths with spaces and tolerates kernel/non-path names without attributing them', () => {
  const value = parseProcessList(
    ' 0 0 0 kernel_task\n 10 1 501 /test/Clutter T.app/Contents/MacOS/host\n'
  );
  assert.equal(value[1].executable, rows[0].executable);
  assert.equal(value[0].pid, 0);
  assert.throws(() => parseProcessList('garbage'));
  assert.throws(() => parseProcessList('1 0 0 /x\n1 0 0 /x'));
});
test('membership includes detached owner, system WebKit and observed descendants, not unrelated app/users', () => {
  const selected = selectProcesses(rows, options);
  assert.deepEqual(
    selected.map((x) => x.pid),
    [10, 11, 12, 13]
  );
  assert.equal(
    selected.find((x) => x.pid === 11).role,
    'bundled-owner-runtime'
  );
  assert.equal(
    selected.find((x) => x.pid === 12).role,
    'shared-webkit-candidate'
  );
});
test('UI binding refuses stale PID, runtime PID or another path with matching prefix', () => {
  assert.throws(() => selectProcesses(rows, { ...options, uiPid: 11 }));
  assert.throws(() => selectProcesses(rows, { ...options, uiPid: 14 }));
  assert.throws(() =>
    selectProcesses(rows, { ...options, app: '/test/Clutter' })
  );
  assert.throws(() => selectProcesses(rows, { ...options, uid: 502 }));
});
test('private process paths are removed and uncertain shared costs stay separate from known process sums', () => {
  const selected = selectProcesses(rows, options),
    result = sanitizeSample(selected, raw(selected), rows);
  assert.equal(result.knownProcessSumBytes, 300);
  assert.equal(result.includingAllObservedSameUserWebKitBytes, 400);
  assert.equal(result.eligibleForRanking, false);
  assert(!JSON.stringify(result).includes('/System/'));
  assert(!JSON.stringify(result).includes('/test/'));
  assert.equal(result.processes[0].startTicks, '10000000000000000001');
});
test('unavailable or changed process never becomes zero memory or a complete total', () => {
  const selected = selectProcesses(rows, options),
    value = raw(selected);
  value.processes[1].status = 'unavailable-or-changed';
  const result = sanitizeSample(selected, value, rows);
  assert.equal(result.unavailableProcesses, 1);
  assert.equal(result.knownProcessSumBytes, null);
  assert.equal(result.includingAllObservedSameUserWebKitBytes, null);
  const replacement = rows.map((p) =>
    p.pid === 10 ? { ...p, executable: '/other' } : p
  );
  assert.equal(
    sanitizeSample(selected, raw(selected), replacement).processes[0].status,
    'unavailable-or-changed'
  );
});
test('counter frames reject wrong units, missing/duplicate PIDs and negative or unsafe counters', () => {
  const selected = selectProcesses(rows, options),
    value = raw(selected);
  assert.throws(() =>
    sanitizeSample(selected, { ...value, units: 'rss' }, rows)
  );
  assert.throws(() =>
    sanitizeSample(
      selected,
      { ...value, processes: value.processes.slice(1) },
      rows
    )
  );
  assert.throws(() =>
    sanitizeSample(
      selected,
      { ...value, processes: value.processes.map(() => value.processes[0]) },
      rows
    )
  );
  value.processes[0].physicalFootprintBytes = -1;
  assert.equal(sanitizeSample(selected, value, rows).unavailableProcesses, 1);
});
test('trace schema presence is an inventory, never presentation latency proof; bounded input', () => {
  assert.deepEqual(
    schemaNames(
      '<schema name="frame-lifetime"/><schema name="frame-lifetime"/><schema name="tick"/>'
    ),
    ['frame-lifetime', 'tick']
  );
  assert.deepEqual(schemaNames('<table>no timings</table>'), []);
  assert.throws(() => schemaNames('x'.repeat(8 * 1024 * 1024 + 1)));
});
test('comparison follows shared-UI requirement; only shortlist diagnostics and explicit IDs accepted', () => {
  assert.equal(
    captureArgs(['--candidate', 'H-T', '--run', 'build'])['--candidate'],
    'H-T'
  );
  for (const args of [
    [],
    ['--run', '../x', '--candidate', 'H-T'],
    ['--run', 'x', '--candidate', 'H-S'],
    ['--run', 'x', '--candidate', 'H-E', '--new', 'yes'],
  ])
    assert.throws(() => captureArgs(args));
});
test(
  'non-Mac runner refuses before app/process/trace access',
  { skip: process.platform === 'darwin' },
  () => {
    const p = spawnSync(
      process.execPath,
      [join(source, 'capture.mjs'), '--run', 'sample', '--candidate', 'H-T'],
      { encoding: 'utf8' }
    );
    assert.equal(p.status, 2, p.stderr);
    assert.equal(JSON.parse(p.stdout).status, 'MAC_ARM64_REQUIRED');
  }
);
test(
  'C utility reuses38 calibration and has an actual unsupported-platform refusal',
  { skip: process.platform !== 'linux' },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'clutter-counter39-'));
    try {
      const binary = join(dir, 'probe'),
        build = spawnSync(
          'cc',
          [
            '-std=c11',
            '-Wall',
            '-Wextra',
            '-Werror',
            join(source, 'counter.c'),
            '-o',
            binary,
          ],
          { encoding: 'utf8' }
        );
      assert.equal(build.status, 0, build.stderr);
      const result = spawnSync(binary, ['--pids', '1'], { encoding: 'utf8' });
      assert.equal(result.status, 2);
      assert.equal(JSON.parse(result.stdout).status, 'mac-required');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
);
