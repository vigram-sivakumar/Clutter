import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import { createInterface } from 'node:readline';
const base = mkdtempSync(join(tmpdir(), 'clutter-durable-')),
  results = [],
  owners = new Set(),
  children = new Set();
const contract = JSON.parse(readFileSync('durable/contract.json', 'utf8'));
const output = process.env.DURABLE_RESULT ?? 'artifacts/durable-results.json';
let profile, browser;
function deadline(p, ms = 12000) {
  let t;
  return Promise.race([
    p,
    new Promise((_, rej) => (t = setTimeout(() => rej(Error('TIMEOUT')), ms))),
  ]).finally(() => clearTimeout(t));
}
async function owner(dir, { init = false, expectedError = false } = {}) {
  const child = spawn(
    process.execPath,
    ['durable/owner.mjs', '--store', dir, ...(init ? ['--init'] : [])],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
  );
  children.add(child);
  let stderr = '';
  child.stderr.on('data', (b) => (stderr += b));
  child.stdout.resume();
  const messages = [],
    waiters = [];
  child.on('message', (m) => {
    messages.push(m);
    for (const w of [...waiters])
      if (w.p(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.r(m);
      }
  });
  child.on('exit', () => {
    children.delete(child);
    for (const w of waiters.splice(0)) w.j(Error('OWNER_EXIT ' + stderr));
  });
  const next = (p) => {
    const x = messages.find(p);
    if (x) return Promise.resolve(x);
    return deadline(new Promise((r, j) => waiters.push({ p, r, j })));
  };
  const ready = await next((m) => ['ready', 'startup_error'].includes(m.type));
  if (ready.type === 'startup_error') {
    await deadline(once(child, 'exit').catch(() => {}));
    if (expectedError) return { error: ready.error };
    throw Error(ready.error);
  }
  if (expectedError) {
    child.kill('SIGKILL');
    throw Error('EXPECTED_OWNER_REFUSAL');
  }
  profile = ready.profile;
  const o = {
    ...ready,
    child,
    dir,
    next,
    env: {
      ...process.env,
      CLUTTER_LAB_RELAY_URL: ready.url,
      CLUTTER_LAB_RELAY_TOKEN: ready.token,
    },
    base: { spaceId: ready.spaceId, documentId: ready.documentId },
    async control(type, extra = {}) {
      const id = randomUUID();
      child.send({ type, id, ...extra });
      const r = await next((m) => m.id === id);
      if (r.type === 'control_error') throw Error(r.error);
    },
    async stop(signal = 'SIGKILL') {
      owners.delete(o);
      const p = once(child, 'exit');
      child.kill(signal);
      await deadline(p);
    },
    async rpc(c) {
      let r;
      try {
        r = await fetch(ready.url, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + ready.token,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ...o.base, ...c }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        return { ok: false, error: 'TRANSPORT_OUTCOME_UNKNOWN' };
      }
      return r.json();
    },
    async read() {
      const r = await o.rpc({ method: 'read' });
      assert.equal(r.ok, true);
      return r.result;
    },
  };
  owners.add(o);
  return o;
}
async function fresh() {
  return owner(mkdtempSync(join(base, 'store-')), { init: true });
}
function insert(version = 0, text = 'X', operationId = randomUUID()) {
  return {
    method: 'insert',
    operationId,
    expectedVersion: version,
    target: 'Alpha',
    offset: 0,
    text,
  };
}
async function runCli(o, c) {
  const p = spawn(process.execPath, ['durable/cli.mjs'], {
    env: o.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '',
    err = '';
  p.stdout.on('data', (b) => (out += b));
  p.stderr.on('data', (b) => (err += b));
  p.stdin.end(JSON.stringify({ ...o.base, ...c }));
  const [code] = await deadline(once(p, 'exit'));
  return { ...JSON.parse(out), exitCode: code, stderr: err };
}
async function mcp(o) {
  const p = spawn(process.execPath, ['durable/mcp.mjs'], {
    env: o.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.add(p);
  p.stderr.resume();
  const pending = new Map();
  let id = 0;
  createInterface({ input: p.stdout }).on('line', (l) => {
    const r = JSON.parse(l);
    pending.get(r.id)?.(r);
    pending.delete(r.id);
  });
  const send = async (method, params) => {
    const i = ++id;
    const wait = deadline(new Promise((r) => pending.set(i, r)));
    p.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'
    );
    return wait;
  };
  await send('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'durable-test', version: '1' },
  });
  p.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      '\n'
  );
  return {
    send,
    notify(method, params) {
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    },
    async call(c) {
      const r = await send('tools/call', {
        name: 'lab_command',
        arguments: { ...o.base, ...c },
      });
      assert.ok(!r.error);
      return {
        ok: !r.result.isError,
        result: JSON.parse(r.result.content[0].text),
      };
    },
    async close() {
      const ex = once(p, 'exit');
      p.stdin.end();
      await deadline(ex);
      children.delete(p);
    },
  };
}
async function pass(id, fn) {
  try {
    const detail = await fn();
    results.push({ id, status: 'pass', detail });
    console.log(id + ' pass');
  } catch (e) {
    results.push({ id, status: 'fail', error: e.stack });
    console.error(id + ' FAIL ' + e.stack);
    throw e;
  }
}
async function reopen(o) {
  const dir = o.dir;
  await o.stop();
  return owner(dir);
}
async function expectError(o, c, error) {
  const r = await o.rpc(c);
  assert.equal(r.ok, false);
  assert.equal(r.error, error);
}
function stateText(s) {
  return JSON.stringify(s);
}
try {
  await pass('DO-01', async () => {
    const o = await fresh();
    assert.equal(o.profile.pragmas.journal_mode, 'wal');
    assert.equal(o.profile.pragmas.synchronous, 2);
    assert.equal(o.profile.pragmas.locking_mode, 'exclusive');
    assert.equal(
      (await owner(o.dir, { expectedError: true })).error,
      'OWNER_BUSY'
    );
    o.child.kill('SIGSTOP');
    try {
      assert.equal(
        (await owner(o.dir, { expectedError: true })).error,
        'OWNER_BUSY'
      );
    } finally {
      o.child.kill('SIGCONT');
    }
    const oldToken = o.token,
      n = await reopen(o);
    assert.notEqual(n.ownerEpoch, o.ownerEpoch);
    assert.notEqual(n.token, oldToken);
    const r = await fetch(n.url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + oldToken,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    assert.equal(r.status, 403);
    const foreign = await fetch(n.url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + n.token,
        'content-type': 'application/json',
        origin: 'https://example.com',
      },
      body: '{}',
    });
    assert.equal(foreign.status, 403);
    await n.stop();
    return {
      profile,
      secondOwner: 'denied live and SIGSTOP-paused',
      rotatedCapability: true,
    };
  });
  await pass('DO-02', async () => {
    const o = await fresh();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
      args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    });
    const page = await browser.newPage();
    await page.goto(
      o.url.replace('/rpc', '/') +
        '#' +
        encodeURIComponent(JSON.stringify({ token: o.token, ...o.base }))
    );
    await page.waitForFunction(() => window.proof?.version === 0);
    assert.equal(new URL(page.url()).hash, '');
    await page.locator('#draft').fill('Desktop ');
    await page.locator('#save').click();
    await page.waitForFunction(() => window.proof.version === 1);
    const cli = await runCli(o, insert(1, 'CLI '));
    assert.equal(cli.ok, true);
    await page.waitForFunction(() => window.proof.version === 2);
    const m = await mcp(o);
    const list = await m.send('tools/list', {});
    assert.equal(list.result.tools[0].name, 'lab_command');
    const mr = await m.call(insert(2, 'MCP '));
    assert.equal(mr.ok, true);
    await page.waitForFunction(() => window.proof.version === 3);
    assert.equal(
      await page.locator('#a').textContent(),
      await page.locator('#b').textContent()
    );
    assert.match(
      await page.locator('#a').textContent(),
      /Desktop CLI MCP Alpha/
    );
    // MCP mutation notification must have no effect.
    m.notify('tools/call', {
      name: 'lab_command',
      arguments: { ...o.base, ...insert(3, 'FORBIDDEN') },
    });
    await m.send('ping', {});
    await m.close();
    const read = await o.read();
    assert.equal(read.version, 3);
    await page.close();
    await o.stop();
    return {
      interfaces: [
        'browser two projections',
        'CLI child process',
        'MCP stdio child process',
      ],
      committedVersion: 3,
    };
  });
  for (const [id, phase] of [
    ['DO-03', 'before_begin'],
    ['DO-04', 'after_revision'],
    ['DO-05', 'after_outcome'],
    ['DO-06', 'before_commit'],
    ['DO-07', 'after_commit'],
  ])
    await pass(id, async () => {
      let o = await fresh();
      const c =
        phase === 'before_commit'
          ? {
              method: 'attach',
              operationId: randomUUID(),
              expectedVersion: 0,
              attachmentId: 'large-fixture',
              name: 'bytes.bin',
              mime: 'application/octet-stream',
              base64: Buffer.alloc(240000, 123).toString('base64'),
            }
          : insert();
      await o.control('checkpoint');
      const beforeWal = statSync(join(o.dir, 'vault.sqlite-wal')).size;
      assert.equal(beforeWal, 0);
      await o.control('fault', { phase, operationId: c.operationId });
      const request = o.rpc(c);
      await o.next((m) => m.type === 'phase' && m.phase === phase);
      let walBytes;
      if (phase === 'before_commit') {
        walBytes = statSync(join(o.dir, 'vault.sqlite-wal')).size;
        assert.ok(
          walBytes > 32 + 24 + 4096,
          'uncommitted WAL frames must exist'
        );
      }
      const dir = o.dir;
      await o.stop();
      const lost = await request;
      assert.equal(lost.error, 'TRANSPORT_OUTCOME_UNKNOWN');
      o = await owner(dir);
      const applied = phase === 'after_commit';
      assert.equal((await o.read()).version, applied ? 1 : 0);
      const lookup = await o.rpc({
        method: 'outcome',
        operationId: c.operationId,
      });
      assert.equal(lookup.ok, true);
      assert.equal(lookup.result?.status ?? null, applied ? 'applied' : null);
      const retry = await o.rpc(c);
      assert.equal(retry.result.status, 'applied');
      assert.equal(retry.result.version, 1);
      assert.equal((await o.read()).version, 1);
      if (applied) assert.deepEqual(retry.result, lookup.result);
      const v = await o.rpc({ method: 'read_version', version: 0 });
      assert.ok(stateText(v.result.state).includes('Alpha beta'));
      await o.stop();
      return {
        observedPhase: phase,
        signal: 'SIGKILL',
        postRestartVersionBeforeRetry: applied ? 1 : 0,
        checkpointWalBytes: beforeWal,
        walBytes,
        receiptStable: true,
      };
    });
  await pass('DO-08', async () => {
    let o = await fresh();
    const c = insert();
    await o.control('drop_reply');
    const r = await runCli(o, c);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'TRANSPORT_OUTCOME_UNKNOWN');
    o = await reopen(o);
    const m = await mcp(o),
      found = await m.call({ method: 'outcome', operationId: c.operationId }),
      retry = await m.call(c);
    assert.deepEqual(found.result, retry.result);
    assert.equal(retry.result.version, 1);
    assert.equal((await o.read()).version, 1);
    await m.close();
    const page = await browser.newPage();
    await page.goto(
      o.url.replace('/rpc', '/') +
        '#' +
        encodeURIComponent(JSON.stringify({ token: o.token, ...o.base }))
    );
    await page.waitForFunction(() => window.proof?.version === 1);
    await o.control('drop_reply');
    await page.locator('#draft').fill('Unknown desktop ');
    await page.locator('#save').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#save').textContent ===
        'Retry unresolved operation'
    );
    assert.equal(await page.locator('#draft').isDisabled(), true);
    await page.locator('#save').click();
    await page.waitForFunction(
      () => document.querySelector('#draft').disabled === false
    );
    assert.equal((await o.read()).version, 2);
    await page.close();
    await o.stop();
    return {
      lostReply: 'CLI unknown',
      resolvedBy: 'MCP after restart',
      duplicateEffects: 0,
    };
  });
  await pass('DO-09', async () => {
    let o = await fresh();
    await o.control('lose_commit_return');
    const c = insert(),
      r = await o.rpc(c);
    assert.equal(r.result.status, 'uncertain');
    assert.equal(r.result.reason, 'INJECTED_LOST_COMMIT_RETURN');
    o = await reopen(o);
    const found = await o.rpc({
      method: 'outcome',
      operationId: c.operationId,
    });
    assert.equal(found.result.status, 'applied');
    assert.deepEqual((await o.rpc(c)).result, found.result);
    await o.stop();
    return {
      injection:
        'after real COMMIT, synthetic lost return; not VFS/I/O failure',
    };
  });
  await pass('DO-10', async () => {
    const o = await fresh(),
      a = insert(0, 'A'),
      b = insert(0, 'B'),
      rs = await Promise.all([o.rpc(a), o.rpc(b)]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(rs.find((r) => !r.ok).error, 'REVISION_CONFLICT');
    const winner = rs[0].ok ? a : b,
      receipt = rs.find((r) => r.ok).result;
    assert.deepEqual((await o.rpc(winner)).result, receipt);
    await expectError(o, { ...winner, text: 'changed' }, 'OPERATION_ID_REUSED');
    await expectError(o, { ...winner, spaceId: 'other' }, 'WRONG_DESTINATION');
    assert.equal((await o.read()).version, 1);
    const duplicate = insert(1, 'D');
    const two = await Promise.all([o.rpc(duplicate), o.rpc(duplicate)]);
    assert.equal(two[0].ok, true);
    assert.deepEqual(two[0], two[1]);
    assert.equal((await o.read()).version, 2);
    await o.stop();
    return {
      concurrentDuplicateEffects: 1,
      sameBaseConcurrentWinners: 1,
      changedDuplicate: 'rejected',
      retryBeforeStaleRevision: true,
    };
  });
  await pass('DO-11', async () => {
    let o = await fresh();
    const before = await o.read(),
      draft = structuredClone(before.state);
    draft.doc.content[0].content[0].text = 'Protected unaccepted typing';
    const c = {
      method: 'protect',
      operationId: randomUUID(),
      contextId: 'A',
      generation: 1,
      baseVersion: 0,
      state: draft,
    };
    // Kill inside the separate protection transaction first: nothing was acknowledged.
    await o.control('fault', {
      phase: 'after_protection',
      operationId: c.operationId,
    });
    const uncommitted = o.rpc(c);
    await o.next((m) => m.type === 'phase' && m.phase === 'after_protection');
    const uncommittedDir = o.dir;
    await o.stop();
    await uncommitted;
    o = await owner(uncommittedDir);
    assert.equal((await o.rpc({ method: 'list_recovery' })).result.length, 0);
    assert.equal(
      (await o.rpc({ method: 'outcome', operationId: c.operationId })).result,
      null
    );
    assert.equal((await o.rpc(c)).result.status, 'protected');
    assert.equal((await o.read()).version, 0);
    await expectError(
      o,
      {
        method: 'restore_protection',
        operationId: randomUUID(),
        expectedVersion: 0,
        contextId: 'A',
        generation: 1,
      },
      'RECOVERY_LIVE_OWNED'
    );
    const dir = o.dir;
    await o.stop();
    o = await owner(dir);
    const list = await o.rpc({ method: 'list_recovery' });
    assert.equal(list.result[0].liveOwned, false);
    assert.deepEqual(list.result[0].state, draft);
    assert.deepEqual((await o.read()).state, before.state);
    assert.equal(
      (
        await o.rpc({
          method: 'restore_protection',
          operationId: randomUUID(),
          expectedVersion: 0,
          contextId: 'A',
          generation: 1,
        })
      ).result.version,
      1
    );
    assert.deepEqual((await o.read()).state, draft);
    assert.equal((await o.rpc({ method: 'list_recovery' })).result.length, 0);
    await o.stop();
    return {
      uncommittedProtectionRolledBack: true,
      committedProtectionSurvivesKill: true,
      automaticRestore: false,
      explicitRestoreVersion: 1,
    };
  });
  await pass('DO-12', async () => {
    let o = await fresh();
    const read = await o.read(),
      p = (g) => ({
        method: 'protect',
        operationId: randomUUID(),
        contextId: 'A',
        generation: g,
        baseVersion: 0,
        state: read.state,
      });
    assert.equal((await o.rpc(p(1))).ok, true);
    assert.equal((await o.rpc(p(2))).ok, true);
    await o.rpc({
      method: 'release_protection',
      operationId: randomUUID(),
      contextId: 'A',
      throughGeneration: 1,
      ownerEpoch: o.ownerEpoch,
    });
    assert.equal(
      (await o.rpc({ method: 'list_recovery' })).result[0].generation,
      2
    );
    await expectError(o, p(1), 'STALE_RECOVERY_GENERATION');
    await o.rpc({
      method: 'release_protection',
      operationId: randomUUID(),
      contextId: 'A',
      throughGeneration: 2,
      ownerEpoch: o.ownerEpoch,
    });
    o = await reopen(o);
    await expectError(o, p(2), 'STALE_RECOVERY_GENERATION');
    assert.equal((await o.rpc({ method: 'list_recovery' })).result.length, 0);
    assert.equal((await o.read()).version, 0);
    await o.stop();
    return { staleCleanupPreservesNewer: true, tombstoneSurvivesRestart: true };
  });
  await pass('DO-13', async () => {
    let o = await fresh();
    const draft = (await o.read()).state;
    draft.doc.content[0].content[0].text = 'Protected older branch';
    await o.rpc({
      method: 'protect',
      operationId: randomUUID(),
      contextId: 'A',
      generation: 1,
      baseVersion: 0,
      state: draft,
    });
    await o.rpc(insert());
    o = await reopen(o);
    await expectError(
      o,
      {
        method: 'restore_protection',
        operationId: randomUUID(),
        expectedVersion: 1,
        contextId: 'A',
        generation: 1,
      },
      'RECOVERY_CONFLICT'
    );
    assert.deepEqual(
      (await o.rpc({ method: 'list_recovery' })).result[0].state,
      draft
    );
    assert.equal((await o.read()).version, 1);
    await o.stop();
    return { staleDraftPreserved: true, newCanonicalUnchanged: true };
  });
  await pass('DO-14', async () => {
    let o = await fresh();
    await o.rpc({
      method: 'pin_version',
      operationId: randomUUID(),
      version: 0,
    });
    const c = {
      method: 'task_update',
      operationId: randomUUID(),
      expectedVersion: 0,
      taskId: 't1',
      completed: true,
      properties: { Due: { type: 'date', value: '2026-11-15' } },
    };
    await o.control('fault', {
      phase: 'before_reply',
      operationId: c.operationId,
    });
    const pending = o.rpc(c);
    await o.next((m) => m.type === 'phase' && m.phase === 'before_reply');
    const dir = o.dir;
    await o.stop();
    await pending;
    o = await owner(dir);
    const current = await o.read(),
      task = current.state.doc.content[2];
    assert.equal(task.attrs.id, 't1');
    assert.equal(task.attrs.completed, true);
    assert.deepEqual(task.attrs.properties, c.properties);
    assert.equal(task.content[0].content[0].text, 'Send proposal');
    const old = await o.rpc({ method: 'read_version', version: 0 });
    assert.equal(old.result.pinned, true);
    assert.equal(old.result.state.doc.content[2].attrs.completed, false);
    const restore = await o.rpc({
      method: 'restore_version',
      operationId: randomUUID(),
      expectedVersion: 1,
      version: 0,
    });
    assert.equal(restore.result.version, 2);
    assert.deepEqual((await o.read()).state, old.result.state);
    assert.equal(
      (await o.rpc({ method: 'read_version', version: 1 })).result.state.doc
        .content[2].attrs.completed,
      true
    );
    await o.stop();
    return {
      pinnedVersion: 0,
      taskUpdateVersion: 1,
      restoredAsNewVersion: 2,
      multiNoteMoves: 'not qualified',
    };
  });
  await pass('DO-15', async () => {
    let o = await fresh();
    const c = {
      method: 'attach',
      operationId: randomUUID(),
      expectedVersion: 0,
      attachmentId: 'image-1',
      name: 'tiny.png',
      mime: 'image/png',
      base64: Buffer.from('synthetic blob; not a decoded image').toString(
        'base64'
      ),
    };
    assert.equal((await o.rpc(c)).ok, true);
    await o.rpc({
      method: 'pin_version',
      operationId: randomUUID(),
      version: 1,
    });
    await o.rpc({
      method: 'remove_attachment',
      operationId: randomUUID(),
      expectedVersion: 1,
      attachmentId: 'image-1',
    });
    o = await reopen(o);
    assert.equal((await o.read()).state.attachments.length, 0);
    const old = await o.rpc({ method: 'read_version', version: 1 });
    assert.equal(old.result.state.attachments[0].id, 'image-1');
    assert.equal(old.result.pinned, true);
    await o.stop();
    return {
      storage: 'tiny synthetic BLOB in same SQLite transaction',
      externalFileOrdering: 'not qualified',
      mediaDecodeRender: 'not qualified',
    };
  });
  await pass('DO-16', async () => {
    const o = await fresh();
    await o.rpc(insert());
    const c = {
      method: 'attach',
      operationId: randomUUID(),
      expectedVersion: 1,
      attachmentId: 'asset',
      name: 'x',
      mime: 'test/plain',
      base64: Buffer.from('blob').toString('base64'),
    };
    await o.rpc(c);
    const dir = o.dir;
    await o.stop();
    const cases = [
      [
        'root',
        (db) => db.exec("UPDATE revisions SET state='{}' WHERE version=2"),
        'BROKEN_REVISION',
      ],
      [
        'receipt',
        (db) => db.exec('DELETE FROM outcomes WHERE version=1'),
        'BROKEN_RECEIPT_CLOSURE',
      ],
      ['blob', (db) => db.exec('DELETE FROM blobs'), 'BROKEN_BLOB_CLOSURE'],
      [
        'changed-blob',
        (db) => db.exec("UPDATE blobs SET bytes=X'00'"),
        'BROKEN_BLOB_CLOSURE',
      ],
      [
        'schema',
        (db) => db.exec('PRAGMA user_version=999'),
        'UNSUPPORTED_SCHEMA',
      ],
    ];
    const outcomes = [];
    for (const [name, damage, error] of cases) {
      const copy = join(base, 'damage-' + name);
      cpSync(dir, copy, { recursive: true });
      const db = new DatabaseSync(join(copy, 'vault.sqlite'));
      damage(db);
      db.close();
      const failed = await owner(copy, { expectedError: true });
      assert.equal(failed.error, error);
      outcomes.push({ damage: name, error });
    }
    const missing = join(base, 'missing');
    cpSync(dir, missing, { recursive: true });
    const { unlinkSync } = await import('node:fs');
    unlinkSync(join(missing, 'vault.sqlite'));
    assert.equal(
      (await owner(missing, { expectedError: true })).error,
      'DATABASE_MISSING'
    );
    const nonempty = join(base, 'nonempty');
    mkdirSync(nonempty);
    writeFileSync(join(nonempty, 'keep.txt'), 'preserve');
    assert.equal(
      (await owner(nonempty, { init: true, expectedError: true })).error,
      'INIT_REQUIRES_EMPTY_DIRECTORY'
    );
    assert.equal(readFileSync(join(nonempty, 'keep.txt'), 'utf8'), 'preserve');
    return { failClosed: outcomes, noFallback: true };
  });
  await pass('DO-17', async () => {
    let o = await fresh();
    await o.control('page_limit', { value: 'current' });
    const c = {
      method: 'attach',
      operationId: randomUUID(),
      expectedVersion: 0,
      attachmentId: 'full',
      name: 'large',
      mime: 'application/octet-stream',
      base64: Buffer.alloc(240000, 61).toString('base64'),
    };
    const r = await o.rpc(c);
    assert.equal(r.ok, false);
    assert.match(r.error, /full/i);
    assert.equal((await o.read()).version, 0);
    assert.equal(
      (await o.rpc({ method: 'outcome', operationId: c.operationId })).result,
      null
    );
    await o.control('page_limit', { value: 100000 });
    assert.equal((await o.rpc(c)).result.version, 1);
    o = await reopen(o);
    assert.equal((await o.read()).version, 1);
    await o.stop();
    return {
      fault: 'real SQLITE_FULL via max_page_count',
      physicalENOSPC: false,
      rollbackAndRetry: true,
    };
  });
  await pass('DO-18', async () => {
    let o = await fresh();
    const page = await browser.newPage();
    await page.goto(
      o.url.replace('/rpc', '/') +
        '#' +
        encodeURIComponent(JSON.stringify({ token: o.token, ...o.base }))
    );
    await page.waitForFunction(() => window.proof?.version === 0);
    await o.control('drop_hints', { value: true });
    const c = insert();
    assert.equal((await runCli(o, c)).ok, true);
    // Drain explicit browser work; assert old projection before deliberate resync.
    assert.equal(await page.evaluate(() => window.proof.version), 0);
    await page.locator('#resync').click();
    await page.waitForFunction(() => window.proof.version === 1);
    assert.equal(
      await page.locator('#a').textContent(),
      await page.locator('#b').textContent()
    );
    o = await reopen(o);
    await page.goto(
      o.url.replace('/rpc', '/') +
        '#' +
        encodeURIComponent(JSON.stringify({ token: o.token, ...o.base }))
    );
    await page.waitForFunction(() => window.proof?.version === 1);
    assert.match(await page.locator('#a').textContent(), /XAlpha/);
    await page.close();
    await o.stop();
    return { droppedHint: true, resyncAndOwnerRestart: true };
  });
  assert.deepEqual(
    results.map((r) => r.id),
    contract.cases.map((c) => c.id)
  );
} catch (e) {
  process.exitCode = 1;
} finally {
  for (const o of owners)
    try {
      await o.stop();
    } catch {}
  for (const c of children) c.kill('SIGKILL');
  await browser?.close();
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        date: '2026-11-14',
        contract: 'durable/contract.json',
        contractRevision: contract.revision,
        profile,
        scope: contract.scope,
        results,
        counts: {
          pass: results.filter((r) => r.status === 'pass').length,
          fail: results.filter((r) => r.status === 'fail').length,
          notRun: contract.cases.length - results.length,
        },
        limitations: contract.excluded,
      },
      null,
      2
    ) + '\n'
  );
  console.log('Report: ' + output);
}
