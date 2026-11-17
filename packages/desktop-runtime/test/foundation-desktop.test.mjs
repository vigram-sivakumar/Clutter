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
        title: 'Test page',
        body: {
          format: 'clutter.pm-json',
          schemaVersion: 1,
          value: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                attrs: { blockId: 'first' },
                content: [{ type: 'text', text: 'Alpha beta' }],
              },
            ],
          },
        },
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
test('React product creates pages, retains edits across navigation and refuses unsafe native close', async () => {
  const dir = await session(),
    m = readSession(dir, resources),
    start = await run(dir);
  assert.equal(start.code, 0, start.err);
  const before = JSON.parse(start.out).instanceId,
    url = `http://127.0.0.1:${m.port}`;
  const errors = [],
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
  try {
    Object.defineProperty(dom.window, 'crypto', { value: globalThis.crypto });
    dom.window.structuredClone = structuredClone;
    dom.window.AbortSignal = AbortSignal;
    // jsdom has no layout engine: these rectangles test command flow only.
    dom.window.Range.prototype.getClientRects = () => [];
    dom.window.Range.prototype.getBoundingClientRect = () => ({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
    });
    dom.window.TextEncoder = TextEncoder;
    dom.window.TextDecoder = TextDecoder;
    dom.window.fetch = (address, options = {}) =>
      fetch(address, {
        ...options,
        headers: { ...options.headers, origin: url },
      });
    dom.window.__clutterHost = {
      url,
      spaceId: m.spaceId,
      token: m.tokens.ui,
      windowId: 'window48',
    };
    dom.window.__clutterHostEvent = (e) => events.push(e);
    dom.window.eval(readFileSync(join(resources, 'web/app.js'), 'utf8'));
    for (let n = 0; n < 160 && !events.some((e) => e.event === 'ready'); n++)
      await new Promise((ok) => setTimeout(ok, 20));
    assert(
      events.some((e) => e.event === 'ready'),
      JSON.stringify({
        events,
        errors,
        status: dom.window.document.querySelector('[role=status]')?.textContent,
      })
    );

    const doc = dom.window.document;
    async function wait(check) {
      for (let n = 0; n < 200; n++) {
        if (check()) return;
        await new Promise((ok) => setTimeout(ok, 15));
      }
      assert(check(), doc.body.textContent);
    }
    const button = (text) =>
      [...doc.querySelectorAll('button')].find((b) => b.textContent === text);
    const editor = () => doc.querySelector('[data-pane=a] .ProseMirror');
    await wait(() => button('+ New page'));
    button('+ New page').click();
    await wait(() => editor());
    editor().focus();
    editor().querySelector('p').textContent = 'FIRST PAGE';
    await wait(
      () => doc.querySelector('[role=status]').textContent === 'Saved'
    );
    button('+ New page').click();
    await wait(
      () =>
        doc.querySelectorAll('.page-link').length === 2 &&
        editor()?.textContent === ''
    );
    editor().focus();
    editor().querySelector('p').textContent = 'SECOND PAGE';
    await new Promise((ok) => setTimeout(ok, 350));
    const pages = () => [...doc.querySelectorAll('.page-link')];
    const other = pages().find((p) => !p.hasAttribute('aria-current'));
    other.click();
    await wait(() => editor()?.textContent === 'FIRST PAGE');
    await control(dir, { failSaves: true, failProtection: true });
    editor().focus();
    editor().querySelector('p').firstChild.textContent += ' PENDING';
    await new Promise((ok) => setTimeout(ok, 80));
    // Navigate away: hidden-page edits must still participate in close protection.
    pages()
      .find((p) => !p.hasAttribute('aria-current'))
      .click();
    await wait(() => editor()?.textContent === 'SECOND PAGE');
    assert.equal((await dom.window.clutterWindow.prepareClose()).safe, false);
    assert.equal(editor().getAttribute('contenteditable'), 'true');
    await control(dir, { failSaves: false, failProtection: false });
    assert.equal((await dom.window.clutterWindow.prepareClose()).safe, true);
    const listed = await run(
      dir,
      [],
      JSON.stringify({ apiVersion: 1, method: 'page.list', spaceId: m.spaceId })
    );
    const list = JSON.parse(listed.out).value.pages;
    assert.equal(list.length, 2);
    const bodies = [];
    for (const page of list) {
      const read = await run(
        dir,
        [],
        JSON.stringify(command(m, { pageId: page.pageId }))
      );
      bodies.push(
        JSON.parse(read.out).value.body.value.content[0].content[0].text
      );
    }
    assert.deepEqual(
      bodies.sort(),
      ['FIRST PAGE PENDING', 'SECOND PAGE'].sort()
    );
    assert.deepEqual(errors, []);
    await new Promise((ok) => setTimeout(ok, 80));
  } finally {
    dom.window.close();
  }
  const after = await run(dir);
  assert.equal(after.code, 0, after.err);
  assert.equal(JSON.parse(after.out).instanceId, before);
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
