import { pageContent } from '../../editor/src/schema.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { JSDOM, VirtualConsole } from 'jsdom';
import { pack, manifest } from '../../../apps/desktop/pack.mjs';
import {
  createSession,
  readSession,
  readJSON,
  hash,
} from '../src/host/session.mjs';
import { verifyArchive, lock } from '../../../apps/desktop/tools/runtime.mjs';
import { bootstrap } from '../../../apps/desktop/host/bootstrap.mjs';
import { setLoopbackPolicy } from '../../../apps/desktop/tools/plist.mjs';
const base = mkdtempSync(join(tmpdir(), 'clutter-desktop48-test-')),
  resources = join(base, 'Resources'),
  sessions = [];
let graph;
before(async () => {
  graph = await pack(resources, process.execPath);
  manifest(resources);
});
after(async () => {
  for (const dir of sessions) {
    try {
      await control(dir, 'stop');
    } catch {}
    const m = readJSON(join(dir, 'session.json'));
    rmSync(m.vaultDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(base, { recursive: true, force: true });
});
async function run(dir, args = ['--ensure'], input = '') {
  const child = spawn(
    process.execPath,
    [join(resources, 'launcher.mjs'), '--session', dir, ...args],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let out = '',
    err = '';
  child.stdout.on('data', (b) => (out += b));
  child.stderr.on('data', (b) => (err += b));
  const done = once(child, 'exit');
  child.stdin.end(input);
  const [code] = await done;
  return { out, err, code };
}
async function session() {
  const d = await createSession(resources);
  sessions.push(d);
  return d;
}
async function control(dir, flags) {
  const m = readSession(dir, resources);
  return fetch(`http://127.0.0.1:${m.port}/control`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + m.tokens.admin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(
      flags === 'stop' ? { action: 'stop' } : { action: 'flags', flags }
    ),
    signal: AbortSignal.timeout(10000),
  });
}
const command = (m, extra = {}) => ({
  apiVersion: 1,
  spaceId: m.spaceId,
  pageId: 'page',
  method: 'page.read',
  ...extra,
});
test('selected app bundles one shared UI/Core graph without experiment or legacy product imports', () => {
  for (const input of [...graph.browserInputs, ...graph.nodeInputs])
    assert.doesNotMatch(input, /docs\/foundation|apps\/app\//);
  assert(graph.browserInputs.some((n) => n.includes('ui/src/workspace.mjs')));
  assert(graph.nodeInputs.some((n) => n.includes('core/src/core.ts')));
  assert.equal(
    graph.browserInputs.filter((n) => /yjs\/dist\/yjs\.mjs$/.test(n)).length,
    1
  );
});
test('parallel app-closed launchers attach to one reserved owner; CLI, MCP and UI read the same accepted page', async () => {
  const dir = await session(),
    m = readSession(dir, resources),
    results = await Promise.all(Array.from({ length: 4 }, () => run(dir)));
  for (const r of results) assert.equal(r.code, 0, r.err);
  for (const r of results) assert.equal(JSON.parse(r.out).runtimeBundled, true);
  assert.equal(
    new Set(results.map((r) => JSON.parse(r.out).instanceId)).size,
    1
  );
  const created = await run(
    dir,
    [],
    JSON.stringify(
      command(m, {
        method: 'page.create',
        operationId: 'test-seed',
        kind: 'note',
        content: pageContent('Test page', ''),
        properties: {},
      })
    )
  );
  assert.equal(JSON.parse(created.out).ok, true);
  const cli = await run(dir, [], JSON.stringify(command(m)));
  assert.equal(cli.code, 0, cli.err);
  const expected = JSON.parse(cli.out);
  assert.equal(expected.ok, true);
  const messages = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'clutter_command', arguments: command(m) },
    },
  ];
  const mcp = await run(
    dir,
    ['--mcp'],
    messages.map(JSON.stringify).join('\n') + '\n'
  );
  assert.equal(mcp.code, 0, mcp.err);
  const replies = mcp.out.trim().split('\n').map(JSON.parse);
  assert.deepEqual(JSON.parse(replies[1].result.content[0].text), expected);
  const ui = await fetch(`http://127.0.0.1:${m.port}/api`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + m.tokens.ui,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command(m)),
  });
  assert.deepEqual(await ui.json(), expected);
  const stopped = await control(dir, 'stop');
  await stopped.json();
  const restarted = await run(dir);
  assert.equal(restarted.code, 0, restarted.err);
  assert.notEqual(
    JSON.parse(restarted.out).instanceId,
    JSON.parse(results[0].out).instanceId
  );
  assert.deepEqual(
    JSON.parse((await run(dir, [], JSON.stringify(command(m)))).out),
    expected
  );
});
test('an unrelated listener cannot cause a fallback owner or writes through another endpoint', async () => {
  const dir = await session(),
    m = readSession(dir, resources);
  const blocker = createServer();
  await new Promise((ok, no) => {
    blocker.once('error', no);
    blocker.listen({ host: '127.0.0.1', port: m.port, exclusive: true }, ok);
  });
  try {
    const child = spawn(
      join(resources, 'runtime/node'),
      [join(resources, 'owner.mjs'), resources, dir],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let err = '';
    child.stderr.on('data', (b) => (err += b));
    const [code] = await once(child, 'exit');
    assert.equal(code, 2);
    assert.match(err, /OWNER_PORT_BUSY/);
  } finally {
    await new Promise((ok) => blocker.close(ok));
  }
  const first = await run(dir);
  assert.equal(first.code, 0, first.err);
});
test('local transport denies foreign origins, bad tokens, admin mutations and oversized frames', async () => {
  const dir = await session(),
    m = readSession(dir, resources);
  assert.equal((await run(dir)).code, 0);
  const url = `http://127.0.0.1:${m.port}`;
  for (const headers of [
    { authorization: 'Bearer wrong' },
    {
      authorization: 'Bearer ' + m.tokens.ui,
      origin: 'https://hostile.invalid',
    },
  ]) {
    const r = await fetch(url + '/api', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(command(m)),
    });
    assert.equal(r.status, 403);
  }
  const admin = await fetch(url + '/api', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + m.tokens.admin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command(m)),
  });
  assert.equal(admin.status, 403);
  const huge = await fetch(url + '/api', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + m.tokens.ui,
      'content-type': 'application/json',
    },
    body: 'x'.repeat(1048577),
  });
  assert.equal(huge.status, 400);
});
async function browserWindow(
  dir,
  windowId = 'window54',
  {
    allowDuplicateNoteInTab = false,
    initialPageId = null,
    onOpenWindow = null,
  } = {}
) {
  const m = readSession(dir, resources),
    start = await run(dir);
  assert.equal(start.code, 0, start.err);
  const url = `http://127.0.0.1:${m.port}`,
    errors = [],
    events = [],
    console = new VirtualConsole();
  console.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(
    readFileSync(join(resources, 'web/index.html'), 'utf8'),
    {
      url,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: console,
    }
  );
  Object.defineProperty(dom.window, 'crypto', { value: globalThis.crypto });
  Object.assign(dom.window, {
    structuredClone,
    AbortSignal,
    TextEncoder,
    TextDecoder,
  });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: 0,
    height: 0,
  });
  // Browser Response.json produces objects in the browser realm. Node fetch's
  // objects would fail the Core JSON plain-object guard across jsdom realms.
  dom.window.fetch = async (address, options = {}) => {
    const response = await fetch(address, {
      ...options,
      headers: { ...options.headers, origin: url },
    });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => dom.window.JSON.parse(await response.text()),
    };
  };
  dom.window.__clutterHost = {
    url,
    spaceId: m.spaceId,
    token: m.tokens.ui,
    windowId,
    allowDuplicateNoteInTab,
    initialPageId,
  };
  if (onOpenWindow) dom.window.__clutterOpenWindow = onOpenWindow;
  dom.window.__clutterHostEvent = (e) => events.push(e);
  dom.window.eval(readFileSync(join(resources, 'web/app.js'), 'utf8'));
  const doc = dom.window.document;
  const wait = async (check) => {
    for (let n = 0; n < 250; n++) {
      if (check()) return;
      await new Promise((ok) => setTimeout(ok, 15));
    }
    assert(
      check(),
      JSON.stringify({ body: doc.body.textContent, errors, events })
    );
  };
  const button = (text) =>
    [...doc.querySelectorAll('button')].find(
      (b) => b.textContent === text && !b.closest('[hidden]')
    );
  const panes = () => [
    ...doc.querySelectorAll('.tab-panel:not([hidden]) [data-pane]'),
  ];
  const active = () =>
    doc.querySelector('[data-pane][data-active=true] .ProseMirror');
  const tabs = () => [...doc.querySelectorAll('[role=tab]')];
  await wait(() => events.some((e) => e.event === 'ready'));
  await wait(() => button('+ New page') && !button('+ New page').disabled);
  const api = async (command) => {
    const r = await fetch(url + '/api', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + m.tokens.ui,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ apiVersion: 1, spaceId: m.spaceId, ...command }),
    });
    return r.json();
  };
  const menu = async (pageId, action) => {
    const row = doc
      .querySelector('.page-link[data-page="' + pageId + '"]')
      .closest('.page-row');
    row.querySelector('.note-menu-trigger').click();
    await wait(() => !!row.querySelector('[role=menuitem]'));
    [...row.querySelectorAll('[role=menuitem]')]
      .find((b) => b.textContent === action)
      .click();
  };
  const type = async (text, element = active()) => {
    element.focus();
    element.querySelector('p').textContent = text;
    const selection = dom.window.getSelection();
    selection.selectAllChildren(element.querySelector('p'));
    selection.collapseToEnd();
    await new Promise((ok) => setTimeout(ok, 30));
  };
  const saved = async () => {
    button('Save').click();
    await wait(
      () => doc.querySelector('[role=status]').textContent === 'Saved'
    );
  };
  const close = async () => {
    const r = await dom.window.clutterWindow.prepareClose();
    await new Promise((ok) => setTimeout(ok, 40));
    return r;
  };
  const dispose = async () => {
    try {
      await control(dir, {
        failSaves: false,
        failProtection: false,
        failViewState: false,
      });
      await close();
    } finally {
      dom.window.close();
    }
    assert.deepEqual(errors, []);
  };
  return {
    doc,
    dom,
    wait,
    button,
    active,
    panes,
    tabs,
    api,
    menu,
    type,
    saved,
    close,
    dispose,
    m,
    instanceId: JSON.parse(start.out).instanceId,
  };
}
test('React navigation stays in the current tab, owns split layouts per tab, and keeps same-note views consistent', async () => {
  const dir = await session();
  let ui = await browserWindow(dir, 'window54', {
    allowDuplicateNoteInTab: true,
  });
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const first = ui.panes()[0].dataset.page;
    await ui.type('FIRST PAGE');
    await ui.saved();
    ui.button('+ New page').click();
    await ui.wait(
      () =>
        ui.doc.querySelectorAll('.page-link').length === 2 &&
        ui.active()?.textContent === ''
    );
    const second = ui.panes()[0].dataset.page;
    await ui.type('SECOND PAGE');
    await ui.saved();
    assert.equal(ui.tabs().length, 1);
    ui.doc.querySelector('[aria-label=Back]').click();
    await ui.wait(() => ui.active()?.textContent === 'FIRST PAGE');
    ui.doc.querySelector('[aria-label=Forward]').click();
    await ui.wait(() => ui.active()?.textContent === 'SECOND PAGE');
    const previousEditor = ui.active();
    const originalFetch = ui.dom.window.fetch;
    let releaseNavigation,
      held = false;
    ui.dom.window.fetch = async (address, options = {}) => {
      if (
        !held &&
        String(address).endsWith('/view-state') &&
        JSON.parse(options.body).action === 'write'
      ) {
        held = true;
        await new Promise((ok) => (releaseNavigation = ok));
      }
      return originalFetch(address, options);
    };
    await ui.menu(first, 'Open in split view');
    await ui.wait(() => held);
    try {
      assert.equal(
        ui.active(),
        previousEditor,
        'current editor must remain mounted while navigation is prepared'
      );
      assert.equal(previousEditor.isConnected, true);
      assert.equal(previousEditor.getAttribute('contenteditable'), 'true');
      assert.equal(ui.button('+ New page').textContent, '+ New page');
      for (const control of ui.doc.querySelectorAll(
        '.sidebar button, [role=tab], .editor-tools button'
      ))
        assert.equal(control.disabled, false);
      assert.equal(
        ui.doc.querySelector('.page-bar button:last-child').disabled,
        false
      );
      assert(!ui.doc.body.textContent.includes('Preparing view'));
    } finally {
      releaseNavigation();
      ui.dom.window.fetch = originalFetch;
    }

    await ui.wait(
      () => ui.panes().length === 2 && ui.active()?.textContent === 'FIRST PAGE'
    );
    assert.deepEqual(
      ui.panes().map((p) => p.querySelector('.ProseMirror')?.textContent),
      ['SECOND PAGE', 'FIRST PAGE']
    );
    assert.equal(ui.tabs().length, 1);
    const untouchedPane = ui.panes()[0].querySelector('.ProseMirror');
    ui.doc.querySelector('.page-link[data-page="' + second + '"]').click();
    await ui.wait(() => ui.active()?.textContent === 'SECOND PAGE');
    assert.equal(
      ui.panes()[0].querySelector('.ProseMirror'),
      untouchedPane,
      'unaffected split editor must not remount'
    );
    ui.doc.querySelector('[aria-label=Back]').click();
    await ui.wait(() => ui.active()?.textContent === 'FIRST PAGE');
    assert.equal(ui.panes()[0].querySelector('.ProseMirror'), untouchedPane);
    await ui.menu(second, 'Open in new tab');
    await ui.wait(
      () =>
        ui.tabs().length === 2 &&
        ui.panes().length === 1 &&
        ui.active()?.textContent === 'SECOND PAGE'
    );
    // Normal click must not switch to another existing tab or create a tab.
    ui.doc.querySelector('.page-link[data-page="' + first + '"]').click();
    await ui.wait(() => ui.active()?.textContent === 'FIRST PAGE');
    assert.equal(ui.tabs()[1].getAttribute('aria-selected'), 'true');
    assert.equal(ui.tabs().length, 2);
    ui.tabs()[0].click();
    await ui.wait(
      () => ui.panes().length === 2 && ui.active()?.textContent === 'FIRST PAGE'
    );
    await ui.menu(second, 'Open in split view');
    await ui.wait(
      () =>
        ui.panes().length === 3 && ui.active()?.textContent === 'SECOND PAGE'
    );
    await ui.type('SECOND PAGE SHARED');
    await ui.saved();
    await ui.wait(
      () =>
        ui.panes()[0].querySelector('.ProseMirror')?.textContent ===
        'SECOND PAGE SHARED'
    );
    // A dirty context on a hidden tab must still refuse unsafe close.
    await control(dir, { failSaves: true, failProtection: true });
    await ui.type('SECOND PAGE SHARED PENDING');
    ui.tabs()[1].click();
    await ui.wait(
      () => ui.panes().length === 1 && ui.active()?.textContent === 'FIRST PAGE'
    );
    assert.equal((await ui.close()).safe, false);
    await ui.wait(
      () => ui.active()?.getAttribute('contenteditable') === 'true'
    );
    await control(dir, { failSaves: false, failProtection: false });
    const instance = ui.instanceId;
    assert.equal((await ui.close()).safe, true);
    const list = await ui.api({ method: 'page.list' });
    assert.equal(list.value.pages.length, 2);
    const bodies = [];
    for (const page of list.value.pages)
      bodies.push(
        (await ui.api({ method: 'page.read', pageId: page.pageId })).value
          .content.value.content[1].content[0].text
      );
    assert.deepEqual(
      bodies.sort(),
      ['FIRST PAGE', 'SECOND PAGE SHARED PENDING'].sort()
    );
    await ui.dispose();
    ui = null;
    // Reopening the same window restores tab-owned layouts and view identities.
    ui = await browserWindow(dir, 'window54', {
      allowDuplicateNoteInTab: true,
    });
    assert.equal(ui.instanceId, instance);
    await ui.wait(
      () => ui.tabs().length === 2 && ui.active()?.textContent === 'FIRST PAGE'
    );
    assert.equal(ui.tabs()[1].getAttribute('aria-selected'), 'true');
    ui.tabs()[0].click();
    await ui.wait(
      () =>
        ui.panes().length === 3 &&
        ui.active()?.textContent === 'SECOND PAGE SHARED PENDING'
    );
    assert.equal(ui.doc.querySelector('[aria-label=Back]').disabled, true);
  } finally {
    if (ui) await ui.dispose();
  }
});
test('protected edits remain recoverable in their original hidden tab after close and owner restart', async () => {
  const dir = await session();
  let ui = await browserWindow(dir, 'recover-window');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const page = ui.panes()[0].dataset.page;
    await ui.type('ACCEPTED');
    await ui.saved();
    await ui.menu(page, 'Open in new tab');
    await ui.wait(
      () => ui.tabs().length === 2 && ui.active()?.textContent === 'ACCEPTED'
    );
    const protectedPane = ui.panes()[0].dataset.pane;
    await control(dir, { failSaves: true });
    await ui.type('ACCEPTED PROTECTED');
    ui.tabs()[0].click();
    await ui.wait(() => ui.active()?.textContent === 'ACCEPTED');
    assert.equal((await ui.close()).safe, true);
    ui.dom.window.close();
    ui = null;
    await control(dir, 'stop');
    // The process-restart helper must reuse this same session, not a fresh Space.
    const metadata = readSession(dir, resources);
    for (let n = 0; n < 100; n++) {
      try {
        await fetch(`http://127.0.0.1:${metadata.port}/status`, {
          signal: AbortSignal.timeout(100),
        });
      } catch {
        break;
      }
      await new Promise((ok) => setTimeout(ok, 20));
    }
    ui = await browserWindow(dir, 'recover-window');
    await ui.wait(
      () => ui.tabs().length === 2 && ui.active()?.textContent === 'ACCEPTED'
    );
    ui.tabs()[1].click();
    await ui.wait(
      () =>
        ui.active()?.textContent === 'ACCEPTED' &&
        ui.active()?.closest('[data-pane]').dataset.pane === protectedPane
    );
    ui.button('Recover protected work').click();
    await ui.wait(() => ui.active()?.textContent === 'ACCEPTED PROTECTED');
    await ui.saved();
    assert.equal(
      (await ui.api({ method: 'page.read', pageId: page })).value.content.value
        .content[1].content[0].text,
      'ACCEPTED PROTECTED'
    );
  } finally {
    if (ui) await ui.dispose();
  }
});
test('window-state endpoint is UI-only and navigation write failure refuses close without replacing state', async () => {
  const dir = await session();
  let ui = await browserWindow(dir);
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const page = ui.panes()[0].dataset.page;
    await ui.type('BODY ONLY IN CORE');
    await ui.saved();
    const url = `http://127.0.0.1:${ui.m.port}/view-state`;
    const request = { action: 'read', windowId: 'window54' };
    const send = async (token, body) =>
      fetch(url, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const record = await (await send(ui.m.tokens.ui, request)).json();
    assert(record.ok);
    assert(!record.value.value.includes('BODY ONLY IN CORE'));
    assert(record.value.value.includes(page));
    assert.equal((await send(ui.m.tokens.admin, request)).status, 403);
    assert.equal((await send(ui.m.tokens.automation, request)).status, 400);
    await control(dir, { failViewState: true });
    assert.equal((await ui.close()).safe, false);
    await ui.wait(
      () => ui.active()?.getAttribute('contenteditable') === 'true'
    );
    assert.equal(
      (await (await send(ui.m.tokens.ui, request)).json()).value.value,
      record.value.value
    );
    await control(dir, { failViewState: false });
    ui.button('Retry navigation').click();
    await ui.wait(
      () =>
        ui.active()?.textContent === 'BODY ONLY IN CORE' &&
        !ui.doc
          .querySelector('[role=status]')
          .textContent.includes('Retry navigation')
    );
    await control(dir, { failViewState: true });
    await ui.menu(page, 'Open in new tab');
    await ui.wait(() => !!ui.button('Retry navigation'));
    assert.equal(
      ui.tabs().length,
      1,
      'an unregistered destination must not be published'
    );
    assert.equal(ui.active()?.textContent, 'BODY ONLY IN CORE');
    assert.equal((await ui.close()).safe, false);
    await control(dir, { failViewState: false });
    ui.button('Retry navigation').click();
    await ui.wait(
      () =>
        ui.tabs().length === 2 &&
        ui.tabs()[1].getAttribute('aria-selected') === 'true' &&
        ui.active()?.textContent === 'BODY ONLY IN CORE'
    );
    assert.equal((await ui.close()).safe, true);
  } finally {
    if (ui) await ui.dispose();
  }
});
test('runtime/bootstrap pins fail closed and no secret is placed in the navigation address', () => {
  assert.equal(lock.version, 'v24.22.1');
  assert.throws(() => verifyArchive(Buffer.from('bad'), 'arm64'), /CHECKSUM/);
  assert.throws(() =>
    bootstrap({ url: 'https://example.invalid/', bootNonce: 'x', token: 't' })
  );
  const script = bootstrap({
    url: 'http://127.0.0.1:12345/',
    bootNonce: 'n',
    token: 'private',
    spaceId: 's',
    windowId: 'w',
  });
  assert.match(script, /location.origin/);
  assert.doesNotMatch(script, /clutter-structured53:\/\/event[^']*private/);
});

test('native ATS preparation replaces existing broad exceptions and fails closed on probe errors', () => {
  for (const exists of [true, false]) {
    const calls = [];
    setLoopbackPolicy('/generated/Test.app/Contents/Info.plist', (_, args) => {
      calls.push(args[1]);
      return calls.length === 1
        ? { status: exists ? 0 : 1, stderr: exists ? '' : 'Does Not Exist' }
        : { status: 0 };
    });
    assert.equal(calls.includes('Delete :NSAppTransportSecurity'), exists);
    assert.equal(
      calls.at(-1),
      'Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true'
    );
  }
  assert.throws(
    () =>
      setLoopbackPolicy('/generated/Test.app/Contents/Info.plist', () => ({
        status: 1,
        stderr: 'Permission denied',
      })),
    /ATS_PROBE_FAILED/
  );
  assert.throws(
    () => setLoopbackPolicy('/not-a-generated-plist', () => ({ status: 0 })),
    /GENERATED_APP_PLIST_REQUIRED/
  );
});

test('creation and split preparation preserve shell controls, existing editability and focus; actual PM surfaces stage before reveal', async () => {
  const dir = await session();
  const ui = await browserWindow(dir, 'stable-window');
  let release = () => {},
    restore;
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const first = ui.panes()[0].dataset.page;
    await ui.type('KEEP EDITABLE');
    await ui.saved();
    const shell = ui.doc.querySelector('.workspace'),
      sidebar = ui.doc.querySelector('.sidebar'),
      panel = ui.doc.querySelector('.tab-panel');
    const original = ui.active(),
      initialFocus = ui.doc.activeElement;
    const mutations = [],
      staged = [];
    const observer = new ui.dom.window.MutationObserver((records) => {
      for (const record of records) {
        if (
          record.type === 'attributes' &&
          record.attributeName === 'disabled' &&
          record.target.closest('.workspace') &&
          !record.target.matches('[aria-label=Back], [aria-label=Forward]')
        )
          mutations.push(record);
        for (const node of record.addedNodes)
          if (node.nodeType === 1 && node.matches('.ProseMirror'))
            staged.push({ node, staged: !!node.closest('.surface-staging') });
      }
    });
    observer.observe(ui.doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['disabled'],
    });
    restore = ui.dom.window.fetch;
    let held = false;
    ui.dom.window.fetch = async (address, options = {}) => {
      if (
        !held &&
        String(address).endsWith('/api') &&
        JSON.parse(options.body).method === 'page.create'
      ) {
        held = true;
        await new Promise((ok) => (release = ok));
      }
      return restore(address, options);
    };
    ui.button('+ New page').click();
    await ui.wait(() => held);
    assert.equal(ui.active(), original);
    assert.equal(original.getAttribute('contenteditable'), 'true');
    assert.equal(ui.doc.activeElement, initialFocus);
    assert.equal(ui.button('+ New page').textContent, '+ New page');
    for (const b of ui.doc.querySelectorAll(
      '.sidebar button, [role=tab], .editor-tools button'
    ))
      assert.equal(b.disabled, false);
    assert.equal(mutations.length, 0);
    // Duplicate activation joins the same request instead of creating another page.
    ui.button('+ New page').click();
    release();
    await ui.wait(
      () =>
        ui.doc.querySelectorAll('.page-link').length === 2 &&
        ui.active() !== original
    );
    ui.dom.window.fetch = restore;
    const second = ui.panes()[0].dataset.page;
    assert(staged.some((e) => e.node === ui.active() && e.staged));
    assert.equal(ui.doc.querySelector('.workspace'), shell);
    assert.equal(ui.doc.querySelector('.sidebar'), sidebar);
    assert.equal(ui.doc.querySelector('.tab-panel'), panel);
    const paneHost = ui.panes()[0];
    ui.doc.querySelector('.page-link[data-page="' + first + '"]').click();
    await ui.wait(() => ui.active() === original);
    assert.equal(
      ui.panes()[0],
      paneHost,
      'pane host outlives its page binding'
    );
    ui.doc.querySelector('.page-link[data-page="' + second + '"]').click();
    await ui.wait(() => ui.panes()[0].dataset.page === second && !!ui.active());
    const secondView = ui.active();
    held = false;
    ui.dom.window.fetch = async (address, options = {}) => {
      if (
        !held &&
        String(address).endsWith('/api') &&
        JSON.parse(options.body).method === 'editor.open'
      ) {
        held = true;
        await new Promise((ok) => (release = ok));
      }
      return restore(address, options);
    };
    await ui.menu(first, 'Open in split view');
    await ui.wait(() => held);
    assert.equal(
      ui.panes().length,
      1,
      'no empty split exposed during editor preparation'
    );
    assert.equal(ui.active(), secondView);
    assert.equal(secondView.getAttribute('contenteditable'), 'true');
    // Continue working in the source pane: completion must not steal active pane/focus.
    ui.panes()[0].dispatchEvent(
      new ui.dom.window.Event('pointerdown', { bubbles: true })
    );
    await ui.type('CONTINUED WHILE PREPARING', secondView);
    const focus = ui.doc.activeElement;
    release();
    await ui.wait(() => ui.panes().length === 2);
    assert.equal(ui.active(), secondView);
    assert.equal(ui.doc.activeElement, focus);
    assert.equal(
      ui.panes()[1].querySelector('.ProseMirror').textContent,
      'KEEP EDITABLE'
    );
    assert(
      staged.some(
        (e) =>
          e.node === ui.panes()[1].querySelector('.ProseMirror') && e.staged
      )
    );
    assert.equal(ui.panes()[0], paneHost);
    assert.equal(ui.doc.querySelector('.workspace'), shell);
    assert.equal(
      mutations.length,
      0,
      'normal lifecycle must not toggle unrelated disabled attributes'
    );
    observer.disconnect();
    ui.dom.window.fetch = restore;
    await ui.saved();
  } finally {
    release();
    if (restore) ui.dom.window.fetch = restore;
    await ui.dispose();
  }
});

