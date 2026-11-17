import { pageContent } from '../../editor/src/schema.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import {
  SpaceService,
  CoreClient,
  parseCommand,
  parsePageList,
} from '@clutter/core';
import { qualifiedEngine } from '@clutter/editor/backend';
import { SqliteStore } from '@clutter/desktop-runtime/sqlite';
import { WindowWorkspace } from '../../ui/src/window-workspace.mjs';
function setup(t) {
  const store = SqliteStore.createDisposable();
  const service = new SpaceService(store, qualifiedEngine);
  const principal = {
    spaceId: store.spaceId,
    peerId: 'test',
    scopes: ['read', 'write'],
  };
  t.after(() => {
    try {
      store.close();
    } catch (e) {
      if (e.code !== 'ERR_INVALID_STATE') throw e;
    }
    rmSync(store.directory, { recursive: true, force: true });
  });
  return {
    store,
    service,
    principal,
    client: new CoreClient((c) => service.execute(c, principal)),
    base: { apiVersion: 1, spaceId: store.spaceId },
  };
}
const create = (x, pageId) => ({
  ...x.base,
  method: 'page.create',
  operationId: 'create_' + pageId,
  pageId,
  kind: pageId === 'b' ? 'task' : 'note',
  content: pageContent('Title ' + pageId, ''),
  properties: {},
});
test('real catalogue query returns bounded ordered current heads and survives restart', async (t) => {
  const x = setup(t);
  assert.deepEqual(
    (await x.client.execute({ ...x.base, method: 'page.list' })).value,
    { pages: [] }
  );
  for (const id of ['c', 'a', 'b'])
    assert((await x.client.execute(create(x, id))).ok);
  let r = await x.client.execute({ ...x.base, method: 'page.list', limit: 2 });
  assert(r.ok);
  assert.deepEqual(
    r.value.pages.map((p) => p.pageId),
    ['a', 'b']
  );
  assert.equal(r.value.next, 'b');
  assert.equal(r.value.pages[1].kind, 'task');
  const next = await x.client.execute({
    ...x.base,
    method: 'page.list',
    afterId: r.value.next,
    limit: 2,
  });
  assert(next.ok);
  assert.deepEqual(
    next.value.pages.map((p) => p.pageId),
    ['c']
  );
  assert.equal(next.value.next, undefined);
  const prior = r.value.pages[0];
  assert(
    (
      await x.client.execute({
        ...x.base,
        method: 'page.update',
        pageId: 'a',
        operationId: 'rename',
        expectedHead: prior.head,
        patch: { content: pageContent('Renamed') },
      })
    ).ok
  );
  r = await x.client.execute({ ...x.base, method: 'page.list' });
  assert(r.ok);
  assert.equal(r.value.pages[0].title, 'Renamed');
  assert.notEqual(r.value.pages[0].head, prior.head);
  const dir = x.store.directory;
  x.store.close();
  const reopened = SqliteStore.reopenDisposable(dir);
  try {
    const service = new SpaceService(reopened, qualifiedEngine);
    assert.deepEqual(
      (await service.execute({ ...x.base, method: 'page.list' }, x.principal))
        .value,
      r.value
    );
  } finally {
    reopened.close();
  }
});
test('catalogue scope is enforced for read-only peers and rejects invalid or unbounded queries', async (t) => {
  const x = setup(t);
  assert((await x.client.execute(create(x, 'a'))).ok);
  const cmd = { ...x.base, method: 'page.list' };
  assert(
    (await x.service.execute(cmd, { ...x.principal, scopes: ['read'] })).ok
  );
  for (const principal of [
    { ...x.principal, scopes: [] },
    { ...x.principal, spaceId: 'other' },
  ])
    assert.equal(
      (await x.service.execute(cmd, principal)).error.code,
      'FORBIDDEN'
    );
  for (const extra of [
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { afterId: '../x' },
    { pageId: 'a' },
  ])
    assert.throws(() => parseCommand({ ...cmd, ...extra }), /INVALID_REQUEST/);
});
test('client rejects unsorted, duplicated, oversized or malformed catalogue replies', async (t) => {
  const x = setup(t);
  assert((await x.client.execute(create(x, 'a'))).ok);
  const list = (await x.client.execute({ ...x.base, method: 'page.list' }))
    .value;
  const a = list.pages[0];
  for (const value of [
    { pages: [a, a] },
    { pages: [{ ...a, sequence: 0 }] },
    { pages: [{ ...a, title: 42 }] },
    { pages: [a], next: 'different' },
    { pages: [], next: 'a' },
    { pages: [a], unexpected: true },
  ]) {
    const client = new CoreClient(async () => ({ ok: true, value }));
    assert.equal(
      (await client.execute({ ...x.base, method: 'page.list' })).error.code,
      'TRANSPORT_UNAVAILABLE'
    );
  }
  assert.throws(
    () => parsePageList({ pages: [a, { ...a, pageId: 'b' }] }, 1),
    /INVALID_REQUEST/
  );
});
test('unknown page creation outcome blocks close and retries the exact operation without a second page', async (t) => {
  const x = setup(t);
  let drop = true;
  const requests = [];
  const client = new CoreClient(async (c) => {
    const r = await x.service.execute(c, x.principal);
    if (c.method === 'page.create') {
      requests.push(structuredClone(c));
      if (drop) {
        drop = false;
        throw Error('lost reply');
      }
    }
    return r;
  });
  let serial = 0;
  const window = new WindowWorkspace({
    client,
    spaceId: x.store.spaceId,
    windowId: 'window',
    nextId: () => 'id_' + ++serial,
  });
  await window.create();
  assert(window.pendingCreate);
  assert.equal((await window.prepareClose()).safe, false);
  await window.create();
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(window.pendingCreate, null);
  assert.equal(window.pages.length, 1);
  assert.equal((await window.prepareClose()).safe, true);
});
test('view context identities are bounded, stable across reopen and distinct by window/page/pane', async () => {
  const options = {
    client: new CoreClient(async () => ({
      ok: false,
      error: { code: 'UNUSED' },
    })),
    spaceId: 's',
    windowId: 'w'.repeat(128),
  };
  const a = new WindowWorkspace(options),
    b = new WindowWorkspace(options);
  const first = await a.editor('p'.repeat(128)).scope('a');
  const reopened = await b.editor('p'.repeat(128)).scope('a');
  assert.deepEqual(first, reopened);
  assert(first.contextId.length <= 128);
  assert.notEqual(
    first.contextId,
    (await a.editor('different').scope('a')).contextId
  );
  assert.notEqual(
    first.contextId,
    (await a.editor('p'.repeat(128)).scope('b')).contextId
  );
  const other = new WindowWorkspace({ ...options, windowId: 'other' });
  assert.notEqual(
    first.contextId,
    (await other.editor('p'.repeat(128)).scope('a')).contextId
  );
  assert.equal(
    parseCommand({ ...first, apiVersion: 1, method: 'editor.open' }).contextId,
    first.contextId
  );
});
