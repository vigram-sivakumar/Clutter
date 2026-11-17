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
  privateJSON,
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
    assert.equal(editor.querySelector('h2').textContent, 'beforeafter');
    assert.deepEqual(
      [...editor.querySelectorAll('p')].map((n) => n.textContent),
      []
    );
    assert(
      editor
        .querySelector('h2')
        .contains(ui.dom.window.getSelection().anchorNode)
    );
    await ui.saved();
    const value = (await ui.api({ method: 'page.read', pageId })).value;
    assert.equal(value.content.value.content[1].type, 'heading');
    assert.equal(value.content.value.content[1].attrs.level, 2);
    assert.equal(ui.active(), editor);
  } finally {
    await ui.dispose();
  }
});

test('67 production separator selection, continuation, deletion and accepted persistence keep one editor', async () => {
  const dir = await session(),
    ui = await browserWindow(dir, 'separator67');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const editor = ui.active(),
      pageId = ui.panes()[0].dataset.page;
    await ui.type('prefix/separator', editor);
    await ui.wait(
      () => ui.doc.querySelector('[role=option]')?.textContent === 'Separator'
    );
    ui.doc.querySelector('[role=option]').click();
    await ui.wait(() => !!editor.querySelector('hr.ProseMirror-selectednode'));
    assert.equal(editor.querySelector('p').textContent, 'prefix');
    assert.equal(editor.querySelectorAll('p').length, 1);
    assert.equal(ui.doc.activeElement, editor);
    editor.dispatchEvent(
      new ui.dom.window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      })
    );
    await ui.wait(() => editor.querySelectorAll('p').length === 2);
    const after = editor.querySelectorAll('p')[1];
    const selection = ui.dom.window.getSelection();
    assert(
      after.contains(selection.anchorNode) || selection.anchorNode === after
    );
    assert.equal(editor.querySelector('hr.ProseMirror-selectednode'), null);
    await ui.saved();
    const read = (await ui.api({ method: 'page.read', pageId })).value;
    assert.deepEqual(
      read.content.value.content.map((n) => n.type),
      ['title', 'paragraph', 'separator', 'paragraph']
    );
    assert.equal(ui.active(), editor);
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

test('66 production paragraphs and converted headings share indentation and the paragraph margin cascade', async () => {
  const dir = await session(),
    ui = await browserWindow(dir, 'indent66');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const editor = ui.active();
    const key = (key, extra = {}) =>
      editor.dispatchEvent(
        new ui.dom.window.KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
          ...extra,
        })
      );
    await ui.type('Source');
    key('Tab');
    key('Tab');
    await ui.wait(() => editor.querySelector('p').dataset.indent === '2');
    assert.equal(
      editor.querySelector('p').style.getPropertyValue('--block-indent'),
      '2'
    );
    // jsdom cannot resolve var/calc layout pixels here. Assert the actual DOM
    // projection; native visual confirmation for C01 remains a separate check.

    await ui.type('Source/h2');
    await ui.wait(
      () => ui.doc.querySelector('[role=option]')?.textContent === 'Heading 2'
    );
    ui.doc.querySelector('[role=option]').click();
    await ui.wait(() => !!editor.querySelector('h2'));
    let heading = editor.querySelector('h2');
    assert.equal(heading.textContent, 'Source');
    assert.equal(heading.dataset.indent, '2');
    assert.equal(editor.querySelectorAll('p').length, 0);
    key('Tab', { shiftKey: true });
    await ui.wait(() => editor.querySelector('h2').dataset.indent === '1');
    key('Tab', { shiftKey: true });
    assert.equal(editor.querySelector('h2').dataset.indent, '0');
    heading = editor.querySelector('h2');
    heading.textContent = 'Source/ol';
    const selection = ui.dom.window.getSelection();
    selection.selectAllChildren(heading);
    selection.collapseToEnd();
    await ui.wait(
      () =>
        ui.doc.querySelector('[role=option]')?.textContent === 'Ordered list'
    );
    ui.doc.querySelector('[role=option]').click();
    await ui.wait(() => !!editor.querySelector('[data-list-style]'));
    assert.equal(
      editor.querySelector('[data-list-style]').textContent,
      'Source'
    );
    assert.equal(editor.querySelectorAll('h2').length, 0);
    key('Tab');
    key('Tab');
    const row = editor.querySelector('[data-list-style]');
    selection.selectAllChildren(row);
    selection.collapseToStart();
    await new Promise((ok) => setTimeout(ok, 30));
    key('Backspace');
    await ui.wait(() => !!editor.querySelector('p'));
    const paragraph = editor.querySelector('p');
    assert.equal(paragraph.dataset.indent, '2');
    assert.equal(paragraph.style.getPropertyValue('--block-indent'), '2');

    assert(ui.active() === editor);
    await ui.saved();
    const read = (
      await ui.api({ method: 'page.read', pageId: ui.panes()[0].dataset.page })
    ).value;
    assert.equal(read.content.value.content[1].attrs.indent, 2);
    assert.equal(read.content.value.content[1].type, 'paragraph');
  } finally {
    await ui.dispose();
  }
});