test('default menu blocks only already-displayed split notes; new tabs/windows share Core with independent views and close guards', async () => {
  const dir = await session();
  let child = null,
    requests = [];
  const ui = await browserWindow(dir, 'parent-window', {
    onOpenWindow: async (request) => {
      requests.push(request);
      child = await browserWindow(dir, 'child-window', {
        initialPageId: request.pageId,
      });
      return { windowId: 'child-window' };
    },
  });
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const page = ui.panes()[0].dataset.page;
    await ui.type('SHARED PAGE');
    await ui.saved();
    const row = ui.doc.querySelector('.page-row');
    row.querySelector('.note-menu-trigger').click();
    await ui.wait(() => !!row.querySelector('[role=menu]'));
    const split = [...row.querySelectorAll('[role=menuitem]')].find(
      (b) => b.textContent === 'Open in split view'
    );
    assert.equal(split.disabled, true);
    split.click();
    assert.equal(ui.panes().length, 1);
    [...row.querySelectorAll('[role=menuitem]')]
      .find((b) => b.textContent === 'Open in new window')
      .click();
    await ui.wait(() => child?.active()?.textContent === 'SHARED PAGE');
    assert.equal(requests.length, 1);
    assert.equal(
      child.instanceId,
      ui.instanceId,
      'both UIs use one running owner'
    );
    assert.notEqual(child.active(), ui.active());
    assert.equal(ui.tabs().length, 1, 'new window does not add a source tab');
    await child.type('SHARED PAGE FROM CHILD');
    await child.saved();
    await ui.wait(() => ui.active()?.textContent === 'SHARED PAGE FROM CHILD');
    await control(dir, { failSaves: true, failProtection: true });
    await child.type('CHILD PENDING');
    assert.equal((await child.close()).safe, false);
    assert.equal(ui.active().getAttribute('contenteditable'), 'true');
    await control(dir, { failSaves: false, failProtection: false });
    await child.saved();
    assert.equal((await child.close()).safe, true);
    await ui.menu(page, 'Open in new tab');
    await ui.wait(() => ui.tabs().length === 2);
    assert.equal(ui.panes().length, 1);
  } finally {
    if (child) await child.dispose();
    await ui.dispose();
  }
});

