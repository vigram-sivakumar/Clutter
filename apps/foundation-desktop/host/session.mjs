// Private disposable-session discovery only. Never a document or mutation authority.
import {
  constants as C,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fstatSync,
  realpathSync,
  lstatSync,
  renameSync,
  fsyncSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { SqliteVault } from '@clutter/foundation-runtime/sqlite';
import { syncDirectory } from '../../../packages/foundation-runtime/src/adapters/media-files.mjs';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function privateJSON(path, value) {
  const temp = path + '.' + randomUUID() + '.part';
  const fd = openSync(
    temp,
    C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
    0o600
  );
  try {
    writeFileSync(fd, JSON.stringify(value) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  syncDirectory(dirname(path));
}
export function readJSON(path) {
  const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    if (
      !s.isFile() ||
      s.size > 1048576 ||
      (process.platform !== 'win32' &&
        ((s.mode & 0o077) !== 0 || s.uid !== process.getuid()))
    )
      throw Error('PRIVATE_FILE_REQUIRED');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}
export function verifyBundle(resources) {
  const m = readJSON(join(resources, 'bundle.json'));
  if (
    m.format !== 'clutter-foundation-desktop48' ||
    !m.files ||
    !Object.keys(m.files).length
  )
    throw Error('WRONG_BUNDLE');
  for (const [name, digest] of Object.entries(m.files)) {
    if (
      name.startsWith('/') ||
      name.includes('\\') ||
      name.split('/').includes('..') ||
      !/^([a-f0-9]{64})$/.test(digest) ||
      hash(readFileSync(join(resources, name))) !== digest
    )
      throw Error('BUNDLE_INTEGRITY');
  }
  return hash(JSON.stringify(m));
}
export async function createSession(resources) {
  const bundleId = verifyBundle(resources),
    directory = mkdtempSync(
      join(realpathSync(tmpdir()), 'clutter-foundation48-')
    );
  // A stable per-session port is the kernel-exclusive owner reservation. It is NOT
  // an authentication credential or PID/timeout lock; collision fails closed.
  const probe = createServer();
  await new Promise((ok, no) => {
    probe.once('error', no);
    probe.listen({ host: '127.0.0.1', port: 0, exclusive: true }, ok);
  });
  const port = probe.address().port;
  await new Promise((ok) => probe.close(ok));
  const vault = SqliteVault.createDisposable();
  const m = {
    format: 'clutter-foundation-session48',
    id: basename(directory),
    directory,
    bundleId,
    vaultDir: vault.directory,
    spaceId: vault.spaceId,
    port,
    tokens: { ui: randomUUID(), automation: randomUUID(), admin: randomUUID() },
  };
  vault.close();
  mkdirSync(join(directory, 'pending'), { mode: 0o700 });
  privateJSON(join(directory, 'session.json'), m);
  return directory;
}
export function readSession(directory, resources) {
  if (
    realpathSync(directory) !== directory ||
    dirname(directory) !== realpathSync(tmpdir()) ||
    !/^clutter-foundation48-[a-zA-Z0-9]+$/.test(basename(directory))
  )
    throw Error('WRONG_DISPOSABLE_SESSION');
  const st = lstatSync(directory);
  if (
    !st.isDirectory() ||
    st.isSymbolicLink() ||
    (process.platform !== 'win32' &&
      ((st.mode & 0o077) !== 0 || st.uid !== process.getuid()))
  )
    throw Error('PRIVATE_SESSION_REQUIRED');
  const m = readJSON(join(directory, 'session.json'));
  if (
    m.format !== 'clutter-foundation-session48' ||
    m.id !== basename(directory) ||
    m.directory !== directory ||
    m.bundleId !== verifyBundle(resources) ||
    !Number.isInteger(m.port) ||
    m.port < 1024 ||
    m.port > 65535 ||
    !m.tokens ||
    Object.keys(m.tokens).sort().join() !== 'admin,automation,ui' ||
    Object.values(m.tokens).some(
      (t) => typeof t !== 'string' || !/^[a-f0-9-]{36}$/.test(t)
    )
  )
    throw Error('INVALID_DISPOSABLE_SESSION');
  const pending = lstatSync(join(directory, 'pending'));
  if (!pending.isDirectory() || pending.isSymbolicLink())
    throw Error('UNSAFE_PENDING_DIRECTORY');
  return m;
}
