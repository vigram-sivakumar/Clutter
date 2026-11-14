// Real durable owner process. HTTP is an isolated loopback test transport.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, statfsSync } from 'node:fs';
import { release as osRelease } from 'node:os';
import { Store } from './store.mjs';
export async function startHost({
  model,
  nativeFullSync = false,
  requireSupervisor = false,
  htmlPath = new URL('./desktop.html', import.meta.url),
  assets = null,
  editorContexts = [],
} = {}) {
  const dir = process.argv[process.argv.indexOf('--store') + 1];
  let store;
  try {
    if (!process.argv.includes('--store') || !dir)
      throw Error('STORE_REQUIRED');
    store = new Store(dir, {
      init: process.argv.includes('--init'),
      nativeFullSync,
      ...(model ? { model } : {}),
    });
  } catch (e) {
    process.send?.({ type: 'startup_error', error: e.message });
    process.stderr.write(e.message + '\n');
    process.exit(1);
  }
  let fault = null,
    release = null,
    dropReply = false,
    dropHints = false,
    queue = Promise.resolve();
  const subscribers = new Set(),
    token = randomBytes(32).toString('hex'),
    editorGrants = Object.fromEntries(
      editorContexts.map((id) => [id, randomBytes(32).toString('hex')])
    );
  store.phase = async (name, c) => {
    if (
      fault?.phase === name &&
      (!fault.operationId || fault.operationId === c.operationId)
    ) {
      fault = null;
      process.send?.({
        type: 'phase',
        phase: name,
        operationId: c.operationId,
      });
      await new Promise((r) => (release = r));
    }
  };
  process.on('message', (m) => {
    if (m.type === 'release') {
      release?.();
      release = null;
      return;
    }
    // Parent-only test control, never an RPC capability. Queue control behind requests.
    queue = queue
      .then(() => {
        if (m.type === 'fault') fault = m;
        if (m.type === 'inspect') {
          process.send?.({
            type: 'inspection',
            id: m.id,
            spaceId: store.meta.space_id,
            documentId: store.meta.document_id,
            version: store.getMeta().current_version,
            roots: store.db
              .prepare(
                'SELECT version,parent,hash,operation_id FROM revisions ORDER BY version'
              )
              .all(),
            outcomes: store.db
              .prepare(
                'SELECT operation_id,version,result FROM outcomes ORDER BY rowid'
              )
              .all()
              .map((o) => ({ ...o, result: JSON.parse(o.result) })),
            recovery: store.db
              .prepare(
                'SELECT context_id,generation,base_version,active FROM recovery'
              )
              .all(),
          });
          return;
        }
        if (m.type === 'fail_writes') store.failWrites = m.value;
        if (m.type === 'fail_protection') store.failProtection = m.value;
        if (m.type === 'drop_reply') dropReply = true;
        if (m.type === 'drop_hints') dropHints = m.value;
        if (m.type === 'checkpoint')
          store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        if (m.type === 'lose_commit_return') store.loseCommitReturn = true;
        if (m.type === 'page_limit') {
          const n =
            m.value === 'current'
              ? store.db.prepare('PRAGMA page_count').get().page_count
              : Number(m.value);
          if (!Number.isSafeInteger(n) || n < 1) throw Error('INVALID_LIMIT');
          store.db.exec('PRAGMA max_page_count=' + n);
        }
        process.send?.({ type: 'control_ack', id: m.id });
      })
      .catch((e) =>
        process.send?.({ type: 'control_error', id: m.id, error: e.message })
      );
  });
  const html = readFileSync(htmlPath);
  const staticAssets = assets ?? {
    '/desktop.mjs': {
      bytes: readFileSync(new URL('./desktop.mjs', import.meta.url)),
      type: 'text/javascript',
    },
  };
  const server = createServer(async (req, res) => {
    const host = '127.0.0.1:' + server.address().port;
    if (
      req.headers.host !== host ||
      (req.headers.origin && req.headers.origin !== 'http://' + host)
    ) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (
      req.method === 'GET' &&
      (req.url === '/' || Object.hasOwn(staticAssets, req.url))
    ) {
      const asset =
        req.url === '/'
          ? { bytes: html, type: 'text/html' }
          : staticAssets[req.url];
      res.setHeader('Content-Type', asset.type);
      res.end(asset.bytes);
      return;
    }
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    const contextId = Object.keys(editorGrants).find(
      (id) => editorGrants[id] === bearer
    );
    if (bearer !== token && !contextId) {
      res.writeHead(403).end();
      return;
    }
    const grant = { contextId: contextId ?? null };
    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': ready\n\n');
      subscribers.add(res);
      req.on('close', () => subscribers.delete(res));
      return;
    }
    if (
      req.method !== 'POST' ||
      req.url !== '/rpc' ||
      !req.headers['content-type']?.startsWith('application/json')
    ) {
      res.writeHead(404).end();
      return;
    }
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 1048576) throw Error('FRAME_LIMIT');
      }
      const command = JSON.parse(raw);
      queue = queue.then(async () => {
        try {
          const result = await store.execute(command, grant);
          if (result?.status && result.status !== 'uncertain' && !dropHints)
            for (const s of subscribers)
              s.write('data: ' + JSON.stringify({ hint: true }) + '\n\n');
          await store.phase('before_reply', command);
          if (dropReply) {
            dropReply = false;
            res.destroy();
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, result }));
        } catch (e) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      await queue;
    } catch (e) {
      res.writeHead(400).end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
  server.listen(
    process.argv.includes('--port')
      ? Number(process.argv[process.argv.indexOf('--port') + 1])
      : 0,
    '127.0.0.1',
    () => {
      const port = server.address().port;
      process.send?.({
        type: 'ready',
        url: 'http://127.0.0.1:' + port + '/rpc',
        token,
        spaceId: store.meta.space_id,
        documentId: store.meta.document_id,
        ownerEpoch: store.epoch,
        profile: {
          ...store.profile,
          osRelease: osRelease(),
          filesystemType: Number(statfsSync(dir).type),
        },
        editorGrants,
      });
    }
  );
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    for (const s of subscribers) s.end();
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  if (requireSupervisor) process.on('disconnect', shutdown);
}