test('3A real UI title starts empty, updates tab/sidebar without replacing the editor, and persists with body', async () => {
  const dir = await session();
  const ui = await browserWindow(dir, 'title60');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const editor = ui.active(),
      pageId = ui.panes()[0].dataset.page;
    const title = editor.querySelector('[data-title]');
    assert.equal(title.textContent, '');
    assert.equal(title.getAttribute('data-placeholder'), 'New note');
    const selection = ui.dom.window.getSelection();
    assert(
      title.contains(selection.anchorNode) || selection.anchorNode === title,
      'new note focuses title'
    );
    title.textContent = 'Working title';
    selection.selectAllChildren(title);
    selection.collapseToEnd();
    await ui.wait(
      () =>
        ui.doc.querySelector('.page-link span:last-child').textContent ===
        'Working title'
    );
    assert(ui.tabs()[0].textContent.includes('Working title'));
    assert.equal(ui.active(), editor);
    assert.equal(editor.querySelector('[data-title]'), title);
    await ui.type('Body belongs to same document', editor);
    await ui.saved();
    const read = await ui.api({ method: 'page.read', pageId });
    assert(read.ok);
    assert.equal(read.value.title, 'Working title');
    assert.equal(
      read.value.content.value.content[1].content[0].text,
      'Body belongs to same document'
    );
    assert.equal(ui.active(), editor);
    ui.button('+ New page').click();
    await ui.wait(() => ui.panes()[0].dataset.page !== pageId);
    ui.doc.querySelector('.page-link[data-page="' + pageId + '"]').click();
    await ui.wait(() => ui.panes()[0].dataset.page === pageId);
    assert.equal(ui.active(), editor);
    assert.equal(
      editor.querySelector('[data-title]').textContent,
      'Working title'
    );
  } finally {
    await ui.dispose();
  }
});

