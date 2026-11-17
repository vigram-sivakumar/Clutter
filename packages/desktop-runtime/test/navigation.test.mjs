import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoreClient } from '@clutter/core';
import { WindowNavigation, parseNavigation } from '../../ui/src/navigation.mjs';
import { WindowWorkspace } from '../../ui/src/window-workspace.mjs';
import { WindowStateStore } from '../src/host/view-state.mjs';
import { hash } from '../src/host/session.mjs';
const ids = () => {
  let n = 0;
  return () => 'view_' + ++n;
};
const client = () =>
  new CoreClient(async () => ({ ok: true, value: { pages: [] } }));
function store(t, beforeWrite) {
  const directory = mkdtempSync(join(tmpdir(), 'clutter-layout54-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, data: new WindowStateStore(directory, beforeWrite) };
}
const port = (data, windowId = 'window') => ({
  load: async () => data.execute({ action: 'read', windowId }),
  save: async (record) =>
    data.execute({ action: 'write', windowId, ...record }),
});
test('ordinary note navigation stays in the current tab/pane and Back/Forward history branches correctly', () => {
  const nav = new WindowNavigation(ids());
  nav.open('a');
  const location = nav.location();
  nav.open('b');
  nav.open('b');
  assert.deepEqual(nav.activePane.history, ['a', 'b']);
  assert.equal(nav.tabs.length, 1);
  assert.deepEqual(nav.location(), location);
  nav.travel(-1);
  assert.equal(nav.page(), 'a');
  nav.travel(1);
  assert.equal(nav.page(), 'b');
  nav.travel(-1);
  nav.open('c');
  assert.deepEqual(nav.activePane.history, ['a', 'c']);
  assert.deepEqual(nav.activePane.visited, ['a', 'b', 'c']);
  assert.equal(nav.travel(1), false);
});
test('each tab owns a split layout and each pane navigates independently, including notes open in another tab', () => {
  const nav = new WindowNavigation(ids());
  nav.open('a');
  const first = nav.activeTab.id,
    left = nav.activePane.id;
  nav.split('b');
  const right = nav.activePane.id;
  nav.open('c');
  assert.equal(nav.page(), 'c');
  assert.equal(nav.page(nav.activeTab.panes[0]), 'a');
  nav.travel(-1);
  assert.equal(nav.page(), 'b');
  nav.newTab('d');
  const second = nav.activeTab.id;
  nav.open('a');
  assert.equal(nav.activeTab.id, second);
  assert.equal(nav.page(), 'a');
  assert.equal(nav.tabs.length, 2);
  assert.equal(nav.activeTab.panes.length, 1);
  nav.selectTab(first);
  assert.equal(nav.activePane.id, right);
  assert.equal(nav.page(), 'b');
  assert.equal(nav.activeTab.panes.length, 2);
  nav.selectPane(first, left);
  assert.equal(nav.page(), 'a');
  nav.split('a');
  assert.equal(nav.activeTab.panes.length, 3);
  assert.equal(nav.tabs.length, 2);
  const keys = nav.activeTab.panes.map((p) => nav.viewKey(nav.activeTab, p));
  assert.equal(new Set(keys).size, 3);
});
test('restored navigation retains view identities, per-pane history and active tab without trusting malformed layouts', () => {
  const nav = new WindowNavigation(ids());
  nav.open('a');
  nav.split('b');
  nav.open('c');
  nav.travel(-1);
  const first = nav.activeTab.id;
  nav.newTab('d');
  nav.selectTab(first);
  const value = nav.snapshot();
  const restored = new WindowNavigation(
    ids(),
    JSON.parse(JSON.stringify(value))
  );
  assert.deepEqual(restored.snapshot(), value);
  assert.equal(restored.page(), 'b');
  restored.travel(1);
  assert.equal(restored.page(), 'c');
  assert.equal(nav.page(), 'b');
  for (const bad of [
    { ...value, body: 'not a navigation field' },
    { ...value, activeTabId: 'missing' },
    { ...value, tabs: [{ ...value.tabs[0], id: 123 }] },
    {
      ...value,
      tabs: [
        {
          ...value.tabs[0],
          panes: [{ ...value.tabs[0].panes[0], history: [], index: -1 }],
        },
      ],
    },
    {
      ...value,
      tabs: [
        {
          ...value.tabs[0],
          panes: [value.tabs[0].panes[0], value.tabs[0].panes[0]],
        },
      ],
    },
  ])
    assert.throws(() => parseNavigation(bad), /INVALID_WINDOW_LAYOUT/);
});
test('private layout writes are isolated, monotonic and exactly retryable across runtime reconstruction', (t) => {
  let fail = false;
  const { directory, data } = store(t, () => {
    if (fail) throw Error('INJECTED');
  });
  const nav = new WindowNavigation(ids());
  nav.open('a');
  const request = {
    action: 'write',
    windowId: 'one',
    revision: 1,
    value: JSON.stringify(nav.snapshot()),
  };
  assert.equal(data.execute({ action: 'read', windowId: 'one' }).value, null);
  assert.equal(data.execute(request).revision, 1);
  assert.equal(new WindowStateStore(directory).execute(request).revision, 1);
  assert.equal(data.execute({ action: 'read', windowId: 'two' }).value, null);
  assert.throws(
    () => data.execute({ ...request, value: 'different' }),
    /CONFLICT/
  );
  data.execute({ ...request, revision: 3 });
  assert.throws(() => data.execute({ ...request, revision: 2 }), /STALE/);
  fail = true;
  assert.throws(() => data.execute({ ...request, revision: 4 }), /INJECTED/);
  assert.equal(data.execute({ action: 'read', windowId: 'one' }).revision, 3);
  fail = false;
  assert.equal(data.execute({ ...request, revision: 4 }).revision, 4);
  for (const extra of [
    { windowId: '../escape' },
    { revision: 0 },
    { value: 'x'.repeat(524289) },
    { revision: 5, value: '"'.repeat(524288) },
    { unknown: true },
  ])
    assert.throws(
      () => data.execute({ ...request, ...extra }),
      /INVALID_WINDOW_STATE_REQUEST/
    );
  const file = join(directory, 'window-state', hash('one') + '.json');
  writeFileSync(file, 'damaged');
  assert.throws(() => data.execute(request), /UNREADABLE/);
  assert.equal(readFileSync(file, 'utf8'), 'damaged');
});
test('window restore uses persisted tab/pane keys so same-note contexts remain distinct and protected work remains addressable', async (t) => {
  const { data } = store(t);
  const first = new WindowWorkspace({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
    stateStore: port(data),
  });
  await first.start();
  await first.open('a');
  await first.openInSplit('a');
  const tab = first.navigation.activeTab;
  const left = await first
    .editor('a')
    .scope(first.navigation.viewKey(tab, tab.panes[0]));
  const right = await first
    .editor('a')
    .scope(first.navigation.viewKey(tab, tab.panes[1]));
  assert.notEqual(left.contextId, right.contextId);
  await first.open('b');
  await first.back();
  assert.equal((await first.prepareClose()).safe, true);
  const second = new WindowWorkspace({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: () => 'fresh_' + crypto.randomUUID(),
    stateStore: port(data),
  });
  await second.start();
  assert.deepEqual(second.navigation.snapshot(), first.navigation.snapshot());
  const restored = second.navigation.activeTab;
  assert.deepEqual(
    await second
      .editor('a')
      .scope(second.navigation.viewKey(restored, restored.panes[1])),
    right
  );
  const other = new WindowWorkspace({
    client: client(),
    spaceId: 's',
    windowId: 'other',
    nextId: ids(),
    stateStore: port(data, 'other'),
  });
  await other.start();
  assert.equal(other.navigation.tabs.length, 0);
  await other.open('a');
  assert.notEqual(
    (
      await other
        .editor('a')
        .scope(
          other.navigation.viewKey(
            other.navigation.activeTab,
            other.navigation.activePane
          )
        )
    ).contextId,
    left.contextId
  );
});
test('a navigation write must finish before editing starts or the window close guard can succeed', async (t) => {
  const { data } = store(t);
  const underlying = port(data);
  let block = false,
    release;
  const stateStore = {
    load: underlying.load,
    save: async (record) => {
      if (block) {
        await new Promise((ok) => (release = ok));
        block = false;
      }
      return underlying.save(record);
    },
  };
  const model = new WindowWorkspace({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
    stateStore,
  });
  await model.start();
  block = true;
  const opening = model.open('a');
  await new Promise((ok) => setImmediate(ok));
  assert.equal(model.navigationBusy, true);
  assert.equal(model.canNavigate, false);
  let closed = false;
  const closing = model.prepareClose().then((r) => {
    closed = true;
    return r;
  });
  await new Promise((ok) => setImmediate(ok));
  assert.equal(closed, false);
  release();
  assert.equal(await opening, true);
  assert.equal((await closing).safe, true);
});
test('failed navigation storage refuses close, retries latest state, and never resets corrupt stored navigation', async (t) => {
  let fail = false;
  const { data } = store(t, () => {
    if (fail) throw Error('INJECTED');
  });
  const model = new WindowWorkspace({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
    stateStore: port(data),
  });
  await model.start();
  fail = true;
  assert.equal(await model.open('a'), false);
  assert.equal(model.navigationError, true);
  assert.equal(model.layoutRegistered, false);
  assert.equal(model.canNavigate, false);
  assert.equal((await model.prepareClose()).safe, false);
  fail = false;
  assert.equal(await model.retryNavigation(), true);
  assert.equal((await model.prepareClose()).safe, true);
  let writes = 0;
  const damaged = new WindowWorkspace({
    client: client(),
    spaceId: 's',
    windowId: 'damaged',
    stateStore: {
      load: async () => ({ revision: 2, value: 'bad json' }),
      save: async () => {
        writes++;
      },
    },
  });
  await assert.rejects(damaged.start());
  assert.equal(damaged.ready, false);
  assert.equal((await damaged.prepareClose()).safe, true);
  assert.equal(writes, 0);
});
