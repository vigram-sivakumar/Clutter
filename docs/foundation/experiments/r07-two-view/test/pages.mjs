import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import { noteSchema, taskSchema, parse } from '../entities/schema.mjs';
import { owner, cli, mcp } from './entity-support.mjs';
import * as aggregate from '../media/model.mjs';
import * as entities from '../entities/model.mjs';
import { Store } from '../durable/store.mjs';
import { document, paragraph, slot } from '../entities/schema.mjs';
const base = mkdtempSync(join(tmpdir(), 'clutter-pages-')),
  owners = new Set(),
  results = [],
  png = readFileSync('media/fixtures/tiny.png'),
  pdf = readFileSync('media/fixtures/tiny.pdf');
const contract = JSON.parse(readFileSync('../../page-partition-contract.json'));
let profile;
async function start(dir, { init = false, ...rest } = {}) {
  const o = await owner(dir, { init, entry: 'pages/owner.mjs', ...rest });
  if (o.child) owners.add(o);
  profile ??= o.profile;
  return o;
}
const fresh = () => start(mkdtempSync(join(base, 'store-')), { init: true });
const ok = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.result;
};
const refused = (r, error) => {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.error, error);
};
const rpc = async (o, c) => ok(await o.rpc(c));
const heads = (o) => rpc(o, { method: 'heads' });
const page = (o, pageId, version) =>
  rpc(
    o,
    version === undefined
      ? { method: 'page_current', pageId }
      : { method: 'page_read', pageId, version }
  );
async function withHeads(o, c, ids) {
  const h = await heads(o);
  return {
    ...c,
    operationId: c.operationId ?? randomUUID(),
    expectedHeads: Object.fromEntries(ids.map((id) => [id, h.heads[id]])),
  };
}
const move = async (o, from = 'n1', to = 'n2') =>
  withHeads(
    o,
    {
      method: 'move_task',
      taskId: 't1',
      fromNoteId: from,
      toNoteId: to,
      index: to === 'inbox' ? 0 : 1,
    },
    [...new Set([from, to].filter((id) => id !== 'inbox'))]
  );
const editNote = async (o, text = 'Changed note') =>
  withHeads(
    o,
    {
      method: 'edit_note',
      noteId: 'n1',
      body: document(paragraph('n1-p1', text), slot('t1')),
    },
    ['n1']
  );
const editTask = async (o, title = 'New task title') =>
  withHeads(
    o,
    {
      method: 'edit_task',
      taskId: 't1',
      title,
      body: document(paragraph('t1-p1', 'New task body')),
      properties: { DueDate: { type: 'date', value: '2026-12-01' } },
    },
    ['t1']
  );
const asset = async (
  o,
  {
    pageId = 't1',
    attachmentId = 'cover',
    bytes = png,
    mime = 'image/png',
    role = 'cover',
  } = {}
) =>
  withHeads(
    o,
    {
      method: 'import_asset',
      pageId,
      attachmentId,
      role,
      mime,
      name: 'fixture',
      base64: bytes.toString('base64'),
    },
    [pageId]
  );
const remove = async (o, attachmentId, pageId = 't1') =>
  withHeads(o, { method: 'remove_asset', attachmentId }, [pageId]);
async function snapshot(o, id, version, kind = 'pin_snapshot', pageId = 'n1') {
  return rpc(o, {
    method: kind,
    operationId: randomUUID(),
    snapshotId: id,
    pageId,
    version,
  });
}
const querySnapshot = (o, snapshotId) =>
  rpc(o, { method: 'read_snapshot', snapshotId });