test('61 production React slash menu inserts a heading without remount or focus loss, then persists it', async () => {
  const dir = await session(),
    ui = await browserWindow(dir, 'slash61');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const editor = ui.active(),
      pageId = ui.panes()[0].dataset.page,
      p = editor.querySelector('p');
    editor.focus();
    p.textContent = 'before/h2after';
    ui.dom.window
      .getSelection()
      .setBaseAndExtent(p.firstChild, 9, p.firstChild, 9);
    await ui.wait(() => !!ui.doc.querySelector('[role=listbox]'));
    const menu = ui.doc.querySelector('[role=listbox]');
    assert.deepEqual(
      [...menu.querySelectorAll('[role=option]')].map((n) => n.textContent),
      ['Heading 2']
    );
    const option = menu.querySelector('button');
    option.dispatchEvent(
      new ui.dom.window.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      })
    );
    option.click();
    await ui.wait(() => !!editor.querySelector('h2'));
    assert.equal(ui.active(), editor);
    assert.equal(ui.doc.activeElement, editor);
    assert.equal(editor.querySelector('h2').textContent, '');
    assert.deepEqual(
      [...editor.querySelectorAll('p')].map((n) => n.textContent),
      ['beforeafter']
    );
    assert(
      editor
        .querySelector('h2')
        .contains(ui.dom.window.getSelection().anchorNode)
    );
    await ui.saved();
    const value = (await ui.api({ method: 'page.read', pageId })).value;
    assert.equal(value.content.value.content[2].type, 'heading');
    assert.equal(value.content.value.content[2].attrs.level, 2);
    assert.equal(ui.active(), editor);
  } finally {
    await ui.dispose();
  }
});

