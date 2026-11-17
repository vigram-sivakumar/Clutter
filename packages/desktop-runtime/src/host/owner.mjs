// Node composition: one existing SpaceService, no document/task/save reducers here.
import { createServer } from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SpaceService } from '@clutter/core';
import { SqliteStore } from '@clutter/desktop-runtime/sqlite';
import { qualifiedEngine } from '@clutter/editor/backend';
import { MediaIngress } from '../media-ingress.mjs';
import { readSession } from './session.mjs';
import { WindowStateStore } from './view-state.mjs';
const [resources, directory] = process.argv.slice(2);
if (
  process.version !== 'v24.22.1' ||
  realpathSync(process.execPath) !==
    realpathSync(join(resources, 'runtime/node'))
)
  throw Error('BUNDLED_PINNED_RUNTIME_REQUIRED');
const m = readSession(directory, resources);
const origin = `http://127.0.0.1:${m.port}`,
  flags = { failSaves: false, failProtection: false, failViewState: false };
let core,
  vault,
  ingress,
  windowStates,
  ready = false,
  draining = false;
const pending = new Set();
const principal = (peerId) => ({
  spaceId: m.spaceId,
  peerId,
  scopes: ['read', 'write'],
});
async function execute(c, peerId) {
  return core.execute(c, principal(peerId));
}
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1048576) throw Error('FRAME_LIMIT');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function stop() {
  if (draining) return;
  draining = true;
  ready = false;
  await Promise.allSettled([...pending]);
  vault?.close();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
}
const server = createServer(
  { requestTimeout: 10000, headersTimeout: 10000 },
  async (req, res) => {
    const reply = (value, status = 200) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    try {
      if (
        req.headers.host !== `127.0.0.1:${m.port}` ||
        (req.headers.origin && req.headers.origin !== origin)
      )
        return reply({ error: 'FORBIDDEN_ORIGIN' }, 403);
      if (!ready) return reply({ error: 'OWNER_NOT_READY' }, 503);
      const url = new URL(req.url, origin);
      if (url.origin !== origin)
        return reply({ error: 'FORBIDDEN_ORIGIN' }, 403);
      if (
        req.method === 'GET' &&
        ['/', '/app.js', '/style.css'].includes(url.pathname) &&
        !url.search
      ) {
        const name =
          url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        res.writeHead(200, {
          'content-type': name.endsWith('.js')
            ? 'text/javascript'
            : name.endsWith('.css')
              ? 'text/css'
              : 'text/html',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy':
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
        });
        res.end(readFileSync(join(resources, 'web', name)));
        return;
      }
      const token = Object.entries(m.tokens).find(
        ([, t]) => req.headers.authorization === 'Bearer ' + t
      )?.[0];
      if (!token) return reply({ error: 'FORBIDDEN' }, 403);
      if (req.method === 'GET' && url.pathname === '/status')
        return reply({
          spaceId: m.spaceId,
          bundleId: m.bundleId,
          instanceId,
          ready: true,
          runtimeBundled: true,
        });
      if (
        req.method !== 'POST' ||
        req.headers['content-type'] !== 'application/json' ||
        Number(req.headers['content-length'] ?? 0) > 1048576
      )
        return reply({ error: 'INVALID_FRAME' }, 400);
      if (url.pathname === '/control' && token === 'admin') {
        const c = await body(req);
        if (c.action === 'stop') {
          reply({ ok: true });
          void stop();
          return;
        }
        if (
          c.action === 'flags' &&
          c.flags &&
          Object.entries(c.flags).every(
            ([k, v]) => Object.hasOwn(flags, k) && typeof v === 'boolean'
          )
        ) {
          Object.assign(flags, c.flags);
          return reply({ ok: true });
        }
        return reply({ error: 'INVALID_CONTROL' }, 400);
      }
      if (token === 'admin') return reply({ error: 'FORBIDDEN' }, 403);
      const request = (async () => {
        const c = await body(req);
        if (draining) throw Error('OWNER_STOPPING');
        if (url.pathname === '/api')
          return execute(c, token === 'ui' ? 'ui' : 'automation');
        if (url.pathname === '/view-state' && token === 'ui')
          return { ok: true, value: windowStates.execute(c) };
        if (url.pathname === '/media' && token === 'ui')
          return ingress.submit(c);
        throw Error('NOT_FOUND');
      })();
      pending.add(request);
      try {
        return reply(await request);
      } finally {
        pending.delete(request);
      }
    } catch (e) {
      reply({ error: e.message }, 400);
    }
  }
);
const instanceId = randomUUID();
// Bind BEFORE opening SQLite. Parallel launchers can spawn, but only the kernel
// listener winner may create an owner. Never unlink a lock or elect by PID/time.
server.once('error', (e) => {
  process.stderr.write(
    e.code === 'EADDRINUSE' ? 'OWNER_PORT_BUSY\n' : 'OWNER_BIND_FAILED\n'
  );
  process.exitCode = 2;
});
server.listen(
  { host: '127.0.0.1', port: m.port, exclusive: true },
  async () => {
    try {
      vault = SqliteStore.reopenDisposable(m.vaultDir, {
        beforeCommit: (c) => {
          if (flags.failSaves && c.method === 'editor.apply')
            throw Error('INJECTED_SAVE_FAILURE');
          if (flags.failProtection && c.method === 'editor.protect')
            throw Error('INJECTED_PROTECTION_FAILURE');
        },
      });
      if (vault.spaceId !== m.spaceId) throw Error('WRONG_SPACE');
      core = new SpaceService(vault, qualifiedEngine, {
        newGrant: () => randomUUID(),
      });
      ingress = new MediaIngress({
        directory: join(directory, 'pending'),
        spaceId: m.spaceId,
        peerId: 'ui',
        execute: (c) => execute(c, 'ui'),
      });
      windowStates = new WindowStateStore(directory, () => {
        if (flags.failViewState) throw Error('WINDOW_STATE_WRITE_FAILED');
      });
      await ingress.replay();
      ready = true;
    } catch {
      vault?.close();
      server.close();
      process.exitCode = 2;
      process.stderr.write('OWNER_START_FAILED\n');
    }
  }
);
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
