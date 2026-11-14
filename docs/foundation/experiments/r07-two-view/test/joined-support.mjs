import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
export const deadline = (p, ms = 15000) => {
  let t;
  return Promise.race([
    p,
    new Promise((_, j) => (t = setTimeout(() => j(Error('TIMEOUT')), ms))),
  ]).finally(() => clearTimeout(t));
};
export const processes = new Set();
export async function owner(
  dir = mkdtempSync(tmpdir() + '/clutter-joined-'),
  init = true,
  expectedError = false,
  port = 0
) {
  const child = spawn(
    process.execPath,
    [
      'joined/owner.mjs',
      '--store',
      dir,
      '--port',
      String(port),
      ...(init ? ['--init'] : []),
    ],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
  );
  processes.add(child);
  child.stdout.resume();
  let stderr = '';
  child.stderr.on('data', (b) => (stderr += b));
  const msgs = [],
    waiters = [];
  let exited = false;
  child.on('exit', () => {
    exited = true;
    processes.delete(child);
    for (const w of waiters.splice(0)) w.j(Error('OWNER_EXIT ' + stderr));
  });
  child.on('message', (m) => {
    msgs.push(m);
    for (const w of [...waiters])
      if (w.p(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.r(m);
      }
  });
  const next = (p) => {
    const m = msgs.find(p);
    return m
      ? Promise.resolve(m)
      : deadline(new Promise((r, j) => waiters.push({ p, r, j })));
  };
  const ready = await next((m) => ['ready', 'startup_error'].includes(m.type));
  if (ready.type === 'startup_error') {
    if (!exited) await deadline(once(child, 'exit'));
    if (expectedError) return ready;
    throw Error(ready.error);
  }
  const o = {
    ...ready,
    dir,
    child,
    next,
    controls: [],
    base: { spaceId: ready.spaceId, documentId: ready.documentId },
    descriptor() {
      return {
        url: this.url,
        token: this.token,
        editorGrants: this.editorGrants,
        ...this.base,
      };
    },
    async control(type, extra = {}) {
      const id = randomUUID();
      o.controls.push({ type, ...extra });
      child.send({ type, id, ...extra });
      const r = await next((m) => m.id === id);
      if (r.type === 'control_error') throw Error(r.error);
      return r;
    },
    async stop() {
      const p = once(child, 'exit');
      child.kill('SIGKILL');
      await deadline(p);
    },
    async rpc(c, id) {
      try {
        const r = await fetch(ready.url, {
          method: 'POST',
          headers: {
            authorization:
              'Bearer ' + (id ? ready.editorGrants[id] : ready.token),
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ...o.base, ...c }),
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) return { ok: false, error: 'HTTP_' + r.status };
        return await r.json();
      } catch {
        return { ok: false, error: 'TRANSPORT_OUTCOME_UNKNOWN' };
      }
    },
  };
  return o;
}
export function insert(version = 0, text = 'CLI ', operationId = randomUUID()) {
  return {
    method: 'insert',
    operationId,
    expectedVersion: version,
    target: 'Alpha',
    offset: 0,
    text,
  };
}
export async function cli(o, c) {
  const child = spawn(process.execPath, ['durable/cli.mjs'], {
    env: {
      ...process.env,
      CLUTTER_LAB_RELAY_URL: o.url,
      CLUTTER_LAB_RELAY_TOKEN: o.token,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stderr.resume();
  child.stdout.on('data', (b) => (out += b));
  child.stdin.end(JSON.stringify({ ...o.base, ...c }));
  await deadline(once(child, 'exit'));
  return JSON.parse(out);
}
export async function mcp(o) {
  const p = spawn(process.execPath, ['joined/mcp.mjs'], {
    env: {
      ...process.env,
      CLUTTER_LAB_RELAY_URL: o.url,
      CLUTTER_LAB_RELAY_TOKEN: o.token,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  processes.add(p);
  p.stderr.resume();
  let id = 0;
  const pending = new Map();
  createInterface({ input: p.stdout }).on('line', (s) => {
    const r = JSON.parse(s);
    pending.get(r.id)?.(r);
    pending.delete(r.id);
  });
  const send = async (method, params) => {
    const key = ++id,
      promise = deadline(new Promise((r) => pending.set(key, r)));
    p.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n'
    );
    return promise;
  };
  await send('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'joined-test', version: '1' },
  });
  p.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      '\n'
  );
  return {
    async call(c) {
      const r = await send('tools/call', {
        name: 'lab_command',
        arguments: { ...o.base, ...c },
      });
      if (r.error) throw Error(JSON.stringify(r.error));
      return {
        ok: !r.result.isError,
        result: JSON.parse(r.result.content[0].text),
      };
    },
    async close() {
      const ex = once(p, 'exit');
      p.stdin.end();
      await deadline(ex);
      processes.delete(p);
    },
  };
}
export async function openPage(browser, o) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    o.url.replace('/rpc', '/') +
      '#' +
      encodeURIComponent(JSON.stringify(o.descriptor()))
  );
  await page.waitForFunction(() => !!window.joined);
  page.proofErrors = errors;
  return page;
}
export async function edit(page, id, text, target = 'Alpha', offset = 0) {
  await page.evaluate(
    ({ id, text, target, offset }) => {
      window.originLab.select(id, target, offset);
      window.originLab
        .view(id)
        .dispatch(window.originLab.view(id).state.tr.insertText(text));
    },
    { id, text, target, offset }
  );
}
export async function settle(page) {
  return page.evaluate(() => window.joined.settle());
}
export async function snapshot(page) {
  await settle(page);
  return page.evaluate(() => window.originLab.snapshot());
}
export async function ownHistory(page, id, direction) {
  return page.evaluate(
    ({ id, direction }) => {
      window.originLab.view(id).focus();
      window.originLab.boundary(id);
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: direction === 'redo',
        bubbles: true,
      });
      window.originLab.view(id).dom.dispatchEvent(event);
    },
    { id, direction }
  );
}
