import {
  constants as C,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  writeSync,
  fchmodSync,
  fstatSync,
  readFileSync,
  linkSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, validateBytes, MAX_BYTES } from './media-formats.mjs';
const validHash = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function syncDirectory(path) {
  const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isDirectory()) throw Error('UNSAFE_ASSET_DIRECTORY');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function directory(path, parent) {
  if (!existsSync(path)) {
    mkdirSync(path, { mode: 0o700 });
    syncDirectory(parent);
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error('UNSAFE_ASSET_DIRECTORY');
}
export function directories(store, { create = false } = {}) {
  const media = join(store.dir, 'media'),
    objects = join(media, 'objects'),
    staging = join(media, 'staging');
  if (create) {
    directory(media, store.dir);
    directory(objects, media);
    directory(staging, media);
  } else
    for (const path of [media, objects, staging]) {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw Error('UNSAFE_ASSET_DIRECTORY');
    }
  return { media, objects, staging };
}
export function readObject(store, digest, meta) {
  if (!validHash(digest)) throw Error('INVALID_ASSET_HASH');
  const { objects } = directories(store),
    path = join(objects, digest);
  let fd;
  try {
    fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size !== meta.bytes || stat.size > MAX_BYTES)
      throw Error('BROKEN_EXTERNAL_ASSET');
    const bytes = readFileSync(fd);
    if (hash(bytes) !== digest) throw Error('BROKEN_EXTERNAL_ASSET');
    validateBytes(bytes, meta.mime);
    return bytes;
  } catch (e) {
    if (['ENOENT', 'ELOOP'].includes(e.code))
      throw Error('BROKEN_EXTERNAL_ASSET');
    throw e;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export async function publish(store, c, bytes) {
  const digest = hash(bytes),
    meta = { bytes: bytes.length, mime: c.mime };
  validateBytes(bytes, c.mime);
  await store.phase('asset_before_stage', c);
  const dirs = directories(store, { create: true }),
    path = join(dirs.objects, digest);
  if (
    existsSync(path) ||
    (() => {
      try {
        return lstatSync(path).isSymbolicLink();
      } catch (e) {
        if (e.code === 'ENOENT') return false;
        throw e;
      }
    })()
  ) {
    readObject(store, digest, meta);
    const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW);
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    await store.phase('asset_before_dir_sync', c);
    syncDirectory(dirs.objects);
    await store.phase('asset_after_dir_sync', c);
    return { digest, meta };
  }
  const stage = join(dirs.staging, randomUUID() + '.part'),
    fd = openSync(
      stage,
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
      0o600
    );
  try {
    const middle = Math.max(1, Math.floor(bytes.length / 2));
    const writeAll = (start, end) => {
      let at = start;
      while (at < end) {
        const n = writeSync(fd, bytes, at, end - at);
        if (!n) throw Error('SHORT_ASSET_WRITE');
        at += n;
      }
    };
    writeAll(0, middle);
    await store.phase('asset_half_written', c);
    writeAll(middle, bytes.length);
    await store.phase('asset_before_file_sync', c);
    fchmodSync(fd, 0o400);
    fsyncSync(fd);
    await store.phase('asset_after_file_sync', c);
  } finally {
    closeSync(fd);
  }
  try {
    linkSync(stage, path);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    readObject(store, digest, meta);
  }
  await store.phase('asset_after_publish', c);
  await store.phase('asset_before_dir_sync', c);
  syncDirectory(dirs.objects);
  await store.phase('asset_after_dir_sync', c);
  readObject(store, digest, meta);
  unlinkSync(stage);
  syncDirectory(dirs.staging);
  return { digest, meta };
}