// Native window IDs are represented by short-lived processes ONLY for the PID
// transition guard. React/PM and bundled CLI/MCP/Core/SQLite below are real; this
// does not qualify a native Mac window or its visual restoration.
test('68 bundled CLI/MCP acceptance runner verifies conflict, UI save and same-session context reopen', async () => {
  const dir = await session(),
    reportDir = join(base, 'client-check68-' + crypto.randomUUID());
  mkdirSync(reportDir, { mode: 0o700 });
  const locator = join(reportDir, 'current.json'),
    processes = [];
  const fakeWindow = () => {
    const p = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      stdio: 'ignore',
    });
    processes.push(p);
    return p;
  };
  let windowProcess = fakeWindow(),
    ui = await browserWindow(dir, 'clients68');
  const current = {
    format: 'clutter-structured-run53',
    resources,
    session: dir,
    uiPid: windowProcess.pid,
  };
  privateJSON(locator, current);
  const check = async (phase) => {
    const child = spawn(
      process.execPath,
      [
        resolve(
          'packages/desktop-runtime/test/fixtures/client-check-entry.mjs'
        ),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    let output = '',
      stderr = '';
    child.stdout.on('data', (c) => (output += c));
    child.stderr.on('data', (c) => (stderr += c));
    const ended = once(child, 'exit');
    child.stdin.end(
      JSON.stringify({
        phase,
        locator,
        recordsDirectory: join(reportDir, 'reports'),
      })
    );
    const [code] = await ended;
    const reply = JSON.parse(output);
    if (!reply.ok) throw Error(reply.error);
    assert.equal(code, 0, stderr);
    return reply.value;
  };
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    await ui.type('UNRELATED NOTE');
    await ui.saved();
    const unrelatedId = ui.panes()[0].dataset.page;
    const unrelated = (
      await ui.api({ method: 'page.read', pageId: unrelatedId })
    ).value;
    const prepared = await check('prepare');
    assert.equal(prepared.status, 'peer-checks-pass-awaiting-ui');
    assert.equal(prepared.checks.cliReadWrite, 'PASS');
    assert.equal(prepared.checks.mcpHandshakeReadWrite, 'PASS');
    assert.equal(prepared.checks.cliStaleConflict, 'PASS');
    assert.equal(prepared.checks.mcpStaleConflict, 'PASS');
    await assert.rejects(() => check('prepare'), /CHECK_ALREADY_PREPARED/);
    await assert.rejects(
      () => check('verify'),
      /UI_MARKER_OR_TEST_TEXT_NOT_SAVED/
    );
    const listing = await ui.api({ method: 'page.list', limit: 50 });
    assert.equal(listing.ok, true, JSON.stringify(listing));
    ui.button('Refresh pages').click();
    await ui.wait(() =>
      ui.doc.querySelector('[data-page="' + prepared.pageId + '"]')
    );
    ui.doc
      .querySelector('.page-link[data-page="' + prepared.pageId + '"]')
      .click();
    await ui.wait(() => ui.active()?.textContent.includes('MCP UPDATED'));
    const editor = ui.active();
    assert(editor.textContent.includes('CLI CREATED'));
    assert(editor.textContent.includes('CLI UPDATED'));
    const p = editor.querySelectorAll('p')[2];
    p.textContent += ' UI VERIFIED';
    const selection = ui.dom.window.getSelection();
    selection.selectAllChildren(p);
    selection.collapseToEnd();
    await new Promise((resolve) => setTimeout(resolve, 40));
    await ui.saved();
    const saved = await check('verify');
    assert.equal(saved.status, 'ui-save-visible-to-cli-and-mcp');
    assert.equal(
      saved.nativeVisual,
      'not inferred; operator confirmation required'
    );
    await assert.rejects(() => check('verify-reopen'), /CLOSE_AND_REOPEN/);
    const before = (
      await ui.api({ method: 'page.read', pageId: prepared.pageId })
    ).value;
    await ui.dispose();
    ui = null;
    const ended = once(windowProcess, 'exit');
    windowProcess.kill();
    await ended;
    windowProcess = fakeWindow();
    current.uiPid = windowProcess.pid;
    privateJSON(locator, current);
    ui = await browserWindow(dir, 'clients68');
    await ui.wait(() => ui.active()?.textContent.includes('UI VERIFIED'));
    const reopened = await check('verify-reopen');
    assert.equal(reopened.status, 'same-root-after-window-reopen');
    assert.equal(reopened.windowProcessReplaced, true);
    assert.equal(
      reopened.ownerRestart,
      'not performed; this is window/context reopen'
    );
    const after = (
      await ui.api({ method: 'page.read', pageId: prepared.pageId })
    ).value;
    assert.equal(after.head, before.head);
    assert.equal(
      (await ui.api({ method: 'page.read', pageId: unrelatedId })).value.head,
      unrelated.head
    );
    const report = JSON.stringify(reopened);
    assert(!report.includes(readSession(dir, resources).tokens.automation));
    assert(!report.includes(readSession(dir, resources).tokens.ui));
  } finally {
    if (ui) await ui.dispose();
    for (const p of processes)
      if (p.exitCode === null && p.signalCode === null) {
        const done = once(p, 'exit');
        p.kill();
        await done;
      }
  }
});

