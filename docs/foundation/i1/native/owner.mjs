import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SqliteVault } from '../../../../packages/foundation-runtime/src/adapters/sqlite-vault.ts';
import { SpaceService } from '../../../../packages/foundation-runtime/src/core.ts';
import { MediaIngress } from '../../../../packages/foundation-runtime/src/adapters/media-ingress.mjs';
import { qualifiedEngine } from '../qualified-engine.mjs';
import { session, atomicPrivate } from './session.mjs';
const [resources, directory] = process.argv.slice(2),
  m = session(directory, resources),
  flags = {
    failSaves: false,
    failProtection: false,
    failMedia: false,
    failJournal: false,
  };
const vault = SqliteVault.reopenDisposable(m.vaultDir, {
  beforeCommit: (c) => {
    if (flags.failSaves && c.method === 'editor.apply')
      throw Error('INJECTED_SAVE_FAILURE');
    if (flags.failProtection && c.method === 'editor.protect')
      throw Error('INJECTED_PROTECTION_FAILURE');
    if (flags.failMedia && c.method.startsWith('media.'))
      throw Error('INJECTED_MEDIA_FAILURE');
  },
});
if (vault.spaceId !== m.spaceId) throw Error('WRONG_SPACE');
const core = new SpaceService(vault, qualifiedEngine, {
    newGrant: () => randomUUID(),
  }),
  tokens = { ui: randomUUID(), cli: randomUUID(), admin: randomUUID() };
const principal = (peer) => ({
    spaceId: m.spaceId,
    peerId: peer,
    scopes: ['read', 'write'],
  }),
  execute = (c, peer = 'ui') => core.execute(c, principal(peer));
const ingress = new MediaIngress({
  directory: join(directory, 'pending'),
  spaceId: m.spaceId,
  peerId: 'ui',
  execute: (c) => execute(c),
  phase: (name) => {
    if (flags.failJournal && name === 'before_journal')
      throw Error('INJECTED_JOURNAL_FAILURE');
  },
});
const existing = await execute({
  apiVersion: 1,
  spaceId: m.spaceId,
  pageId: 'page',
  method: 'page.read',
});
if (!existing.ok) {
  if (existing.error.code !== 'NOT_FOUND') throw Error(existing.error.code);
  const c = await execute({
    apiVersion: 1,
    spaceId: m.spaceId,
    pageId: 'page',
    method: 'page.create',
    operationId: 'native28-seed',
    kind: 'note',
    title: 'Native Core28',
    body: {
      format: 'clutter.i1.pm-json',
      schemaVersion: 1,
      value: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { blockId: 'alpha' },
            content: [{ type: 'text', text: 'Alpha beta' }],
          },
        ],
      },
    },
    properties: {},
  });
  if (!c.ok) throw Error(c.error.code);
}
await ingress.replay();
let origin;
async function body(req) {
  const chunks = [];
  let n = 0;
  for await (const chunk of req) {
    n += chunk.length;
    if (n > 1048576) throw Error('FRAME_LIMIT');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const pending = () =>
  ingress.list().map((c) => ({
    operationId: c.operationId,
    method: c.method,
    pageId: c.pageId,
    attachmentId: c.attachmentId,
  }));
const server = createServer(async (req, res) => {
  const reply = (value, status = 200) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(JSON.stringify(value));
  };
  try {
    const url = new URL(req.url, origin),
      key = Object.entries(tokens).find(
        ([, v]) => req.headers.authorization === 'Bearer ' + v
      )?.[0];
    if (req.headers.origin && req.headers.origin !== origin)
      return reply({ error: 'WRONG_ORIGIN' }, 403);
    if (
      req.method === 'GET' &&
      ['/', '/app.js', '/style.css'].includes(url.pathname)
    ) {
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      res.writeHead(200, {
        'content-type': name.endsWith('.js')
          ? 'text/javascript'
          : name.endsWith('.css')
            ? 'text/css'
            : 'text/html',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
        'x-content-type-options': 'nosniff',
      });
      res.end(readFileSync(join(resources, 'web', name)));
      return;
    }
    if (!key) return reply({ error: 'FORBIDDEN' }, 403);
    if (req.method === 'POST' && url.pathname === '/api')
      return reply(
        await execute(await body(req), key === 'ui' ? 'ui' : 'automation')
      );
    if (req.method === 'POST' && url.pathname === '/media' && key === 'ui')
      return reply(await ingress.submit(await body(req)));
    if (req.method === 'POST' && url.pathname === '/retry' && key === 'ui')
      return reply({ results: await ingress.replay(), pending: pending() });
    if (req.method === 'GET' && url.pathname === '/status')
      return reply({
        spaceId: m.spaceId,
        bundleId: m.bundleId,
        profile: vault.profile(),
        flags,
        pending: pending(),
      });
    if (
      req.method === 'POST' &&
      url.pathname === '/control' &&
      key === 'admin'
    ) {
      const c = await body(req);
      if (c.action === 'stop') {
        reply({ ok: true });
        server.close(() => {
          vault.close();
          process.exit(0);
        });
        return;
      }
      if (
        c.action === 'flags' &&
        c.flags &&
        Object.keys(c.flags).every(
          (k) => Object.hasOwn(flags, k) && typeof c.flags[k] === 'boolean'
        )
      ) {
        Object.assign(flags, c.flags);
        return reply({ ok: true, flags });
      }
      return reply({ error: 'INVALID_CONTROL' }, 400);
    }
    return reply({ error: 'NOT_FOUND' }, 404);
  } catch (e) {
    return reply({ error: e.message }, 400);
  }
});
server.listen(0, '127.0.0.1', () => {
  origin = 'http://127.0.0.1:' + server.address().port;
  atomicPrivate(join(directory, 'endpoint.json'), {
    format: 'clutter-native-endpoint28',
    url: origin,
    spaceId: m.spaceId,
    bundleId: m.bundleId,
    pid: process.pid,
    tokens,
  });
  process.send?.({ ready: true });
});
