import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { prosemirrorToYDoc } from 'y-prosemirror';
import * as Y from 'yjs';
import { schema } from '../src/schema.mjs';
import {
  owner,
  insert,
  cli,
  mcp,
  processes,
  openPage,
  edit,
  settle,
  snapshot,
  ownHistory,
} from './joined-support.mjs';
const contract = JSON.parse(readFileSync('../../joined-core-contract.json')),
  results = [],
  live = new Set();
let browser,
  profile,
  observations = [];
const output = process.env.JOINED_RESULT ?? 'artifacts/joined-results.json';
async function fresh() {
  const o = await owner();
  profile = o.profile;
  live.add(o);
  observations.push({ point: 'initial', ...(await o.control('inspect')) });
  const p = await openPage(browser, o);
  return { o, p };
}
async function close(o, p) {
  observations.push({
    point: 'final',
    ...(await o.control('inspect')),
    faultControls: o.controls.filter((c) => c.type !== 'inspect'),
  });
  assert.deepEqual(p.proofErrors, []);
  await p.close();
  await o.stop();
  live.delete(o);
}
async function replace(o) {
  const dir = o.dir;
  await o.stop();
  live.delete(o);
  const n = await owner(dir, false, false, new URL(o.url).port);
  live.add(n);
  observations.push({ point: 'restart', ...(await n.control('inspect')) });
  return n;
}
async function run(id, f) {
  observations = [];
  try {
    const detail = await f();
    results.push({
      id,
      case_id: id,
      status: 'pass',
      source_manifest: 'candidate-manifest.json',
      codec_version: 'clutter-r08-y-state-v1',
      runtime_and_sqlite_profile: 'profile',
      os_filesystem: 'profile.osRelease/filesystemType',
      fixture_ids_and_hashes: observations,
      operation_ids: [
        ...new Set(
          observations.flatMap((o) =>
            (o.outcomes ?? []).map((r) => r.operation_id)
          )
        ),
      ],
      fault_phase: observations.flatMap((o) => o.faultControls ?? []),
      before_after_revisions_roots_outcomes: observations,
      expected: contract.cases.find((c) => c.id === id).expected,
      actual: detail,
      limitations: [
        'Synthetic Linux fixture; not native/production/full security or model acceptance.',
      ],
      detail,
    });
    console.log(id + ' pass');
  } catch (e) {
    results.push({
      id,
      case_id: id,
      status: 'fail',
      error: e.stack,
      observations,
    });
    console.error(id + ' FAIL ' + e.stack);
    throw e;
  }
}
let runnerError = null;
const text = (s) => JSON.stringify(s);
async function equal(p) {
  const s = await snapshot(p);
  assert.deepEqual(s.contexts.A.doc, s.doc);
  assert.deepEqual(s.contexts.B.doc, s.doc);
  return s;
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
  });
  await run('JG-01', async () => {
    let { o, p } = await fresh();
    const ids = o.base;
    await edit(p, 'A', 'Persisted ');
    let s = await equal(p);
    assert.equal(s.version, 1);
    const before = (await o.rpc({ method: 'read' })).result;
    const payloadHash = createHash('sha256')
      .update(before.state.payload)
      .digest('hex');
    o = await replace(o);
    await p.close();
    p = await openPage(browser, o);
    s = await equal(p);
    assert.match(text(s.doc), /Persisted Alpha/);
    assert.deepEqual(o.base, ids);
    assert.equal(
      (await o.rpc({ method: 'read' })).result.state.payload,
      before.state.payload
    );
    const dir = o.dir;
    await close(o, p);
    const db = new DatabaseSync(dir + '/vault.sqlite');
    const rows = db
      .prepare('SELECT typeof(state) AS type,state FROM revisions')
      .all();
    assert.ok(
      rows.every(
        (r) =>
          r.type === 'blob' &&
          !Buffer.from(r.state).includes(Buffer.from('"type":"doc"'))
      )
    );
    db.close();
    return {
      codec: before.codec,
      version: 1,
      rootHash: payloadHash,
      sqliteBlobOnly: true,
      stableIds: ids,
    };
  });
  await run('JG-02', async () => {
    const { o, p } = await fresh();
    const before = (await o.rpc({ method: 'read' })).result;
    await o.control('fail_writes', { value: true });
    await edit(p, 'A', 'Uncommitted ');
    await settle(p);
    const s = await p.evaluate(() => window.originLab.snapshot());
    assert.equal(s.version, 0);
    assert.match(text(s.contexts.A.doc), /Uncommitted Alpha/);
    assert.deepEqual(s.contexts.B.doc, s.doc);
    assert.deepEqual(
      (await o.rpc({ method: 'read' })).result.state,
      before.state
    );
    const pending = await p.evaluate(() => window.joined.pending().A[0]);
    assert.equal(
      (await o.rpc({ method: 'outcome', operationId: pending.operationId }))
        .result,
      null
    );
    await o.control('fail_writes', { value: false });
    await p.evaluate(() => window.joined.resume('A'));
    assert.equal((await equal(p)).version, 1);
    await ownHistory(p, 'A', 'undo');
    assert.equal(text((await equal(p)).doc).includes('Uncommitted'), false);
    await close(o, p);
    return {
      acceptedBeforeCommit: false,
      provisionalPreserved: true,
      historyAfterRetry: true,
    };
  });
  await run('JG-03', async () => {
    const variations = [];
    for (const phase of ['before_commit', 'after_commit', 'before_reply']) {
      let { o, p } = await fresh();
      await p.evaluate(() => window.originLab.pause('A'));
      await edit(p, 'A', 'Crash ');
      const c = await p.evaluate(() => window.joined.pending().A[0]);
      await o.control('fault', { phase, operationId: c.operationId });
      const started = p.evaluate(() => {
        window.joined.resume('A').catch(() => {});
      });
      await started;
      await o.next((m) => m.type === 'phase' && m.phase === phase);
      o = await replace(o);
      await p.evaluate((d) => window.joined.reconnect(d), o.descriptor());
      await p.evaluate(() => window.joined.resume('A'));
      const s = await equal(p);
      assert.equal(s.version, 1);
      assert.equal(text(s.doc).split('Crash ').length - 1, 1);
      const receipt = (
        await o.rpc({ method: 'outcome', operationId: c.operationId })
      ).result;
      assert.equal(receipt.status, 'applied');
      assert.deepEqual((await o.rpc(c, 'A')).result, receipt);
      variations.push({ phase, operationId: c.operationId, version: 1 });
      await close(o, p);
    }
    const { o, p } = await fresh();
    await o.control('lose_commit_return');
    await edit(p, 'A', 'Uncertain ');
    assert.equal((await equal(p)).version, 1);
    assert.match(text((await snapshot(p)).doc), /Uncertain Alpha/);
    await o.control('lose_commit_return');
    const uncertain = insert(1, 'External-uncertain ');
    assert.equal((await o.rpc(uncertain)).result.status, 'uncertain');
    assert.equal(
      (await o.rpc(insert(2, 'BLOCKED '))).error,
      'COMMIT_OUTCOME_UNRESOLVED'
    );
    assert.equal(
      (await o.rpc({ method: 'outcome', operationId: uncertain.operationId }))
        .result.status,
      'applied'
    );
    assert.equal((await o.rpc(uncertain)).result.version, 2);
    await equal(p);
    await close(o, p);
    return { killPhases: variations, uncertainCommitResolved: true };
  });
  await run('JG-04', async () => {
    const { o, p } = await fresh();
    await Promise.all([edit(p, 'A', 'A '), edit(p, 'B', 'B ')]);
    let s = await equal(p);
    assert.match(text(s.doc), /A /);
    assert.match(text(s.doc), /B /);
    let r = await cli(o, insert(s.version, 'CLI '));
    assert.equal(r.ok, true);
    const m = await mcp(o);
    r = await m.call(insert(r.result.version, 'MCP '));
    assert.equal(r.ok, true);
    s = await equal(p);
    assert.match(text(s.doc), /CLI MCP Alpha/);
    const selections = await p.evaluate(() => {
      window.originLab.select('A', 'Alpha', 1);
      window.originLab.select('B', 'Gamma', 2);
      return window.originLab.snapshot().contexts;
    });
    assert.notEqual(selections.A.anchor, selections.B.anchor);
    await m.close();
    await close(o, p);
    return {
      realEditors: 2,
      subprocessInterfaces: ['CLI', 'MCP'],
      convergedVersion: s.version,
      selectionIndependent: true,
    };
  });
  await run('JG-05', async () => {
    const checks = [];
    {
      const { o, p } = await fresh();
      await edit(p, 'A', 'abcd');
      await settle(p);
      await p.evaluate(() => window.originLab.boundary('A'));
      let v = (await snapshot(p)).version;
      assert.equal(
        (await cli(o, { ...insert(v, 'FOREIGN'), target: 'abcd', offset: 2 }))
          .ok,
        true
      );
      await settle(p);
      await ownHistory(p, 'A', 'undo');
      let s = await equal(p);
      assert.match(text(s.doc), /FOREIGNAlpha/);
      assert.ok(!text(s.doc).includes('abFOREIGNcd'));
      await ownHistory(p, 'A', 'redo');
      assert.match(text((await equal(p)).doc), /abFOREIGNcdAlpha/);
      await p.evaluate(() => {
        window.originLab.detachView('A');
        window.originLab.detachView('B');
      });
      v = (await o.rpc({ method: 'read' })).result.version;
      await cli(o, { ...insert(v, 'WHILE-CLOSED '), target: 'Gamma' });
      await p.evaluate(async () => {
        await window.joined.authority.sync();
        window.originLab.attachView('A');
        window.originLab.attachView('B');
      });
      await ownHistory(p, 'A', 'undo');
      s = await equal(p);
      assert.match(text(s.doc), /FOREIGNAlpha/);
      assert.match(text(s.doc), /WHILE-CLOSED Gamma/);
      await ownHistory(p, 'A', 'redo');
      assert.match(text((await equal(p)).doc), /abFOREIGNcdAlpha/);
      await edit(p, 'A', 'AFTER ');
      await settle(p);
      await ownHistory(p, 'A', 'undo');
      assert.ok(!text((await equal(p)).doc).includes('AFTER '));
      await close(o, p);
      checks.push(
        'nested foreign text undo/redo, both-view destruction and later tracking'
      );
    }
    {
      const { o, p } = await fresh();
      await edit(p, 'A', 'AOWN');
      await settle(p);
      await p.evaluate(() => window.originLab.boundary('A'));
      await p.evaluate(() => window.originLab.select('B', 'Gamma', 0, 5));
      await p.keyboard.press('ControlOrMeta+b');
      await settle(p);
      await ownHistory(p, 'A', 'undo');
      const s = await equal(p);
      assert.ok(!text(s.doc).includes('AOWN'));
      assert.match(text(s.doc), /strong/);
      await close(o, p);
      checks.push('safe inverse after disjoint foreign formatting');
    }
    for (const axis of ['row', 'column']) {
      const { o, p } = await fresh();
      await p.evaluate(() => window.originLab.select('A', 'Four', 2));
      await p
        .locator('#origin-a button[data-table-handle="' + axis + '"]')
        .click();
      await settle(p);
      const beforeCount = await p.locator('#origin-a td').count();
      let v = (await snapshot(p)).version;
      await cli(o, insert(v, 'DISJOINT'));
      await settle(p);
      await ownHistory(p, 'A', 'undo');
      assert.equal(await p.locator('#origin-a td').count(), 4);
      assert.match(text((await equal(p)).doc), /DISJOINTAlpha/);
      await ownHistory(p, 'A', 'redo');
      await equal(p);
      assert.equal(await p.locator('#origin-a td').count(), beforeCount);
      await p
        .locator('#origin-b td')
        .nth(axis === 'row' ? 4 : 2)
        .click();
      await p.keyboard.insertText('FOREIGN-CELL');
      await settle(p);
      const before = await snapshot(p);
      await ownHistory(p, 'A', 'undo');
      const after = await equal(p);
      assert.deepEqual(after.doc, before.doc);
      assert.equal(
        after.contexts.A.historyWarning,
        'UNDO_BLOCKED_FOREIGN_TABLE_EDIT'
      );
      assert.match(text(after.doc), /FOREIGN-CELL/);
      await close(o, p);
      checks.push(
        axis + ' disjoint applied inverse and overlapping protective refusal'
      );
    }
    return { checks, protectiveRefusals: 2, acceptedInversesPersisted: true };
  });
  await run('JG-06', async () => {
    const { o, p } = await fresh();
    await p.evaluate(() => window.originLab.pause('A'));
    await edit(p, 'A', 'Protected-close ');
    await o.control('fail_protection', { value: true });
    const failure = await p.evaluate(async () => {
      try {
        await window.joined.close('A');
        return null;
      } catch (e) {
        return e.message;
      }
    });
    assert.equal(failure, 'INJECTED_SAVE_FAILURE');
    assert.equal(await p.evaluate(() => !!window.originLab.view('A')), true);
    assert.equal((await o.rpc({ method: 'list_recovery' })).result.length, 0);
    await o.control('fail_protection', { value: false });
    await p.evaluate(() => window.joined.close('A'));
    assert.equal(await p.evaluate(() => !!window.originLab.view('A')), false);
    const recovery = (await o.rpc({ method: 'list_recovery' })).result;
    assert.equal(recovery.length, 1);
    assert.match(text(recovery[0].state.doc), /Protected-close Alpha/);
    assert.equal((await o.rpc({ method: 'read' })).result.version, 0);
    await p.evaluate(() => window.originLab.attachView('A'));
    await p.evaluate(() => window.joined.resume('A'));
    assert.equal((await equal(p)).version, 1);
    await close(o, p);
    return {
      failedProtectionBlockedClose: true,
      durableDraftBeforeActualDetach: true,
    };
  });
  await run('JG-07', async () => {
    let { o, p } = await fresh();
    await p.evaluate(() => window.originLab.pause('A'));
    await edit(p, 'A', 'Older ');
    await p.evaluate(() => window.joined.protect('A'));
    await edit(p, 'A', 'Newer ');
    await p.evaluate(() => window.joined.protect('A'));
    const epoch = o.ownerEpoch;
    await p.evaluate(
      ({ epoch }) =>
        window.joined.rpc(
          {
            method: 'release_protection',
            operationId: crypto.randomUUID(),
            contextId: 'A',
            throughGeneration: 1,
            ownerEpoch: epoch,
          },
          'A'
        ),
      { epoch }
    );
    assert.equal(
      (await o.rpc({ method: 'list_recovery' })).result[0].generation,
      2
    );
    o = await replace(o);
    await p.evaluate((d) => window.joined.reconnect(d), o.descriptor());
    assert.equal(
      await p.evaluate(() => window.joined.authority.historyBoundary),
      'OWNER_RESTART'
    );
    assert.equal((await o.rpc({ method: 'read' })).result.version, 0);
    const r = await o.rpc({
      method: 'restore_protection',
      operationId: randomUUID(),
      expectedVersion: 0,
      contextId: 'A',
      generation: 2,
    });
    assert.equal(r.ok, true);
    await p.evaluate(() => window.joined.resume('A'));
    let s = await equal(p);
    assert.equal(s.version, 1);
    assert.match(text(s.doc), /Older Newer Alpha/);
    assert.equal((await o.rpc({ method: 'list_recovery' })).result.length, 0);
    await close(o, p);
    ({ o, p } = await fresh());
    await p.evaluate(() => window.originLab.pause('A'));
    await edit(p, 'A', 'Conflicting ');
    await p.evaluate(() => window.joined.protect('A'));
    await cli(o, insert(0, 'New-current '));
    o = await replace(o);
    await p.evaluate((d) => window.joined.reconnect(d), o.descriptor());
    const conflict = await o.rpc({
      method: 'restore_protection',
      operationId: randomUUID(),
      expectedVersion: 1,
      contextId: 'A',
      generation: 1,
    });
    assert.equal(conflict.error, 'RECOVERY_CONFLICT');
    assert.equal((await o.rpc({ method: 'list_recovery' })).result.length, 1);
    assert.match(
      text((await o.rpc({ method: 'read' })).result.state.doc),
      /New-current Alpha/
    );
    await close(o, p);
    return {
      newerGenerationPreserved: true,
      explicitRestoreOnce: true,
      staleBaseDraftPreserved: true,
      historyRestartBoundary: true,
    };
  });
  await run('JG-08', async () => {
    const { o, p } = await fresh();
    await o.control('drop_hints', { value: true });
    await p.evaluate(() => window.originLab.pause('A'));
    await edit(p, 'A', 'Pending ');
    const c = insert(0, 'Missed ');
    assert.equal((await cli(o, c)).ok, true);
    assert.equal((await cli(o, c)).ok, true);
    assert.equal(
      await p.evaluate(() => window.originLab.snapshot().version),
      0
    );
    await p.evaluate(() => window.joined.authority.sync());
    let s = await p.evaluate(() => window.originLab.snapshot());
    assert.match(text(s.contexts.A.doc), /Pending Alpha/);
    assert.match(text(s.contexts.B.doc), /Missed Alpha/);
    await p.evaluate(() => window.joined.resume('A'));
    s = await equal(p);
    assert.match(text(s.doc), /Pending /);
    assert.match(text(s.doc), /Missed /);
    assert.equal(s.version, 2);
    assert.equal((await settle(p)).pending.A, 0);
    await close(o, p);
    return {
      droppedHints: true,
      pendingInputSurvivedCatchup: true,
      duplicateEchoEffects: 0,
    };
  });
  await run('JG-09', async () => {
    const { o, p } = await fresh(),
      root = (await o.rpc({ method: 'read' })).result;
    const base = {
      method: 'editor_update',
      operationId: randomUUID(),
      contextId: 'A',
      baseVersion: 0,
      payload: root.state.payload,
    };
    const bad = [];
    for (const [name, c, id] of [
      ['public-token', base, undefined],
      ['forged-context', { ...base, contextId: 'B' }, 'A'],
      ['forged-origin', { ...base, origin: 'B' }, 'A'],
      [
        'malformed',
        { ...base, payload: Buffer.from('not Y state').toString('base64') },
        'A',
      ],
      ['oversize', { ...base, payload: 'A'.repeat(1100000) }, 'A'],
    ]) {
      const r = await o.rpc(c, id);
      assert.equal(r.ok, false, name);
      bad.push({ name, error: r.error });
    }
    for (const what of ['task-id', 'task-state', 'embed', 'extra-root']) {
      const d = new Y.Doc();
      Y.applyUpdate(d, Buffer.from(root.state.payload, 'base64'));
      const f = d.getXmlFragment('prosemirror');
      if (what === 'extra-root') d.getMap('extra').set('bad', 'payload');
      if (what === 'task-id')
        f.toArray()
          .find((n) => n.nodeName === 'task')
          .setAttribute('id', 't2');
      if (what === 'task-state')
        f.toArray()
          .find((n) => n.nodeName === 'task')
          .setAttribute('completed', 'bad');
      if (what === 'embed')
        f.toArray()
          .find((n) => n.nodeName === 'embed')
          .setAttribute('target', 'forged-target');
      const r = await o.rpc(
        {
          ...base,
          operationId: randomUUID(),
          payload: Buffer.from(Y.encodeStateAsUpdate(d)).toString('base64'),
        },
        'A'
      );
      d.destroy();
      assert.equal(r.ok, false, what);
      bad.push({ name: what, error: r.error });
    }
    {
      const d = new Y.Doc();
      Y.applyUpdate(d, Buffer.from(root.state.payload, 'base64'));
      d.getMap('extra').set('x', 'unexpected');
      const invalidState = {
        ...root.state,
        payload: Buffer.from(Y.encodeStateAsUpdate(d)).toString('base64'),
      };
      const r = await o.rpc(
        {
          method: 'protect',
          operationId: randomUUID(),
          contextId: 'A',
          baseVersion: 0,
          generation: 1,
          state: invalidState,
        },
        'A'
      );
      assert.equal(r.ok, false);
      assert.equal(r.error, 'UNSUPPORTED_Y_ROOT');
      assert.equal((await o.rpc({ method: 'list_recovery' })).result.length, 0);
      d.destroy();
      bad.push({ name: 'protection-extra-root', error: r.error });
    }
    assert.equal((await o.rpc({ method: 'read' })).result.version, 0);
    assert.deepEqual(
      (await o.rpc({ method: 'read' })).result.state,
      root.state
    );
    await edit(p, 'A', 'Valid-after-rejection ');
    assert.equal((await equal(p)).version, 1);
    await close(o, p);
    return { rejections: bad, validSubsequentEdit: true };
  });
  await run('JG-10', async () => {
    let { o, p } = await fresh();
    const c = insert(0, 'ONCE '),
      m = await mcp(o);
    const [a, b, d] = await Promise.all([
      p.evaluate((c) => window.joined.rpc(c), c),
      cli(o, c),
      m.call(c),
    ]);
    assert.deepEqual(a, b.result);
    assert.deepEqual(a, d.result);
    assert.equal((await equal(p)).version, 1);
    assert.equal(
      (await o.rpc({ ...c, text: 'changed' })).error,
      'OPERATION_ID_REUSED'
    );
    assert.equal(
      (await o.rpc({ ...c, spaceId: 'other' })).error,
      'WRONG_DESTINATION'
    );
    const denied = await owner(o.dir, false, true);
    assert.equal(denied.error, 'OWNER_BUSY');
    o.child.kill('SIGSTOP');
    try {
      assert.equal((await owner(o.dir, false, true)).error, 'OWNER_BUSY');
    } finally {
      o.child.kill('SIGCONT');
    }
    const oldToken = o.token;
    await m.close();
    o = await replace(o);
    const r = await fetch(o.url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + oldToken,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    assert.equal(r.status, 403);
    await p.evaluate((d) => window.joined.reconnect(d), o.descriptor());
    assert.deepEqual(
      (await o.rpc({ method: 'outcome', operationId: c.operationId })).result,
      a
    );
    assert.equal((await equal(p)).version, 1);
    await close(o, p);
    return {
      concurrentAdapters: 3,
      effects: 1,
      pausedOwnerExcluded: true,
      oldCapabilityDenied: true,
    };
  });
} catch (e) {
  runnerError = e.stack ?? e.message;
  console.error(runnerError);
  process.exitCode = 1;
} finally {
  for (const o of live)
    try {
      await o.stop();
    } catch {}
  for (const c of processes) c.kill('SIGKILL');
  await browser?.close();
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        date: '2026-11-14',
        codec: 'clutter-r08-y-state-v1',
        runnerError,
        profile,
        results,
        remaining: contract.cases
          .filter((c) => !results.some((r) => r.id === c.id))
          .map((c) => ({ id: c.id, status: 'not-run' })),
      },
      null,
      2
    ) + '\n'
  );
  console.log('Report ' + output);
}