test('69 production floating toolbar preserves body range through controls, saves formats and restores after context reopen', async () => {
  const dir = await session();
  let ui = await browserWindow(dir, 'format69');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    await ui.type('Alpha beta gamma');
    const editor = ui.active(),
      pageId = ui.panes()[0].dataset.page,
      p = editor.querySelector('p');
    const range = ui.doc.createRange();
    range.setStart(p.firstChild, 0);
    range.setEnd(p.firstChild, 5);
    const selection = ui.dom.window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    ui.doc.dispatchEvent(new ui.dom.window.Event('selectionchange'));
    await ui.wait(() =>
      ui.doc.querySelector('[role=toolbar][aria-label="Text formatting"]')
    );
    const toolbar = () =>
      ui.doc.querySelector('[role=toolbar][aria-label="Text formatting"]');
    for (const [label, tag] of [
      ['Bold', 'strong'],
      ['Italic', 'em'],
      ['Underline', 'u'],
      ['Strikethrough', 's'],
    ]) {
      const button = toolbar().querySelector(
        'button[aria-label="' + label + '"]'
      );
      const down = new ui.dom.window.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(down);
      assert(down.defaultPrevented);
      button.click();
      await ui.wait(() => editor.querySelector(tag)?.textContent === 'Alpha');
      assert.equal(selection.toString(), 'Alpha');
      assert.equal(ui.active(), editor);
    }
    for (const [label, value, selector] of [
      [
        'Text colour',
        'blue',
        'span[data-format="text_color"][data-preset="blue"]',
      ],
      [
        'Text highlight',
        'yellow',
        'span[data-format="highlight"][data-preset="yellow"]',
      ],
      ['Block background', 'green', 'p[data-background="green"]'],
    ]) {
      const select = toolbar().querySelector(
        'select[aria-label="' + label + '"]'
      );
      select.focus();
      select.value = value;
      select.dispatchEvent(
        new ui.dom.window.Event('change', { bubbles: true })
      );
      await ui.wait(() => !!editor.querySelector(selector));
      assert.equal(selection.toString(), 'Alpha');
      assert.equal(ui.doc.activeElement, editor);
    }
    toolbar().querySelector('[aria-label="Link"]').click();
    await ui.wait(
      () => !!toolbar()?.querySelector('input[aria-label="Link URL"]')
    );
    const input = toolbar().querySelector('input');
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(
      ui.dom.window.HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(input, 'javascript:alert(1)');
    input.dispatchEvent(new ui.dom.window.Event('input', { bubbles: true }));
    toolbar()
      .querySelector('form')
      .dispatchEvent(
        new ui.dom.window.Event('submit', { bubbles: true, cancelable: true })
      );
    await ui.wait(() => !!toolbar()?.querySelector('[role=alert]'));
    setter.call(input, 'https://example.com');
    input.dispatchEvent(new ui.dom.window.Event('input', { bubbles: true }));
    toolbar()
      .querySelector('form')
      .dispatchEvent(
        new ui.dom.window.Event('submit', { bubbles: true, cancelable: true })
      );
    await ui.wait(
      () =>
        editor.querySelector('a')?.getAttribute('href') ===
        'https://example.com'
    );
    assert.equal(selection.toString(), 'Alpha');
    await ui.saved();
    const read = (await ui.api({ method: 'page.read', pageId })).value;
    const block = read.content.value.content[1];
    assert.equal(block.attrs.background, 'green');
    assert.deepEqual(
      block.content[0].marks.map((m) => m.type).sort(),
      [
        'bold',
        'highlight',
        'italic',
        'link',
        'strike',
        'text_color',
        'underline',
      ].sort()
    );
    await ui.dispose();
    ui = await browserWindow(dir, 'format69');
    await ui.wait(() =>
      ui.active()?.querySelector('p[data-background="green"]')
    );
    assert.equal(ui.active().querySelector('strong').textContent, 'Alpha');
    assert.equal(
      ui.active().querySelector('a').getAttribute('href'),
      'https://example.com'
    );
    assert.equal(
      ui.doc.querySelector('[role=toolbar]'),
      null,
      'no stale toolbar on reopen without body range'
    );
  } finally {
    await ui.dispose();
  }
});

