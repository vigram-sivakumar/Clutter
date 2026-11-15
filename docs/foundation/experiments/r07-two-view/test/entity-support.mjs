import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { remoteCommand } from '../src/live-client.mjs';
export const deadline = async (p, ms = 12000) => {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise(
        (_, reject) =>
          (timer = setTimeout(() => reject(Error('TEST_TIMEOUT')), ms))
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
export async function owner(
  dir,
  { init = false, entry = 'entities/owner.mjs', expectedError = false } = {}
) {
  const child = spawn(
    process.execPath,
    [entry, '--store', dir, ...(init ? ['--init'] : [])],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
  );
  child.stdout.resume();
  let stderr = '';
  child.stderr.on('data', (b) => (stderr += b));
  const messages = [],
    waiters = [];
  child.on('message', (m) => {
    const index = waiters.findIndex((w) => w.matches(m));
    if (index < 0) messages.push(m);
    else waiters.splice(index, 1)[0].resolve(m);
  });
  child.on('exit', () => {
    for (const w of waiters.splice(0)) w.reject(Error('OWNER_EXIT ' + stderr));
  });
  const next = async (matches) => {
    const index = messages.findIndex(matches);
    if (index >= 0) return messages.splice(index, 1)[0];
    return deadline(
      new Promise((resolve, reject) =>
        waiters.push({ matches, resolve, reject })
      )
    );
  };
  try {
    const ready = await next(
      (m) => m.type === 'ready' || m.type === 'startup_error'
    );
    if (ready.type === 'startup_error') {
      if (expectedError) return { error: ready.error };
      throw Error(ready.error);
    }
    if (expectedError) throw Error('EXPECTED_STARTUP_REFUSAL');
    const o = {
      child,
      dir,
      profile: ready.profile,
      base: { spaceId: ready.spaceId, documentId: ready.documentId },
      next,
      env: {
        ...process.env,
        CLUTTER_LAB_RELAY_URL: ready.url,
        CLUTTER_LAB_RELAY_TOKEN: ready.token,
      },
      async rpc(c) {
        try {
          return {
            ok: true,
            result: await remoteCommand(
              { ...o.base, ...c },
              { url: ready.url, token: ready.token }
            ),
          };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
      async read() {
        const r = await o.rpc({ method: 'read' });
        if (!r.ok) throw Error(r.error);
        return r.result;
      },
      async control(type, extra = {}) {
        const id = randomUUID();
        child.send({ type, id, ...extra });
        const r = await next((m) => m.id === id);
        if (r.type === 'control_error') throw Error(r.error);
      },
      async stop() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const done = once(child, 'exit');
        child.kill('SIGKILL');
        await deadline(done);
      },
    };
    return o;
  } catch (e) {
    child.kill('SIGKILL');
    throw e;
  }
}
export async function cli(o, c) {
  const p = spawn(process.execPath, ['durable/cli.mjs'], {
    env: o.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  p.stdout.on('data', (b) => (out += b));
  p.stderr.resume();
  p.stdin.end(JSON.stringify({ ...o.base, ...c }));
  await deadline(once(p, 'exit'));
  return JSON.parse(out);
}
export async function mcp(o) {
  const child = spawn(process.execPath, ['entities/mcp.mjs'], {
    env: o.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.resume();
  const pending = new Map();
  let counter = 0;
  createInterface({ input: child.stdout }).on('line', (line) => {
    const r = JSON.parse(line);
    pending.get(r.id)?.(r);
    pending.delete(r.id);
  });
  const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');
  const request = async (method, params) => {
    const id = ++counter;
    const result = new Promise((resolve) => pending.set(id, resolve));
    send({ jsonrpc: '2.0', id, method, params });
    return deadline(result);
  };
  await request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'entity-proof', version: '1' },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return {
    child,
    request,
    async command(c) {
      const r = await request('tools/call', {
        name: 'lab_command',
        arguments: { ...o.base, ...c },
      });
      if (r.error) throw Error(JSON.stringify(r.error));
      const value = JSON.parse(r.result.content[0].text);
      return r.result.isError
        ? { ok: false, error: value.error }
        : { ok: true, result: value };
    },
    async stop() {
      child.stdin.end();
      await deadline(once(child, 'exit'));
    },
  };
}