async function run(id, fn) {
  try {
    const detail = await fn();
    results.push({
      id,
      title: contract.cases.find((c) => c.id === id).title,
      status: 'pass',
      detail,
    });
    console.log(id, 'pass');
  } catch (e) {
    results.push({ id, status: 'fail', error: e.stack });
    throw e;
  }
}
try {
  await run('PK-01', async () => {
    const o = await fresh(),
      h = await heads(o);
    assert.equal(Object.keys(h.heads).length, 5);
    const initial = await rpc(o, { method: 'metrics' });
    const contender = await start(o.dir, { expectedError: true });
    assert.equal(contender.error, 'OWNER_BUSY');
    const a = await page(o, 'n1'),
      b = await page(o, 'n1'),
      after = await rpc(o, { method: 'metrics' });
    assert.deepEqual(a, b);
    assert.equal(a.taskPreviews[0].taskId, 't1');
    assert.deepEqual(
      [
        ...new Set(
          after.decoded.slice(initial.decoded.length).map((r) => r.pageId)
        ),
      ].sort(),
      ['n1', 't1']
    );
    assert.equal((await page(o, 'n3')).taskPreviews[0].taskId, 't2');
    assert.equal(initial.encoded.length, 5);
    assert.ok(initial.decoded.length >= 5);
    await o.stop();
    const copy = join(base, 'bad-root');
    cpSync(o.dir, copy, { recursive: true });
    const db = new DatabaseSync(join(copy, 'vault.sqlite'));
    const row = db
      .prepare('SELECT root_hash,payload FROM page_roots LIMIT 1')
      .get();
    db.prepare('UPDATE page_roots SET payload=? WHERE root_hash=?').run(
      Buffer.from('unknown-root-codec'),
      row.root_hash
    );
    db.close();
    const bad = await start(copy, { expectedError: true });
    assert.equal(bad.error, 'BROKEN_PAGE_HASH');
    const readback = new DatabaseSync(join(copy, 'vault.sqlite'), {
      readOnly: true,
    });
    assert.equal(
      Buffer.from(
        readback
          .prepare('SELECT payload FROM page_roots WHERE root_hash=?')
          .get(row.root_hash).payload
      ).toString(),
      'unknown-root-codec'
    );
    readback.close();
    const future = join(base, 'future-codec');
    cpSync(o.dir, future, { recursive: true });
    const futureDb = new DatabaseSync(join(future, 'vault.sqlite'));
    futureDb.exec('PRAGMA foreign_keys=OFF');
    const original = futureDb.prepare('SELECT * FROM page_roots LIMIT 1').get(),
      unknown = Buffer.from('future-page-codec'),
      newHash = createHash('sha256').update(unknown).digest('hex');
    futureDb
      .prepare('UPDATE page_roots SET root_hash=?,payload=? WHERE root_hash=?')
      .run(newHash, unknown, original.root_hash);
    futureDb
      .prepare('UPDATE page_heads SET root_hash=? WHERE root_hash=?')
      .run(newHash, original.root_hash);
    futureDb
      .prepare('UPDATE page_changes SET root_hash=? WHERE root_hash=?')
      .run(newHash, original.root_hash);
    for (const row of futureDb
      .prepare('SELECT version,state FROM revisions')
      .all()) {
      const state = JSON.parse(row.state);
      for (const c of state.changes)
        if (c.hash === original.root_hash) c.hash = newHash;
      const serialized = (await import('../durable/model.mjs')).stable(state);
      futureDb
        .prepare('UPDATE revisions SET state=?,hash=? WHERE version=?')
        .run(
          serialized,
          createHash('sha256').update(serialized).digest('hex'),
          row.version
        );
    }
    futureDb.close();
    assert.equal(
      (await start(future, { expectedError: true })).error,
      'UNSUPPORTED_PAGE_CODEC'
    );
    return {
      pages: 5,
      headlessClients: 2,
      requestedReadDecoded: ['n1', 't1'],
      startupDeepDecodeCount: initial.decoded.length,
      corruptAndFutureRoot: 'refused without replacement',
      nativeView: 'not-run',
    };
  });
  await run('PK-02', async () => {
    const o = await fresh(),
      before = await heads(o),
      metrics = await rpc(o, { method: 'metrics' }),
      c = await editNote(o);
    await rpc(o, c);
    const after = await heads(o),
      m = await rpc(o, { method: 'metrics' });
    for (const id of ['n2', 'n3', 't1', 't2'])
      assert.equal(after.heads[id], before.heads[id]);
    assert.notEqual(after.heads.n1, before.heads.n1);
    assert.deepEqual(
      m.encoded.slice(metrics.encoded.length).map((r) => r.pageId),
      ['n1']
    );
    assert.equal(m.rootRows - metrics.rootRows, 1);
    assert.deepEqual(
      [
        ...new Set(
          m.decoded.slice(metrics.decoded.length).map((r) => r.pageId)
        ),
      ],
      ['n1']
    );
    assert.equal(
      (await page(o, 'n1')).page.properties.Category.value,
      'Planning'
    );
    const q = await fresh(),
      pendingEdit = await editNote(q, 'Valid after unrelated commit');
    await rpc(
      q,
      await withHeads(
        q,
        {
          method: 'edit_note',
          noteId: 'n3',
          body: document(paragraph('n3-p1', 'Other page edit'), slot('t2')),
        },
        ['n3']
      )
    );
    assert.equal((await rpc(q, pendingEdit)).version, 2);
    assert.equal(
      (await page(q, 'n3')).page.body.content[0].content[0].text,
      'Other page edit'
    );
    return {
      encodedPages: ['n1'],
      unrelatedHeadsUnchanged: 4,
      newPayloadRows: 1,
      wholeSpaceEnginePayload: false,
      unrelatedGlobalChange: 'head guards are per affected page',
    };
  });
  await run('PK-03', async () => {
    const o = await fresh();
    await rpc(o, await asset(o));
    const before = await heads(o),
      c = await move(o),
      metrics = await rpc(o, { method: 'metrics' });
    const receipt = await rpc(o, c),
      after = await heads(o),
      m = await rpc(o, { method: 'metrics' });
    assert.equal(after.heads.t1, before.heads.t1);
    assert.equal(after.heads.n3, before.heads.n3);
    assert.equal(after.heads.t2, before.heads.t2);
    assert.deepEqual(
      m.encoded
        .slice(metrics.encoded.length)
        .map((r) => r.pageId)
        .sort(),
      ['n1', 'n2']
    );
    assert.equal((await page(o, 'n1')).taskPreviews.length, 0);
    assert.equal((await page(o, 'n2')).taskPreviews[0].taskId, 't1');
    assert.equal((await page(o, 't1')).page.links.cover.role, 'cover');
    assert.deepEqual(await rpc(o, c), receipt);
    return {
      oneSpaceCommit: receipt.version,
      changedPages: ['n1', 'n2'],
      taskPayloadAndCoverUnchanged: true,
    };
  });
  await run('PK-04', async () => {
    const o = await fresh();
    await rpc(o, await asset(o));
    await snapshot(o, 'old-note', 1);
    const before = await page(o, 'n1');
    await rpc(o, await editTask(o));
    await rpc(o, await remove(o, 'cover'));
    await rpc(
      o,
      await asset(o, {
        attachmentId: 'pdf',
        bytes: pdf,
        mime: 'application/pdf',
        role: 'body',
      })
    );
    const old = await querySnapshot(o, 'old-note'),
      current = await page(o, 'n1');
    assert.equal(old.rootHash, current.rootHash);
    assert.equal(current.rootHash, before.rootHash);
    assert.equal(old.taskPreviews[0].page.title, 'Send proposal');
    assert.ok(old.taskPreviews[0].page.links.cover);
    assert.equal(current.taskPreviews[0].page.title, 'New task title');
    assert.ok(current.taskPreviews[0].page.links.pdf);
    assert.equal(current.taskPreviews[0].page.links.cover, undefined);
    return {
      sameNotePayloadDifferentContexts: true,
      oldTaskTitle: old.taskPreviews[0].page.title,
      currentTaskTitle: current.taskPreviews[0].page.title,
      oldCoverRetained: true,
    };
  });
  await run('PK-05', async () => {
    const o = await fresh(),
      preview = await heads(o);
    await snapshot(o, 'preview', 0);
    await rpc(o, await move(o));
    const restore = {
      method: 'restore_note',
      operationId: randomUUID(),
      noteId: 'n1',
      version: 0,
      expectedHeads: { n1: preview.heads.n1 },
    };
    refused(await o.rpc(restore), 'PAGE_HEAD_CONFLICT');
    const h = await heads(o);
    refused(
      await o.rpc({ ...restore, expectedHeads: { n1: h.heads.n1 } }),
      'TASK_PLACEMENT_CONFLICT'
    );
    assert.deepEqual(await heads(o), h);
    assert.equal(
      await rpc(o, { method: 'outcome', operationId: restore.operationId }),
      null
    );
    await rpc(o, await move(o, 'n2', 'inbox'));
    const detached = await heads(o);
    refused(
      await o.rpc({ ...restore, expectedHeads: { n1: detached.heads.n1 } }),
      'TASK_PLACEMENT_CONFLICT'
    );
    const q = await fresh();
    await rpc(q, await editNote(q));
    await rpc(q, await editTask(q));
    await rpc(q, await asset(q));
    const task = await page(q, 't1');
    await rpc(
      q,
      await withHeads(q, { method: 'restore_note', noteId: 'n1', version: 0 }, [
        'n1',
      ])
    );
    assert.equal(
      (await page(q, 'n1')).page.body.content[0].content[0].text,
      'Planning draft'
    );
    assert.deepEqual((await page(q, 't1')).page, task.page);
    return {
      stalePreview: 'refused',
      movedDetachedRestore: 'refused',
      safeNoteRestore: 'keeps newer independent task body/properties/cover',
    };
  });
  await run('PK-06', async () => {
    let o = await fresh();
    await rpc(o, await asset(o));
    await rpc(
      o,
      await asset(o, {
        pageId: 'n1',
        attachmentId: 'note-pdf',
        bytes: pdf,
        mime: 'application/pdf',
        role: 'body',
      })
    );
    await snapshot(o, 'media-pin', 2);
    const pinned = await querySnapshot(o, 'media-pin');
    assert.deepEqual(
      pinned.roots.map((r) => r.page_id),
      ['n1', 't1']
    );
    assert.equal(pinned.files.length, 2);
    await rpc(o, await remove(o, 'cover'));
    await rpc(o, await remove(o, 'note-pdf', 'n1'));
    const dir = o.dir;
    await o.stop();
    o = await start(dir);
    assert.deepEqual(await querySnapshot(o, 'media-pin'), pinned);
    assert.equal(
      (
        await rpc(o, {
          method: 'page_asset',
          pageId: 't1',
          attachmentId: 'cover',
          version: 2,
        })
      ).base64,
      png.toString('base64')
    );
    assert.equal(
      (
        await rpc(o, {
          method: 'page_asset',
          pageId: 'n1',
          attachmentId: 'note-pdf',
          version: 2,
        })
      ).base64,
      pdf.toString('base64')
    );
    let q = await fresh();
    const importCommand = await asset(q),
      qdir = q.dir;
    await q.control('fault', {
      phase: 'after_page_roots',
      operationId: importCommand.operationId,
    });
    const pending = q.rpc(importCommand);
    await q.next((m) => m.type === 'phase' && m.phase === 'after_page_roots');
    await q.stop();
    await pending;
    q = await start(qdir);
    assert.equal((await heads(q)).spaceVersion, 0);
    assert.deepEqual((await page(q, 't1')).page.links, {});
    assert.equal((await rpc(q, importCommand)).version, 1);
    return {
      importFileCatalogRollbackAndRetry: true,
      transitiveRoots: 2,
      pinnedFiles: 2,
      historicalAfterRemovalAndRestart: true,
      copiedTaskBody: false,
    };
  });
  await run('PK-07', async () => {
    const rows = [];
    for (const phase of [
      'after_page_stage',
      'before_begin',
      'after_revision',
      'after_page_roots',
      'after_page_indexes',
      'after_page_heads',
      'after_outcome',
      'before_commit',
      'after_commit',
      'before_reply',
    ]) {
      let o = await fresh();
      const dir = o.dir,
        c = await move(o),
        before = await heads(o);
      await o.control('fault', { phase, operationId: c.operationId });
      const request = o.rpc(c);
      await o.next((m) => m.type === 'phase' && m.phase === phase);
      await o.stop();
      await request;
      o = await start(dir);
      const committed = ['after_commit', 'before_reply'].includes(phase),
        h = await heads(o);
      assert.equal(h.spaceVersion, committed ? 1 : 0);
      assert.equal(
        (await page(o, 'n1')).taskPreviews.length,
        committed ? 0 : 1
      );
      assert.equal(
        (await page(o, 'n2')).taskPreviews.length,
        committed ? 1 : 0
      );
      assert.equal(h.heads.t1, before.heads.t1);
      const prior = await rpc(o, {
        method: 'outcome',
        operationId: c.operationId,
      });
      assert.equal(prior !== null, committed);
      const receipt = await rpc(o, c);
      assert.equal(receipt.version, 1);
      if (prior) assert.deepEqual(receipt, prior);
      assert.deepEqual(await rpc(o, c), receipt);
      refused(await o.rpc({ ...c, index: 0 }), 'OPERATION_ID_REUSED');
      rows.push({
        phase,
        recoveredVersion: h.spaceVersion,
        retryVersion: receipt.version,
      });
    }
    return rows;
  });
  await run('PK-08', async () => {
    let o = await fresh();
    const before = await heads(o);
    await snapshot(o, 'reader-lease', 0, 'lease_snapshot');
    const old = await querySnapshot(o, 'reader-lease');
    assert.equal((await rpc(o, { method: 'metrics' })).transactionOpen, false);
    await rpc(o, await move(o));
    await rpc(o, await editTask(o, 'Later task'));
    assert.deepEqual(await querySnapshot(o, 'reader-lease'), old);
    const leaseDir = o.dir;
    await o.stop();
    o = await start(leaseDir);
    assert.deepEqual(await querySnapshot(o, 'reader-lease'), old);
    assert.equal(
      (await page(o, 'n2')).taskPreviews[0].page.title,
      'Later task'
    );
    refused(
      await o.rpc({
        method: 'edit_note',
        operationId: randomUUID(),
        noteId: 'n1',
        body: document(paragraph('n1-p1', 'Stale edit'), slot('t1')),
        expectedHeads: { n1: before.heads.n1 },
      }),
      'PAGE_HEAD_CONFLICT'
    );
    await rpc(o, {
      method: 'release_snapshot',
      operationId: randomUUID(),
      snapshotId: 'reader-lease',
    });
    refused(
      await o.rpc({ method: 'read_snapshot', snapshotId: 'reader-lease' }),
      'SNAPSHOT_NOT_FOUND'
    );
    assert.equal((await rpc(o, { method: 'metrics' })).transactionOpen, false);
    return {
      lease: 'immutable roots until explicit release; no expiration/GC',
      oldReaderCoherent: true,
      newReaderCoherent: true,
      longSqlTransaction: false,
    };
  });
  await run('PK-09', async () => {
    const o = await fresh(),
      adapter = await mcp(o, { entry: 'pages/mcp.mjs' });
    try {
      const c = await move(o),
        receipt = ok(await cli(o, c));
      assert.deepEqual(await rpc(o, c), receipt);
      assert.deepEqual(ok(await adapter.command(c)), receipt);
      const tools = await adapter.request('tools/list', {});
      assert.ok(JSON.stringify(tools.result).includes('expectedHeads'));
      const watermark = 0;
      await o.control('drop_hints', { value: true });
      await rpc(o, await editTask(o));
      const changes = await rpc(o, {
        method: 'changes_since',
        version: watermark,
      });
      assert.deepEqual(changes.batches[0].changes.map((r) => r.pageId).sort(), [
        'n1',
        'n2',
      ]);
      assert.deepEqual(
        changes.batches[1].changes.map((r) => r.pageId),
        ['t1']
      );
      assert.equal(changes.throughVersion, 2);
      const observer = await page(o, 'n2', changes.throughVersion);
      assert.equal(observer.taskPreviews[0].page.title, 'New task title');
      return {
        rpcCliMcpOneReceipt: true,
        pausedHeadlessObserver: 'fetches authoritative complete commit batches',
        nativeBrowser: 'not claimed',
      };
    } finally {
      await adapter.stop();
    }
  });
  await run('PK-10', async () => {
    const o = await fresh(),
      controlPages = await Promise.all(
        ['n1', 'n2', 'n3', 't1', 't2'].map((id) => page(o, id, 0))
      ),
      before = await rpc(o, { method: 'metrics' });
    await rpc(o, await editNote(o, 'Amplification sample'));
    const after = await rpc(o, { method: 'metrics' });
    await o.stop();
    const db = new DatabaseSync(join(o.dir, 'vault.sqlite'), {
      readOnly: true,
    });
    let descriptorBytes, payloadBytes, historyRoots;
    try {
      descriptorBytes = db
        .prepare('SELECT length(state) AS n FROM revisions WHERE version=1')
        .get().n;
      payloadBytes = db
        .prepare(
          'SELECT length(payload) AS n FROM page_roots WHERE root_hash=(SELECT root_hash FROM page_changes WHERE version=1)'
        )
        .get().n;
      historyRoots = db.prepare('SELECT count(*) AS n FROM page_roots').get().n;
      assert.equal(db.prepare('SELECT count(*) AS n FROM blobs').get().n, 0);
      assert.equal(
        db
          .prepare('SELECT count(*) AS n FROM page_changes WHERE version=1')
          .get().n,
        1
      );
    } finally {
      db.close();
    }
    const controlModel = {
      ...aggregate,
      initial() {
        const d = new Y.Doc();
        try {
          for (const root of ['notes', 'tasks', 'assets', 'assetLinks'])
            d.getMap(root);
          for (const p of controlPages) {
            const record = new Y.Map();
            d.getMap(p.kind).set(p.pageId, record);
            record.set('title', p.page.title);
            const body = new Y.XmlFragment();
            record.set('body', body);
            prosemirrorToYXmlFragment(
              parse(p.kind === 'notes' ? noteSchema : taskSchema, p.page.body),
              body
            );
            if (p.kind === 'tasks') {
              const props = new Y.Map();
              record.set('properties', props);
              for (const [k, v] of Object.entries(p.page.properties))
                props.set(k, v);
            }
          }
          return aggregate.stateOf(d);
        } finally {
          d.destroy();
        }
      },
    };
    const dir = mkdtempSync(join(base, 'aggregate-')),
      store = new Store(dir, { init: true, model: controlModel });
    let aggregateBytes;
    try {
      const m = store.getMeta(),
        r = store.root(0).state;
      await store.execute({
        method: 'edit_note',
        operationId: randomUUID(),
        spaceId: m.space_id,
        documentId: m.document_id,
        expectedVersion: 0,
        noteId: 'n1',
        body: document(paragraph('n1-p1', 'Amplification sample'), slot('t1')),
      });
      aggregateBytes = store.db
        .prepare('SELECT length(state) AS n FROM revisions WHERE version=1')
        .get().n;
      assert.ok(r.notes.n2 && r.tasks.t1);
    } finally {
      store.close();
    }
    const reopened = await start(o.dir),
      startup = await rpc(reopened, { method: 'metrics' });
    assert.deepEqual(
      after.encoded.slice(before.encoded.length).map((r) => r.pageId),
      ['n1']
    );
    assert.equal(historyRoots, 6);
    return {
      candidateFixture: { notes: 3, tasks: 2 },
      aggregateControlFixture: { notes: 3, tasks: 2 },
      encodedPages: ['n1'],
      pagePayloadBytes: payloadBytes,
      descriptorBytes,
      aggregateRootBytes: aggregateBytes,
      historyRootRows: historyRoots,
      startupDeepDecoded: startup.decoded.length,
      comparison:
        'same five page titles/bodies/task properties; page candidate additionally stores note properties; byte counters only, not a speed/size benchmark win',
      budgets: 'Proposed/unmeasured',
      nativeBrowser: 'not run',
    };
  });
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
} finally {
  for (const o of owners) await o.stop();
  mkdirSync('artifacts', { recursive: true });
  const path = process.env.PAGE_RESULT ?? 'artifacts/page-results.json';
  writeFileSync(
    path,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        contract: '../../page-partition-contract.json',
        contractSha256: createHash('sha256')
          .update(readFileSync('../../page-partition-contract.json'))
          .digest('hex'),
        scope:
          'Headless per-page/atomic Space service proof; no actual EditorView, native input, performance or production claim',
        profile,
        results,
      },
      null,
      2
    ) + '\n'
  );
  console.log('Report', path);
}