test('70 toolbar owns dropdown/link focus gaps without losing controls or mapped body selection', async () => {
  const dir = await session(),
    ui = await browserWindow(dir, 'toolbar70');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    await ui.type('Alpha beta gamma');
    const editor = ui.active(),
      pageId = ui.panes()[0].dataset.page,
      p = editor.querySelector('p');
    const selectAlpha = () => {
      editor.focus();
      const range = ui.doc.createRange();
      range.setStart(p.firstChild, 0);
      range.setEnd(p.firstChild, 5);
      const selection = ui.dom.window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      ui.doc.dispatchEvent(new ui.dom.window.Event('selectionchange'));
    };
    selectAlpha();
    const toolbar = () =>
      ui.doc.querySelector('[role=toolbar][aria-label="Text formatting"]');
    await ui.wait(() => !!toolbar());
    const gap = async (target, keyboard = false) => {
      if (keyboard)
        editor.dispatchEvent(
          new ui.dom.window.FocusEvent('focusout', {
            bubbles: true,
            relatedTarget: target,
          })
        );
      else
        target.dispatchEvent(
          new ui.dom.window.Event('pointerdown', {
            bubbles: true,
            cancelable: true,
          })
        );
      editor.blur();
      // Deliberately expose the missing-focus interval and an update, rather than
      // focusing the control immediately as the earlier jsdom test did.
      assert.equal(ui.doc.activeElement, ui.doc.body);
      await new Promise((resolve) => setTimeout(resolve, 20));
      ui.doc.dispatchEvent(new ui.dom.window.Event('scroll'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert(
        target.isConnected,
        'native control must not be unmounted during focus gap'
      );
      assert(toolbar(), 'toolbar retained while its control owns interaction');
      target.focus();
      await new Promise((resolve) => setTimeout(resolve, 10));
    };
    for (const [label, value, selector] of [
      ['Text colour', 'red', '[data-format="text_color"][data-preset="red"]'],
      [
        'Text highlight',
        'yellow',
        '[data-format="highlight"][data-preset="yellow"]',
      ],
      ['Block background', 'green', 'p[data-background="green"]'],
    ]) {
      const control = toolbar().querySelector(
        'select[aria-label="' + label + '"]'
      );
      await gap(control);
      control.value = value;
      control.dispatchEvent(
        new ui.dom.window.Event('change', { bubbles: true })
      );
      await ui.wait(() => !!editor.querySelector(selector));
      assert.equal(ui.dom.window.getSelection().toString(), 'Alpha');
      assert.equal(ui.doc.activeElement, editor);
    }
    toolbar().querySelector('[aria-label="Link"]').click();
    await ui.wait(() => !!toolbar()?.querySelector('input'));
    const input = toolbar().querySelector('input');
    await gap(input, true);
    const set = Object.getOwnPropertyDescriptor(
      ui.dom.window.HTMLInputElement.prototype,
      'value'
    ).set;
    set.call(input, 'https://example.com/focus');
    input.dispatchEvent(new ui.dom.window.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    input.blur();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert(input.isConnected);
    assert.equal(input.value, 'https://example.com/focus');
    const apply = [...toolbar().querySelectorAll('button')].find(
      (button) => button.textContent === 'Apply link'
    );
    apply.dispatchEvent(
      new ui.dom.window.Event('pointerdown', { bubbles: true })
    );
    apply.focus();
    toolbar()
      .querySelector('form')
      .dispatchEvent(
        new ui.dom.window.Event('submit', { bubbles: true, cancelable: true })
      );
    await ui.wait(
      () =>
        editor.querySelector('a')?.getAttribute('href') ===
        'https://example.com/focus'
    );
    assert.equal(ui.dom.window.getSelection().toString(), 'Alpha');
    toolbar().querySelector('[aria-label="Link"]').click();
    await ui.wait(() => !!toolbar()?.querySelector('input'));
    const remove = [...toolbar().querySelectorAll('button')].find(
      (button) => button.textContent === 'Remove link'
    );
    await gap(remove);
    remove.click();
    await ui.wait(() => !editor.querySelector('a'));
    assert.equal(ui.dom.window.getSelection().toString(), 'Alpha');
    // Genuine focus outside still dismisses; claiming toolbar interaction cannot
    // pin a stale toolbar after moving to application controls.
    ui.button('Save').dispatchEvent(
      new ui.dom.window.Event('pointerdown', { bubbles: true })
    );
    ui.button('Save').focus();
    await ui.wait(() => !toolbar());
    await ui.saved();
    const saved = (await ui.api({ method: 'page.read', pageId })).value;
    assert.equal(saved.content.value.content[1].attrs.background, 'green');
    const marks = saved.content.value.content[1].content[0].marks;
    assert(!marks.some((mark) => mark.type === 'link'));
    assert(
      marks.some(
        (mark) => mark.type === 'text_color' && mark.attrs.preset === 'red'
      )
    );
  } finally {
    await ui.dispose();
  }
});

test('71 production select-all excludes title, suppresses text replacement and saves explicit deletion with Undo/reopen', async () => {
  const dir = await session();
  let ui = await browserWindow(dir, 'blocks71');
  try {
    ui.button('+ New page').click();
    await ui.wait(() => !!ui.active());
    const pageId = ui.panes()[0].dataset.page,
      editor = ui.active();
    const read = (await ui.api({ method: 'page.read', pageId })).value;
    const content = pageContent('Visible title', 'Alpha beta', {
      title: 'select-title',
      body: 'select-one',
    });
    content.value.content.push({
      type: 'paragraph',
      attrs: { blockId: 'select-two', indent: 0, parentId: null },
      content: [{ type: 'text', text: 'Second' }],
    });
    assert(
      (
        await ui.api({
          method: 'page.update',
          pageId,
          operationId: crypto.randomUUID(),
          expectedHead: read.head,
          patch: { content },
        })
      ).ok
    );
    await ui.wait(
      () => editor.querySelector('p')?.textContent === 'Alpha beta'
    );
    editor.focus();
    const selection = ui.dom.window.getSelection();
    selection.selectAllChildren(editor.querySelector('p'));
    selection.collapseToEnd();
    ui.doc.dispatchEvent(new ui.dom.window.Event('selectionchange'));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const key = (key, extra = {}) =>
      editor.dispatchEvent(
        new ui.dom.window.KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
          ...extra,
        })
      );
    key('a', { metaKey: true });
    await ui.wait(() => selection.toString() === 'Alpha beta');
    key('a', { metaKey: true });
    await ui.wait(
      () => editor.querySelectorAll('.selected-body-block').length === 2
    );
    assert.equal(
      editor.querySelector('[data-title]').textContent,
      'Visible title'
    );
    assert(
      !editor
        .querySelector('[data-title]')
        .classList.contains('selected-body-block')
    );
    assert(editor.hasAttribute('data-body-selection'));
    await ui.wait(
      () =>
        !ui.doc.querySelector('[role=toolbar][aria-label="Text formatting"]')
    );
    const before = editor.textContent;
    const input = new ui.dom.window.InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'X',
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(input);
    assert(input.defaultPrevented);
    key('x');
    assert.equal(editor.textContent, before);
    key('Escape');
    assert.equal(editor.querySelectorAll('.selected-body-block').length, 0);
    assert(editor.hasAttribute('data-body-selection'));
    key('a', { metaKey: true });
    key('Delete');
    await ui.wait(
      () =>
        editor.querySelectorAll('p').length === 1 &&
        editor.querySelector('p').textContent === ''
    );
    assert.equal(
      editor.querySelector('[data-title]').textContent,
      'Visible title'
    );
    await ui.saved();
    const deleted = (await ui.api({ method: 'page.read', pageId })).value;
    assert.equal(deleted.title, 'Visible title');
    assert.equal(deleted.content.value.content.length, 2);
    ui.button('Undo').click();
    await ui.wait(
      () => editor.querySelector('p')?.textContent === 'Alpha beta'
    );
    await ui.saved();
    const restored = (await ui.api({ method: 'page.read', pageId })).value;
    assert.equal(restored.content.value.content.length, 3);
    await ui.dispose();
    ui = await browserWindow(dir, 'blocks71');
    await ui.wait(
      () => ui.active()?.querySelector('p')?.textContent === 'Alpha beta'
    );
    assert.equal(
      ui.active().querySelectorAll('.selected-body-block').length,
      0,
      'block selection is not saved with document'
    );
  } finally {
    await ui.dispose();
  }
});