test('63 production separator placement retains the same paragraph DOM and caret for empty and nonempty blocks', async () => {
  const dir = await session(),
    ui = await browserWindow(dir, 'separator63');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const editor = ui.active(),
      pageId = ui.panes()[0].dataset.page;
    for (const value of ['/separator', 'prefix/separator']) {
      // First remove the previous divider through normal retained-context Undo.
      if (editor.querySelector('hr')) {
        ui.button('Undo').click();
        await ui.wait(() => !editor.querySelector('hr'));
      }
      const p = editor.querySelector('p');
      await ui.type(value, editor);
      await ui.wait(
        () => ui.doc.querySelector('[role=option]')?.textContent === 'Separator'
      );
      ui.doc.querySelector('[role=option]').click();
      await ui.wait(() => !!editor.querySelector('hr'));
      assert(ui.active() === editor, 'editor DOM is retained');
      assert(
        editor.querySelector('p') === p,
        'paragraph DOM is retained during insertion'
      );
      assert(ui.doc.activeElement === editor, 'editor retains focus');
      const selection = ui.dom.window.getSelection();
      assert(p.contains(selection.anchorNode) || selection.anchorNode === p);
      if (value === '/separator') {
        assert(
          editor.querySelector('hr').nextElementSibling === p,
          'divider is above current paragraph'
        );
        assert.equal(p.textContent, '');
        assert.equal(editor.querySelectorAll('p').length, 1);
      } else {
        assert.equal(p.nextElementSibling.tagName, 'HR');
        assert.equal(p.textContent, 'prefix');
        const beforeCaret = ui.doc.createRange();
        beforeCaret.selectNodeContents(p);
        beforeCaret.setEnd(selection.anchorNode, selection.anchorOffset);
        assert.equal(beforeCaret.toString().length, 6);
      }
      await ui.saved();
      const read = (await ui.api({ method: 'page.read', pageId })).value;
      assert.deepEqual(
        read.content.value.content.map((n) => n.type),
        value === '/separator'
          ? ['title', 'separator', 'paragraph']
          : ['title', 'paragraph', 'separator']
      );
    }
  } finally {
    await ui.dispose();
  }
});

