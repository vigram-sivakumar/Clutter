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
// Unit cases below isolate layout/storage. Bundled-UI cases exercise real Core priming.
function unitWindow(options) {
  const model = new WindowWorkspace(options);
  model.primeNavigation = async () => {};
  return model;
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
  const nav = new WindowNavigation(ids(), undefined, {
    allowDuplicateNoteInTab: true,
  });
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
  const first = unitWindow({
    allowDuplicateNoteInTab: true,
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
  const second = unitWindow({
    allowDuplicateNoteInTab: true,
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
  const other = unitWindow({
    allowDuplicateNoteInTab: true,
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
  const model = unitWindow({
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
  assert.equal(model.canNavigate, true);
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
  const model = unitWindow({
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
  assert.equal(model.pageId, null);
  assert.equal(model.pendingNavigation.page(), 'a');
  assert.equal(model.editors.size, 0);
  assert.equal(model.canNavigate, true);
  assert.equal((await model.prepareClose()).safe, false);
  fail = false;
  assert.equal(await model.retryNavigation(), true);
  assert.equal((await model.prepareClose()).safe, true);
  let writes = 0;
  const damaged = unitWindow({
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

test('navigation publishes its destination only after metadata and context readiness, retaining the previous note on failure', async (t) => {
  const { data } = store(t);
  const model = unitWindow({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
    stateStore: port(data),
  });
  await model.start();
  await model.open('a');
  let release,
    fail = false;
  model.primeNavigation = async () => {
    await new Promise((ok) => (release = ok));
    if (fail) throw Error('CONTEXT_UNAVAILABLE');
  };
  const switching = model.open('b');
  await new Promise((ok) => setImmediate(ok));
  assert.equal(model.pageId, 'a');
  assert.equal(model.pendingNavigation.page(), 'b');
  assert.equal(model.navigationBusy, true);
  release();
  assert.equal(await switching, true);
  assert.equal(model.pageId, 'b');
  fail = true;
  const failed = model.open('c');
  await new Promise((ok) => setImmediate(ok));
  release();
  assert.equal(await failed, false);
  assert.equal(model.pageId, 'b');
  assert.equal(model.pendingNavigation.page(), 'c');
  fail = false;
  const retry = model.retryNavigation();
  await new Promise((ok) => setImmediate(ok));
  release();
  assert.equal(await retry, true);
  assert.equal(model.pageId, 'c');
  assert.equal(model.pendingNavigation, null);
  assert.equal((await model.prepareClose()).safe, true);
});

test('returning to registered notes does not wait for another layout write, while close still requires it', async (t) => {
  const { data } = store(t),
    underlying = port(data);
  let block = false,
    release;
  const model = unitWindow({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
    stateStore: {
      load: underlying.load,
      save: async (record) => {
        if (block) {
          await new Promise((ok) => (release = ok));
          block = false;
        }
        return underlying.save(record);
      },
    },
  });
  await model.start();
  await model.open('a');
  await model.open('b');
  block = true;
  assert.equal(await model.back(), true);
  assert.equal(model.pageId, 'a');
  assert.equal(await model.forward(), true);
  assert.equal(model.pageId, 'b');
  let closed = false;
  const closing = model.prepareClose().then((r) => {
    closed = true;
    return r;
  });
  await new Promise((ok) => setImmediate(ok));
  assert.equal(closed, false);
  release();
  assert.equal((await closing).safe, true);
});

test('rapid pane intents supersede late preparation without publishing obsolete routes or stealing newer focus', async () => {
  const model = unitWindow({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
  });
  await model.start();
  await model.open('a');
  let release, entered;
  const waiting = new Promise((ok) => (entered = ok));
  const published = [];
  model.changed = () => published.push(model.pageId);
  model.primeNavigation = async (nav) => {
    if (nav.page() === 'b') {
      entered();
      await new Promise((ok) => (release = ok));
    }
  };
  const first = model.open('b');
  await waiting;
  assert.equal(model.canNavigate, true);
  const newer = model.open('c');
  assert.equal(model.pageId, 'a');
  assert.equal(await first, false);
  assert.equal(await newer, true);
  // The newer ready note must not wait for the obsolete network preparation.
  assert.equal(model.pageId, 'c');
  let closed = false;
  const closing = model.prepareClose().then((r) => {
    closed = true;
    return r;
  });
  await new Promise((ok) => setImmediate(ok));
  assert.equal(closed, false, 'close still waits for superseded preparation');
  release();
  assert.equal((await closing).safe, true);
  assert(!published.includes('b'));
  assert.deepEqual(model.navigation.activePane.history, ['a', 'c']);
  assert.equal((await model.prepareClose()).safe, true);
});

test('queued structural intents rebase over current topology and retain explicit pane focus during preparation', async () => {
  const model = unitWindow({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
  });
  await model.start();
  await model.open('a');
  const original = model.navigation.location();
  let release, entered;
  const waiting = new Promise((ok) => (entered = ok));
  model.primeNavigation = async (nav) => {
    if (nav.activeTab.panes.length === 2 && !release) {
      entered();
      await new Promise((ok) => (release = ok));
    }
  };
  const split = model.openInSplit('b');
  await waiting;
  const tab = model.openInNewTab('c');
  model.selectPane(original.tabId, original.paneId, true, true);
  const epoch = model.focusEpoch;
  release();
  await split;
  await tab;
  assert.equal(model.navigation.tabs.length, 2);
  assert.deepEqual(
    model.navigation.tabs[0].panes.map((p) => model.navigation.page(p)),
    ['a', 'b']
  );
  assert.equal(model.navigation.activeTab.id, original.tabId);
  assert.equal(model.navigation.activePane.id, original.paneId);
  assert.equal(model.focusEpoch, epoch);
  assert.equal((await model.prepareClose()).safe, true);
});

test('uncertain creation retries exactly once per operation and accepted late creation never restores an obsolete destination', async () => {
  const commands = [];
  let unknown = true,
    release,
    entered;
  let waiting = new Promise((ok) => (entered = ok));
  const fake = {
    execute: async (c) => {
      if (c.method === 'page.list') return { ok: true, value: { pages: [] } };
      if (c.method === 'page.create') {
        commands.push(structuredClone(c));
        entered();
        await new Promise((ok) => (release = ok));
        return unknown
          ? { ok: false, error: { code: 'OUTCOME_UNKNOWN' } }
          : { ok: true, value: { pageId: c.pageId } };
      }
      if (c.method === 'page.read')
        return {
          ok: true,
          value: {
            pageId: c.pageId,
            title: 'Untitled',
            kind: 'note',
            head: 'accepted',
            sequence: 1,
          },
        };
      throw Error('unexpected command');
    },
  };
  const model = unitWindow({
    client: fake,
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
  });
  await model.start();
  await model.open('a');
  let creating = model.create();
  await waiting;
  assert.equal(model.creationState, 'pending');
  assert.equal(model.canNavigate, true);
  assert.equal(model.create(), creating);
  release();
  await creating;
  assert.equal(model.creationState, 'uncertain');
  unknown = false;
  waiting = new Promise((ok) => (entered = ok));
  creating = model.create();
  await waiting;
  await model.open('b');
  release();
  await creating;
  assert.deepEqual(commands[1], commands[0]);
  assert.equal(model.pageId, 'b');
  assert(model.pages.some((p) => p.pageId === commands[0].pageId));
  assert.equal(model.pendingCreate, null);
  assert.equal((await model.prepareClose()).safe, true);
});

test('duplicate split admission defaults off, ignores history/other tabs, and has one explicit enabling option', async () => {
  const nav = new WindowNavigation(ids());
  nav.open('a');
  assert.equal(nav.canSplit('a'), false);
  assert.equal(nav.split('a'), false);
  assert.equal(nav.activeTab.panes.length, 1);
  nav.split('b');
  nav.open('c');
  assert.equal(nav.canSplit('b'), true, 'history alone does not block');
  nav.newTab('a');
  assert.equal(nav.canSplit('c'), true, 'other tabs do not block');
  assert.equal(nav.split('a'), false);
  const enabled = new WindowNavigation(
    () => 'extra_' + crypto.randomUUID(),
    nav.snapshot(),
    {
      allowDuplicateNoteInTab: true,
    }
  );
  assert.equal(enabled.split('a'), true);
  assert.equal(enabled.activeTab.panes.length, 2);
  const restored = new WindowNavigation(ids(), enabled.snapshot());
  assert.equal(
    restored.activeTab.panes.length,
    2,
    'restoring prior layouts does not drop views'
  );
  assert.throws(
    () =>
      new WindowNavigation(ids(), undefined, {
        allowDuplicateNoteInTab: 'yes',
      }),
    /INVALID_NAVIGATION_OPTION/
  );
  const model = unitWindow({
    client: client(),
    spaceId: 's',
    windowId: 'w',
    nextId: ids(),
  });
  await model.start();
  await model.open('a');
  assert.equal(await model.openInSplit('a'), false);
  await Promise.all([model.openInSplit('b'), model.openInSplit('b')]);
  assert.deepEqual(
    model.navigation.activeTab.panes.map((p) => model.navigation.page(p)),
    ['a', 'b'],
    'queued intent cannot bypass admission'
  );
  assert.equal((await model.prepareClose()).safe, true);
});

test('window creation joins repeated activation and the source close guard waits for its acknowledgement', async () => {
  let entered,
    release,
    calls = 0;
  const waiting = new Promise((ok) => (entered = ok));
  const model = unitWindow({
    client: client(),
    spaceId: 's',
    windowId: 'parent',
    nextId: ids(),
    openWindow: async (request) => {
      calls++;
      assert.equal(request.pageId, 'a');
      assert(request.requestId);
      entered();
      await new Promise((ok) => (release = ok));
      return { windowId: 'child' };
    },
  });
  await model.start();
  await model.open('a');
  const opening = model.openInNewWindow('a');
  assert.equal(model.openInNewWindow('a'), opening);
  await waiting;
  let closed = false;
  const closing = model.prepareClose().then((result) => {
    closed = true;
    return result;
  });
  await new Promise((ok) => setImmediate(ok));
  assert.equal(closed, false);
  release();
  assert.equal(await opening, true);
  assert.equal((await closing).safe, true);
  assert.equal(calls, 1);
});
