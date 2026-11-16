import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { JSDOM, VirtualConsole } from 'jsdom';
import { MediaIngress } from '../src/adapters/media-ingress.mjs';
import { CoreClient } from '../src/client.ts';
import { fromBase64, toBase64 } from '../src/contracts.ts';
import {
  pageRootPrefix,
  pageRootPayload,
  sha256,
} from '../src/root-envelope.ts';
import { pack, manifest } from '../../../docs/foundation/i1/native/pack.mjs';
import {
  createSession,
  json,
  bundle,
  session,
} from '../../../docs/foundation/i1/native/session.mjs';
const base = mkdtempSync(join(tmpdir(), 'core28-test-')),
  resources = join(base, 'Resources'),
  owned = [];
let buildMeta;
before(async () => {
  buildMeta = await pack(resources, process.execPath);
  manifest(resources, { test: true });
});
after(async () => {
  for (const dir of owned) {
    try {
      const d = json(join(dir, 'endpoint.json'));
      await fetch(d.url + '/control', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + d.tokens.admin,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'stop' }),
        signal: AbortSignal.timeout(2000),
      });
    } catch {}
    try {
      const m = json(join(dir, 'session.json'));
      rmSync(m.vaultDir, { recursive: true, force: true });
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(base, { recursive: true, force: true });
});
async function cli(dir, args = ['--ensure'], input = '') {
  const child = spawn(
    process.execPath,
    [join(resources, 'launcher.mjs'), '--session', dir, ...args],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let out = '',
    err = '';
  child.stdout.on('data', (b) => (out += b));
  child.stderr.on('data', (b) => (err += b));
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
  timer.unref();
  child.stdin.end(input);
  const [code, signal] = await once(child, 'exit');
  clearTimeout(timer);
  return { code, signal, out, err };
}
async function fresh() {
  const dir = createSession(resources);
  owned.push(dir);
  const r = await cli(dir);
  assert.equal(r.code, 0, r.err);
  return {
    dir,
    m: json(join(dir, 'session.json')),
    d: json(join(dir, 'endpoint.json')),
  };
}
async function rpc(x, path, value, role = 'ui') {
  const r = await fetch(x.d.url + path, {
    method: value === undefined ? 'GET' : 'POST',
    headers: {
      authorization: 'Bearer ' + x.d.tokens[role],
      ...(value === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: r.status, value: await r.json() };
}
const image = (x) => ({
  apiVersion: 1,
  spaceId: x.m.spaceId,
  pageId: 'page',
  method: 'media.import',
  operationId: 'image-1',
  expectedHead: x.head,
  attachmentId: 'image',
  name: 'Synthetic.png',
  role: 'body',
  mime: 'image/png',
  payload: readFileSync(join(resources, 'sample.png')).toString('base64'),
});
async function head(x) {
  const r = await rpc(x, '/api', {
    apiVersion: 1,
    spaceId: x.m.spaceId,
    pageId: 'page',
    method: 'page.read',
  });
  assert.equal(r.value.ok, true, JSON.stringify(r.value));
  x.head = r.value.value.head;
  return r.value.value;
}

test('browser pack contains no Node/SQL/filesystem or old semantic model', () => {
  assert.ok(buildMeta.browserBytes > 1000);
  assert.equal(
    buildMeta.browserInputs.some((n) =>
      /sqlite|media-files|media-formats|qualified-engine|entities\/model|durable\/model/.test(
        n
      )
    ),
    false
  );
  assert.equal(bundle(resources), bundle(resources));
});
test('root envelope bytes match the qualified prefix and reject wrong identity', async () => {
  const prefix = pageRootPrefix('p', 'notes'),
    data = new Uint8Array([...prefix, 0, 0]);
  assert.deepEqual([...pageRootPayload(data, 'p', 'notes')], [0, 0]);
  assert.throws(
    () => pageRootPayload(data, 'q', 'notes'),
    /UNSUPPORTED_PAGE_CODEC/
  );
  assert.equal((await sha256(data)).length, 64);
});
test('packed app-closed CLI/MCP reuse one Core and the same Space under concurrent bootstrap', async () => {
  const dir = createSession(resources);
  owned.push(dir);
  const results = await Promise.all([cli(dir), cli(dir)]);
  for (const r of results) assert.equal(r.code, 0, r.err);
  const d = json(join(dir, 'endpoint.json')),
    m = json(join(dir, 'session.json'));
  const query = {
      apiVersion: 1,
      spaceId: m.spaceId,
      pageId: 'page',
      method: 'page.read',
    },
    r = await cli(dir, [], JSON.stringify(query));
  assert.equal(JSON.parse(r.out).value.title, 'Native Core28');
  assert.equal(json(join(dir, 'endpoint.json')).pid, d.pid);
  const messages = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        clientInfo: { name: 'test', version: '1' },
        capabilities: {},
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'clutter_command', arguments: query },
    },
  ];
  const mcp = await cli(
    dir,
    ['--mcp'],
    messages.map(JSON.stringify).join('\n') + '\n'
  );
  assert.equal(mcp.code, 0, mcp.err);
  const replies = mcp.out.trim().split('\n').map(JSON.parse);
  assert.equal(
    JSON.parse(replies.at(-1).result.content[0].text).value.pageId,
    'page'
  );
});
test('unauthenticated and cross-origin requests cannot execute commands or controls', async () => {
  const x = await fresh();
  const r = await fetch(x.d.url + '/api', { method: 'POST', body: '{}' });
  assert.equal(r.status, 403);
  const foreign = await fetch(x.d.url + '/status', {
    headers: {
      authorization: 'Bearer ' + x.d.tokens.ui,
      origin: 'https://other.test',
    },
  });
  assert.equal(foreign.status, 403);
  const control = await rpc(x, '/control', {
    action: 'flags',
    flags: { failMedia: true },
  });
  assert.equal(control.status, 404);
});
test('media journal protects exact commands through failed writes and owner death', async () => {
  const x = await fresh();
  await head(x);
  await rpc(
    x,
    '/control',
    { action: 'flags', flags: { failMedia: true } },
    'admin'
  );
  const c = image(x),
    queued = await rpc(x, '/media', c);
  assert.equal(queued.value.durable, true);
  assert.equal(queued.value.result.ok, false);
  assert.equal((await rpc(x, '/status')).value.pending.length, 1);
  process.kill(x.d.pid, 'SIGKILL');
  const restarted = await cli(x.dir);
  assert.equal(restarted.code, 0, restarted.err);
  x.d = json(join(x.dir, 'endpoint.json'));
  assert.equal(x.d.spaceId, x.m.spaceId);
  const read = await rpc(x, '/api', {
    apiVersion: 1,
    spaceId: x.m.spaceId,
    pageId: 'page',
    attachmentId: 'image',
    method: 'media.read',
  });
  assert.equal(read.value.ok, true, JSON.stringify(read.value));
  assert.equal((await rpc(x, '/status')).value.pending.length, 0);
});
test('journal failure leaves no protection acknowledgement, then exact retry is durable', async () => {
  const x = await fresh();
  await head(x);
  const c = image(x);
  await rpc(
    x,
    '/control',
    { action: 'flags', flags: { failJournal: true, failMedia: true } },
    'admin'
  );
  const fail = await rpc(x, '/media', c);
  assert.equal(fail.status, 400);
  assert.equal((await rpc(x, '/status')).value.pending.length, 0);
  await rpc(
    x,
    '/control',
    { action: 'flags', flags: { failJournal: false } },
    'admin'
  );
  assert.equal((await rpc(x, '/media', c)).value.durable, true);
  assert.equal((await rpc(x, '/status')).value.pending.length, 1);
  await rpc(
    x,
    '/control',
    { action: 'flags', flags: { failMedia: false } },
    'admin'
  );
  await rpc(x, '/retry', {});
  assert.equal((await rpc(x, '/status')).value.pending.length, 0);
});
test('immutable ingress refuses operation reuse, corruption and non-media commands', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal28-'));
  try {
    const c = {
      apiVersion: 1,
      spaceId: 's',
      pageId: 'p',
      method: 'media.import',
      operationId: 'op',
      expectedHead: '0'.repeat(64),
      attachmentId: 'a',
      name: 'a.png',
      role: 'body',
      mime: 'image/png',
      payload: 'AAA=',
    };
    const j = new MediaIngress({
      directory: dir,
      spaceId: 's',
      peerId: 'ui',
      execute: async () => ({ ok: false, error: { code: 'CONFLICT' } }),
    });
    assert.equal((await j.submit(c)).durable, true);
    assert.throws(() => j.put({ ...c, name: 'b.png' }), /OPERATION_ID_REUSED/);
    assert.throws(
      () =>
        j.put({
          apiVersion: 1,
          spaceId: 's',
          pageId: 'p',
          method: 'page.read',
        }),
      /INVALID_MEDIA_INGRESS/
    );
    writeFileSync(join(dir, 'op.json'), '{}');
    assert.throws(() => j.list());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('same-session metadata and bundle integrity refuse substitution', async () => {
  const x = await fresh();
  assert.equal(session(x.dir, resources).spaceId, x.m.spaceId);
  const fake = mkdtempSync(join(tmpdir(), 'not-native28-'));
  try {
    assert.throws(() => session(fake, resources), /WRONG_NATIVE_SESSION/);
  } finally {
    rmSync(fake, { recursive: true, force: true });
  }
  const file = join(resources, 'web/style.css'),
    bytes = readFileSync(file);
  try {
    writeFileSync(file, 'tampered');
    assert.throws(() => bundle(resources), /BUNDLE_INTEGRITY/);
  } finally {
    writeFileSync(file, bytes);
  }
});

async function boot(x) {
  const errors = [],
    messages = [],
    virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  const dom = await JSDOM.fromURL(x.d.url + '/', {
    resources: 'usable',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(w) {
      Object.defineProperty(w, '__clutterCore28Bootstrap', {
        value: {
          url: x.d.url,
          token: x.d.tokens.ui,
          spaceId: x.m.spaceId,
          png: readFileSync(join(resources, 'sample.png')).toString('base64'),
          pngAlt: readFileSync(join(resources, 'sample-alt.png')).toString(
            'base64'
          ),
          pdf: readFileSync(join(resources, 'sample.pdf')).toString('base64'),
        },
      });
      Object.defineProperty(w, 'crypto', { value: globalThis.crypto });
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      w.structuredClone = structuredClone;
      w.AbortSignal = AbortSignal;
      w.Blob = Blob;
      w.URL.createObjectURL = URL.createObjectURL.bind(URL);
      w.URL.revokeObjectURL = URL.revokeObjectURL.bind(URL);
      w.fetch = async (path, options) => {
        const r = await fetch(new URL(path, x.d.url), options);
        return {
          ok: r.ok,
          status: r.status,
          json: async () => w.JSON.parse(await r.text()),
        };
      };
      w.webkit = {
        messageHandlers: {
          core28: { postMessage: (value) => messages.push(value) },
        },
      };
    },
  });
  for (let i = 0; i < 250; i++) {
    if (dom.window.lab28?.ready()) return { dom, errors, messages };
    const error = messages.find((m) => m.action === 'error');
    if (error) {
      dom.window.close();
      throw Error(error.message);
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  dom.window.close();
  throw Error('BROWSER_READY_TIMEOUT ' + errors.join(';'));
}
test('actual browser bundle boots without Buffer; editor close refuses or protects as configured', async () => {
  const x = await fresh(),
    b = await boot(x);
  try {
    assert.equal(b.dom.window.Buffer, undefined);
    await rpc(
      x,
      '/control',
      { action: 'flags', flags: { failSaves: true, failProtection: true } },
      'admin'
    );
    const p = b.dom.window.document.querySelector('#editor-A p');
    p.firstChild.nodeValue = 'PROTECTED ' + p.firstChild.nodeValue;
    for (let i = 0; i < 100 && !b.dom.window.lab28.capture().views.A.dirty; i++)
      await new Promise((r) => setTimeout(r, 20));
    assert.equal(b.dom.window.lab28.capture().views.A.dirty, true);
    assert.equal((await b.dom.window.lab28.prepareClose()).safe, false);
    await rpc(
      x,
      '/control',
      { action: 'flags', flags: { failProtection: false } },
      'admin'
    );
    assert.equal((await b.dom.window.lab28.prepareClose()).safe, true);
    const saved = await rpc(x, '/api', {
      apiVersion: 1,
      spaceId: x.m.spaceId,
      pageId: 'page',
      contextId: 'A',
      method: 'editor.recovery',
    });
    assert.equal(saved.value.ok, true);
    assert.deepEqual(b.errors, []);
  } finally {
    b.dom.window.close();
  }
});
test('close waits for media intent; failed journal refuses, durable failed media permits protected close', async () => {
  const x = await fresh(),
    b = await boot(x);
  try {
    await rpc(
      x,
      '/control',
      { action: 'flags', flags: { failMedia: true, failJournal: true } },
      'admin'
    );
    b.dom.window.document.querySelector('[data-add="image"]').click();
    const first = await b.dom.window.lab28.prepareClose();
    assert.equal(first.safe, false);
    assert.equal(first.capture.unprotectedMedia, 1);
    assert.equal((await rpc(x, '/status')).value.pending.length, 0);
    await rpc(
      x,
      '/control',
      { action: 'flags', flags: { failJournal: false } },
      'admin'
    );
    assert.equal((await b.dom.window.lab28.prepareClose()).safe, true);
    assert.equal((await rpc(x, '/status')).value.pending.length, 1);
    assert.deepEqual(b.errors, []);
  } finally {
    b.dom.window.close();
  }
});
test('media panels own and revoke URLs independently without changing Core content', async () => {
  const x = await fresh();
  await head(x);
  assert.equal((await rpc(x, '/media', image(x))).value.result.ok, true);
  const dom = new JSDOM('<div id="a"></div><div id="b"></div>'),
    prior = globalThis.document;
  globalThis.document = dom.window.document;
  const { MediaPanel } =
    await import('../../../docs/foundation/i1/native/media-panel.mjs');
  const live = new Set();
  let n = 0;
  const urls = {
    createObjectURL: () => {
      const key = 'blob:fixture-' + ++n;
      live.add(key);
      return key;
    },
    revokeObjectURL: (key) => live.delete(key),
  };
  const client = new CoreClient(async (c) => (await rpc(x, '/api', c)).value);
  const a = new MediaPanel({
      client,
      spaceId: x.m.spaceId,
      pageId: 'page',
      target: document.querySelector('#a'),
      showPDF: () => {},
      urls,
    }),
    b = new MediaPanel({
      client,
      spaceId: x.m.spaceId,
      pageId: 'page',
      target: document.querySelector('#b'),
      showPDF: () => {},
      urls,
    });
  try {
    await a.refresh();
    await b.refresh();
    assert.equal(live.size, 2);
    a.destroy();
    assert.equal(live.size, 1);
    await b.refresh();
    assert.equal(live.size, 1);
    b.destroy();
    assert.equal(live.size, 0);
    assert.equal((await head(x)).title, 'Native Core28');
  } finally {
    a.destroy();
    b.destroy();
    globalThis.document = prior;
    dom.window.close();
  }
});

test('client rejects tampered root and media bytes before exposing them to a renderer', async () => {
  const x = await fresh();
  const c = {
      apiVersion: 1,
      spaceId: x.m.spaceId,
      pageId: 'page',
      contextId: 'A',
      method: 'editor.open',
    },
    root = (await rpc(x, '/api', c)).value;
  assert.equal(root.ok, true);
  const bytes = fromBase64(root.value.payload);
  bytes[bytes.length - 1] ^= 1;
  const badRoot = new CoreClient(async () => ({
    ok: true,
    value: { ...root.value, payload: toBase64(bytes) },
  }));
  assert.equal((await badRoot.execute(c)).error.code, 'TRANSPORT_UNAVAILABLE');
  await head(x);
  await rpc(x, '/media', image(x));
  const q = {
      apiVersion: 1,
      spaceId: x.m.spaceId,
      pageId: 'page',
      method: 'media.read',
      attachmentId: 'image',
    },
    file = (await rpc(x, '/api', q)).value;
  assert.equal(file.ok, true);
  const media = fromBase64(file.value.payload);
  media[media.length - 1] ^= 1;
  const badMedia = new CoreClient(async () => ({
    ok: true,
    value: { ...file.value, payload: toBase64(media) },
  }));
  assert.equal((await badMedia.execute(q)).error.code, 'TRANSPORT_UNAVAILABLE');
  assert.ok(buildMeta.nodeInputs.some((n) => n.endsWith('/core.ts')));
  assert.equal(
    buildMeta.nodeInputs.some((n) =>
      /durable\/store|joined-native\/model/.test(n)
    ),
    false
  );
});

test('runner requires explicit same-session recovery and refuses a second live window', async () => {
  const { sessionChoice } =
    await import('../../../docs/foundation/i1/native/lifecycle.mjs');
  const existing = {
    session: 'existing-space',
    bundle: 'original-bundle',
    uiPid: 42,
  };
  assert.throws(() => sessionChoice({ existing }), /EXISTING_NATIVE28_SESSION/);
  assert.equal(sessionChoice({ existing, reopen: true }), existing);
  assert.throws(
    () => sessionChoice({ existing, reopen: true, isLive: () => true }),
    /WINDOW_STILL_OPEN/
  );
  assert.equal(sessionChoice({ existing, fresh: true }), undefined);
  assert.throws(() => sessionChoice({ reopen: true }), /NO_EXISTING/);
  assert.throws(
    () => sessionChoice({ existing, reopen: true, fresh: true }),
    /CHOOSE_REOPEN_OR_NEW/
  );
});
