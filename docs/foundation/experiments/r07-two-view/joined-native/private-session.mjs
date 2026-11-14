// Isolated same-user lab discovery. No production registry or PID-based takeover.
import {
  mkdirSync,
  lstatSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export const sessionFormat = 'clutter-joined-native-session-v1';
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function privatePath(path, mode) {
  const s = lstatSync(path);
  if (
    s.isSymbolicLink() ||
    s.uid !== process.getuid() ||
    (s.mode & 0o777) !== mode
  )
    throw Error('UNSAFE_PRIVATE_PATH');
  return s;
}
export function readPrivate(path) {
  privatePath(path, 0o600);
  const b = readFileSync(path);
  if (b.length > 1048576) throw Error('DESCRIPTOR_LIMIT');
  return JSON.parse(b);
}
export function atomicPrivate(path, value) {
  const tmp = path + '.' + randomUUID() + '.tmp';
  writeFileSync(tmp, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
  let fd = openSync(tmp, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  fd = openSync(resolve(path, '..'), 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function createSession(path) {
  path = resolve(path);
  mkdirSync(path, { mode: 0o700 });
  atomicPrivate(join(path, 'session.json'), {
    format: sessionFormat,
    id: randomUUID(),
  });
  return checkSession(path);
}
export function checkSession(path) {
  path = resolve(path);
  if (!privatePath(path, 0o700).isDirectory() || realpathSync(path) !== path)
    throw Error('UNSAFE_SESSION');
  const marker = readPrivate(join(path, 'session.json'));
  if (marker.format !== sessionFormat || typeof marker.id !== 'string')
    throw Error('UNMARKED_SESSION');
  return { path, id: marker.id };
}
export function checkDescriptor(d, session, bundleId) {
  const u = new URL(d.url);
  if (
    d.format !== sessionFormat ||
    d.sessionId !== session.id ||
    d.bundleId !== bundleId ||
    u.protocol !== 'http:' ||
    u.hostname !== '127.0.0.1' ||
    u.pathname !== '/rpc' ||
    u.search ||
    u.hash ||
    u.username ||
    u.password ||
    !u.port ||
    !/^[a-f0-9]{64}$/.test(d.token) ||
    !['A', 'B'].every((id) => /^[a-f0-9]{64}$/.test(d.editorGrants?.[id])) ||
    typeof d.ownerEpoch !== 'string' ||
    !Number.isInteger(d.controlPort) ||
    d.controlPort < 1 ||
    d.controlPort > 65535 ||
    !/^[a-f0-9]{64}$/.test(d.controlToken)
  )
    throw Error('INVALID_PRIVATE_DESCRIPTOR');
  return d;
}
export function bundleIdentity(resources) {
  const manifest = JSON.parse(readFileSync(join(resources, 'bundle.json')));
  for (const [name, want] of Object.entries(manifest.files)) {
    if (
      ![
        'runtime/node',
        'owner.mjs',
        'service.mjs',
        'launcher.mjs',
        'web/origin.js',
        'web/origin.html',
        'web/style.css',
        'web/tables.css',
        'web/prosemirror.css',
      ].includes(name)
    )
      throw Error('INVALID_BUNDLE_MANIFEST');
    if (sha(readFileSync(join(resources, name))) !== want)
      throw Error('BUNDLE_CHANGED');
  }
  if (Object.keys(manifest.files).length !== 9)
    throw Error('INCOMPLETE_BUNDLE');
  return sha(Buffer.from(JSON.stringify(manifest.files)));
}