test('64 real list menu, markers, Enter/Tab and saved reopen use the retained editor and shared Core', async () => {
  const dir = await session();
  let ui = await browserWindow(dir, 'lists64');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const editor = ui.active();
    await ui.type('/ol');
    await ui.wait(
      () =>
        ui.doc.querySelector('[role=option]')?.textContent === 'Ordered list'
    );
    ui.doc.querySelector('[role=option]').click();
    await ui.wait(() => !!editor.querySelector('[data-list-style]'));
    const typeList = async (value) => {
      const selected = ui.dom.window.getSelection();
      const list = [...editor.querySelectorAll('[data-list-style]')].at(-1);
      editor.focus();
      list.textContent = value;
      selected.selectAllChildren(list);
      selected.collapseToEnd();
      await new Promise((ok) => setTimeout(ok, 30));
    };
    const key = (key, extra = {}) =>
      editor.dispatchEvent(
        new ui.dom.window.KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
          ...extra,
        })
      );
    await typeList('First');
    key('Enter');
    await ui.wait(
      () => editor.querySelectorAll('[data-list-style]').length === 2
    );
    await typeList('Second');
    key('Tab');
    await ui.wait(
      () =>
        [...editor.querySelectorAll('[data-list-style]')].at(-1).dataset
          .indent === '1'
    );
    key('Tab', { shiftKey: true });
    await ui.wait(
      () =>
        [...editor.querySelectorAll('[data-list-style]')].at(-1).dataset
          .indent === '0'
    );
    assert.deepEqual(
      [...editor.querySelectorAll('[data-list-style]')].map(
        (n) => n.dataset.marker
      ),
      ['1.', '2.']
    );
    assert(ui.active() === editor);
    await ui.saved();
    const pageId = ui.panes()[0].dataset.page;
    const read = (await ui.api({ method: 'page.read', pageId })).value;
    assert.equal(read.content.value.content[1].type, 'list_item');
    assert.equal(read.content.value.content[2].content[0].text, 'Second');
    await ui.dispose();
    ui = await browserWindow(dir, 'lists64');
    await ui.wait(
      () => ui.active()?.querySelectorAll('[data-list-style]').length === 2
    );
    assert.deepEqual(
      [...ui.active().querySelectorAll('[data-list-style]')].map(
        (n) => n.textContent
      ),
      ['First', 'Second']
    );
  } finally {
    await ui.dispose();
  }
});
