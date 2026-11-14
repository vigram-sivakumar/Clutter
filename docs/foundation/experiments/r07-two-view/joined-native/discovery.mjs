import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { openSync, closeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkSession,
  readPrivate,
  checkDescriptor,
  bundleIdentity,
} from './private-session.mjs';
import { remoteCommand } from '../src/live-client.mjs';
export const resources = dirname(fileURLToPath(import.meta.url));
export async function ensureOwner(path) {
  const session = checkSession(path),
    bundleId = bundleIdentity(resources);
  let launched = false;
  const until = Date.now() + 12000;
  for (;;) {
    try {
      const d = checkDescriptor(
        readPrivate(join(session.path, 'endpoint.json')),
        session,
        bundleId
      );
      const r = await remoteCommand(
        { method: 'read', spaceId: d.spaceId, documentId: d.documentId },
        d
      );
      if (r.ownerEpoch !== d.ownerEpoch)
        throw Error('OWNER_GENERATION_MISMATCH');
      return d;
    } catch (e) {
      if (
        !['ENOENT', 'TRANSPORT_OUTCOME_UNKNOWN'].includes(
          e.code ?? e.message
        ) &&
        !/^RELAY_HTTP_/.test(e.message)
      )
        throw e;
    }
    if (!launched) {
      const fd = openSync(join(session.path, 'service.log'), 'a', 0o600);
      const child = spawn(
        process.execPath,
        [join(resources, 'service.mjs'), session.path],
        { detached: true, stdio: ['ignore', fd, fd] }
      );
      child.unref();
      closeSync(fd);
      launched = true;
    }
    if (Date.now() > until) throw Error('OWNER_START_FAILED_SEE_PRIVATE_LOGS');
    await new Promise((r) => setTimeout(r, 50));
  }
}
export function testControl(d, c) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: d.controlPort });
    let data = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(Error('CONTROL_TIMEOUT'));
    }, 10000);
    socket.on('connect', () =>
      socket.write(JSON.stringify({ token: d.controlToken, command: c }) + '\n')
    );
    socket.on('data', (b) => {
      data += b;
      if (data.length > 1048576) {
        socket.destroy();
        reject(Error('CONTROL_LIMIT'));
      }
    });
    socket.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.on('end', () => {
      clearTimeout(timer);
      try {
        const r = JSON.parse(data);
        if (!r.ok) throw Error(r.error);
        resolve(r);
      } catch (e) {
        reject(e);
      }
    });
  });
}
