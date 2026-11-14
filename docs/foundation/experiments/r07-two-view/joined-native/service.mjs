// Detached supervisor only: the child remains the sole SQLite/document owner.
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, openSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  checkSession,
  readPrivate,
  atomicPrivate,
  bundleIdentity,
  sessionFormat,
} from './private-session.mjs';
process.umask(0o077);
const resources = dirname(fileURLToPath(import.meta.url)),
  session = checkSession(process.argv[2]),
  bundleId = bundleIdentity(resources),
  endpoint = join(session.path, 'endpoint.json');
let previous;
try {
  previous = readPrivate(endpoint);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const args = [
  join(resources, 'owner.mjs'),
  '--store',
  join(session.path, 'store'),
];
if (!existsSync(join(session.path, 'store'))) args.push('--init');
if (previous?.url) {
  const u = new URL(previous.url);
  if (u.hostname !== '127.0.0.1' || u.protocol !== 'http:' || !u.port)
    throw Error('INVALID_OLD_ENDPOINT');
  args.push('--port', u.port);
}
const fd = openSync(join(session.path, 'owner.log'), 'a', 0o600),
  child = spawn(process.execPath, args, { stdio: ['ignore', fd, fd, 'ipc'] });
closeSync(fd);
let ready,
  server,
  ending = false,
  sequence = 0;
const waiting = new Map(),
  controlToken = randomBytes(32).toString('hex');
const end = () => {
  if (ending) return;
  ending = true;
  for (const w of waiting.values()) w.reject(Error('OWNER_EXIT'));
  server?.close(() => process.exit(0));
  if (!server) process.exit(1);
};
child.on('exit', end);
child.on('error', end);
child.on('message', (m) => {
  if (m.type === 'startup_error') end();
  if (m.type === 'ready') {
    ready = m;
    server = createServer((socket) => {
      let input = '';
      socket.setTimeout(10000, () => socket.destroy());
      socket.on('data', (b) => {
        input += b;
        if (Buffer.byteLength(input) > 8192) {
          socket.destroy();
          return;
        }
        const i = input.indexOf('\n');
        if (i < 0) return;
        socket.pause();
        (async () => {
          const envelope = JSON.parse(input.slice(0, i));
          if (
            typeof envelope.token !== 'string' ||
            !/^([a-f0-9]{64})$/.test(envelope.token) ||
            !timingSafeEqual(
              Buffer.from(envelope.token),
              Buffer.from(controlToken)
            )
          )
            throw Error('CONTROL_DENIED');
          const c = envelope.command;
          if (c.method === 'crash') {
            {
              const exit = once(child, 'exit');
              child.kill('SIGKILL');
              await exit;
            }
            socket.end(
              JSON.stringify({ ok: true, status: 'owner-exited' }) + '\n'
            );
            return;
          }
          if (c.method === 'stop') {
            {
              const exit = once(child, 'exit');
              child.kill('SIGTERM');
              await exit;
            }
            socket.end(
              JSON.stringify({ ok: true, status: 'owner-exited' }) + '\n'
            );
            return;
          }
          if (
            !['fail_writes', 'fail_protection', 'inspect'].includes(c.method) ||
            (['fail_writes', 'fail_protection'].includes(c.method) &&
              typeof c.value !== 'boolean')
          )
            throw Error('INVALID_TEST_CONTROL');
          const id = String(++sequence);
          const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              waiting.delete(id);
              reject(Error('CONTROL_TIMEOUT'));
            }, 8000);
            waiting.set(id, {
              resolve: (x) => {
                clearTimeout(timer);
                resolve(x);
              },
              reject: (e) => {
                clearTimeout(timer);
                reject(e);
              },
            });
            child.send({ type: c.method, id, value: c.value });
          });
          socket.end(JSON.stringify({ ok: true, result }) + '\n');
        })().catch((e) =>
          socket.end(JSON.stringify({ ok: false, error: e.message }) + '\n')
        );
      });
    });
    server.on('error', (error) => {
      console.error('TEST_CONTROL_LISTEN_FAILED', error.code);
      child.kill('SIGTERM');
      end();
    });
    server.listen(0, '127.0.0.1', () => {
      atomicPrivate(endpoint, {
        format: sessionFormat,
        sessionId: session.id,
        bundleId,
        url: ready.url,
        token: ready.token,
        editorGrants: ready.editorGrants,
        spaceId: ready.spaceId,
        documentId: ready.documentId,
        ownerEpoch: ready.ownerEpoch,
        profile: ready.profile,
        controlPort: server.address().port,
        controlToken,
      });
    });
  }
  if (m.id && waiting.has(m.id)) {
    const w = waiting.get(m.id);
    waiting.delete(m.id);
    m.type === 'control_error' ? w.reject(Error(m.error)) : w.resolve(m);
  }
});
// No timeout takeover or signal to a PID read from a file. SQL lock decides ownership.
