// Headless regression of unchanged snapshot/joined profiles through Store hooks.
// This does not replace or relabel the browser suites blocked in this environment.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { owner, cli, mcp } from './entity-support.mjs';
const base = mkdtempSync(join(tmpdir(), 'clutter-media-ports-')),
  results = [];
const success = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.result;
};
try {
  for (const [profile, entry, mcpEntry] of [
    ['snapshot', 'durable/owner.mjs', 'durable/mcp.mjs'],
    ['joined', 'joined/owner.mjs', 'joined/mcp.mjs'],
  ]) {
    const dir = mkdtempSync(join(base, profile + '-'));
    let o = await owner(dir, { init: true, entry }),
      adapter;
    try {
      adapter = await mcp(o, { entry: mcpEntry });
      const before = await o.read();
      assert.equal(before.version, 0);
      const c = {
        method: 'insert',
        operationId: randomUUID(),
        expectedVersion: 0,
        target: 'Alpha',
        offset: 0,
        text: 'PORT-REGRESSION ',
      };
      const receipt = success(await cli(o, c));
      assert.equal(receipt.version, 1);
      assert.deepEqual(success(await o.rpc(c)), receipt);
      assert.deepEqual(success(await adapter.command(c)), receipt);
      await o.control('fail_writes', { value: true });
      const fail = await o.rpc({
        ...c,
        operationId: randomUUID(),
        expectedVersion: 1,
      });
      assert.equal(fail.error, 'INJECTED_SAVE_FAILURE');
      assert.equal((await o.read()).version, 1);
      await o.control('fail_writes', { value: false });
      await o.control('lose_commit_return');
      const unknown = {
        ...c,
        operationId: randomUUID(),
        expectedVersion: 1,
        text: 'UNCERTAIN-PORT ',
      };
      assert.equal(success(await o.rpc(unknown)).status, 'uncertain');
      assert.equal(
        success(
          await o.rpc({ method: 'outcome', operationId: unknown.operationId })
        ).status,
        'applied'
      );
      assert.equal(success(await o.rpc(unknown)).version, 2);
      await adapter.stop();
      adapter = null;
      await o.stop();
      o = await owner(dir, { entry });
      const after = await o.read();
      assert.equal(after.version, 2);
      assert.match(JSON.stringify(after.state.doc), /PORT-REGRESSION/);
      assert.match(JSON.stringify(after.state.doc), /UNCERTAIN-PORT/);
      assert.deepEqual(success(await o.rpc(c)), receipt);
      results.push({
        profile,
        status: 'pass',
        checks: [
          'RPC/CLI/MCP one receipt',
          'failed write unchanged',
          'uncertain commit resolution',
          'restart closure',
        ],
      });
      console.log(profile, 'pass');
    } finally {
      if (adapter) await adapter.stop();
      await o.stop();
    }
  }
} catch (e) {
  process.exitCode = 1;
  results.push({ status: 'fail', error: e.stack });
  console.error(e.stack);
} finally {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/media22-ports-results.json',
    JSON.stringify(
      {
        scope:
          'Headless Store-port regression; no EditorView/browser pass inferred',
        results,
      },
      null,
      2
    ) + '\n'
  );
}
