import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { schemaNames } from '../instruments39/model.mjs';
const source = dirname(fileURLToPath(import.meta.url));
const xml =
  '<trace-query-result><node><schema><col><mnemonic>time</mnemonic><type>time</type></col><col><mnemonic>process</mnemonic><type>process</type></col><col><mnemonic>responsible-process</mnemonic><type>process</type></col></schema><row><time>1234567890</time><process id="1" fmt="PRIVATE NAME (21599)"><pid>21599</pid><path>/PRIVATE/PATH</path></process><process id="2"><pid>21600</pid></process><string>SECRET USER CONTENT</string></row><row><time>1234567891</time><process ref="1"/><process ref="unresolved"/></row></node></trace-query-result>';
function analyze(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'clutter-trace42-'));
  try {
    const path = join(dir, 'table.xml');
    writeFileSync(path, contents);
    return spawnSync('python3', [join(source, 'analyze.py'), path, '21599'], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('actual xctrace table/schema attributes are extracted, including order, quotes and duplicates', () => {
  assert.deepEqual(
    schemaNames(
      '<trace-toc><table foo="a" schema="process-info"/><table schema=\'hitches-frame-lifetimes\'/><table schema="process-info"/></trace-toc>'
    ),
    ['hitches-frame-lifetimes', 'process-info']
  );
});
test('old schema/name fixtures stay supported; comments/entities cannot invent availability', () => {
  assert.deepEqual(
    schemaNames(
      '<!-- <table schema="fake"/> --><schema name="tick"/><table badschema="no"/>'
    ),
    ['tick']
  );
  assert.throws(() => schemaNames('<!DOCTYPE x><table schema="x"/>'));
  assert.throws(() => schemaNames('<!ENTITY x "x">'));
});
test('typed process definitions and references summarize PIDs without copying names, paths or app strings', () => {
  const result = analyze(xml);
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.equal(value.rows, 2);
  assert.deepEqual(value.observedTypedProcessPids, [21599, 21600]);
  assert.equal(value.targetUiRows, 2);
  assert.equal(value.unresolvedProcessReferences, 1);
  assert.equal(value.possibleLinkColumns[0].mnemonic, 'responsible-process');
  assert(!result.stdout.includes('PRIVATE'));
  assert(!result.stdout.includes('SECRET'));
  assert.equal(value.firstRowShapes[0][0].numericText, '1234567890');
});
test('generic integers are not inferred to be process IDs; empty tables are not timing evidence', () => {
  const result = analyze(
    '<trace-query-result><row><time>21599</time><uint64>21599</uint64></row></trace-query-result>'
  );
  assert.equal(result.status, 0);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value.observedTypedProcessPids, []);
  assert.equal(value.targetUiRows, 0);
  assert.match(value.interpretation, /not validated/);
});
test('malformed/entity/oversized exports are rejected without reflecting XML payload', () => {
  for (const value of [
    '<broken',
    '<!DOCTYPE x [<!ENTITY y "SECRET">]><row>&y;</row>',
    'x'.repeat(4 * 1024 * 1024 + 1),
  ]) {
    const result = analyze(value);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).status, 'xml-analysis-unavailable');
    assert(!result.stdout.includes('SECRET'));
  }
});
test(
  'non-Mac export runner refuses before reading or recording trace',
  { skip: process.platform === 'darwin' },
  () => {
    const p = spawnSync(
      process.execPath,
      [join(source, 'export.mjs'), '--capture', 'sample'],
      { encoding: 'utf8' }
    );
    assert.equal(p.status, 2, p.stderr);
    assert.equal(JSON.parse(p.stdout).recording, 'not-run');
  }
);
