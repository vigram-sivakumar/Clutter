import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { exportTable } from '../trace42/export-table.mjs';
const source = dirname(fileURLToPath(import.meta.url));
const fixture = (columns, row) =>
  '<trace-query-result><node><schema>' +
  columns
    .map(
      ([name, unit]) =>
        '<col><mnemonic>' +
        name +
        '</mnemonic>' +
        (unit ? '<unit>' + unit + '</unit>' : '') +
        '</col>'
    )
    .join('') +
  '</schema>' +
  row +
  '</node></trace-query-result>';
function inspect(tables) {
  const dir = mkdtempSync(join(tmpdir(), 'clutter-links45-'));
  try {
    for (const [schema, xml] of Object.entries(tables))
      writeFileSync(join(dir, schema + '.xml'), xml);
    const spec = join(dir, 'spec.json');
    writeFileSync(
      spec,
      JSON.stringify({
        directory: dir,
        targetUiPid: 23,
        tables: Object.keys(tables).map((schema) => ({
          schema,
          status: 'structure-exported',
        })),
      })
    );
    const result = spawnSync('python3', [join(source, 'links.py'), spec], {
      encoding: 'utf8',
    });
    return { result, value: JSON.parse(result.stdout) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('candidate key enum and typed PID are inspected without promoting clock/frame validity or exposing text', () => {
  const xml = fixture(
    [['time', 'ns'], ['event-type'], ['process'], ['surface-id'], ['body']],
    '<row><event-time>100000000000000000001</event-time><enum fmt="Key Down"/><process id="1" fmt="SECRET NAME (23)"/><uint64>42</uint64><string>SECRET BODY /private/path</string></row>'
  );
  const { result, value } = inspect({ 'runloop-events': xml });
  assert.equal(result.status, 0, result.stderr);
  const t = value.tables[0];
  assert.equal(
    t.candidateInputRowsSample[0].nativeTimes.time.numericText,
    '100000000000000000001'
  );
  assert.equal(t.targetUiMentionRows, 1);
  assert.equal(t.unitsValidated, false);
  assert.equal(value.latencyComputed, false);
  assert(!result.stdout.includes('SECRET'));
  assert(!result.stdout.includes('/private/path'));
  assert.match(value.measurementGate, /blocked/);
});
test('identifier overlap is reported without inventing a causal input-to-frame join', () => {
  const a = fixture([['surface-id']], '<row><uint64>42</uint64></row>'),
    { value } = inspect({
      'visual-chain': a,
      'displayed-surfaces-interval': a,
    });
  assert.equal(value.identifierOverlaps.length, 1);
  assert.match(value.interpretation, /not causal joins/);
  assert.equal(value.tables[0].eventFrameJoinValidated, false);
});
test('XML intern references are resolved only inside their own table file', () => {
  const input = fixture(
      [['process']],
      '<row><process id="1" fmt="PRIVATE (23)"/></row>'
    ),
    frame = fixture(
      [['process'], ['time']],
      '<row><process ref="1"/><event-time>23</event-time></row>'
    );
  const { value } = inspect({
    'runloop-events': input,
    'hitches-frame-lifetimes': frame,
  });
  assert.equal(value.tables[0].targetUiMentionRows, 1);
  assert.equal(value.tables[1].targetUiMentionRows, 0);
  assert.deepEqual(value.identifierOverlaps, []);
});
test('cyclic references stay unresolved and unknown timestamps keep unvalidated units', () => {
  const xml = fixture(
    [['time'], ['surface-id']],
    '<row><event-time>123</event-time><uint64 id="a" ref="b"/></row><row><event-time ref="missing"/><uint64 id="b" ref="a"/></row>'
  );
  const { value } = inspect({ 'visual-chain': xml });
  assert(value.tables[0].unresolvedCellReferences >= 2);
  assert.equal(value.tables[0].unitsValidated, false);
  assert.equal(value.latencyComputed, false);
});
test('shared exporter preserves missing-schema refusal without calling OS export', () => {
  const entry = exportTable({
    schema: 'runloop-events',
    schemas: [],
    trace: '/absent',
    output: '/absent',
    uiPid: 23,
  });
  assert.deepEqual(entry, {
    schema: 'runloop-events',
    status: 'schema-unavailable',
  });
});
test(
  'non-Mac analysis refuses before reading saved trace or invoking export',
  { skip: process.platform === 'darwin' },
  () => {
    const p = spawnSync(
      process.execPath,
      [join(source, 'run.mjs'), '--plan', 'sample'],
      { encoding: 'utf8' }
    );
    assert.equal(p.status, 2, p.stderr);
    assert.equal(JSON.parse(p.stdout).recording, 'not-run');
  }
);
