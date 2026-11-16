import {
  constants as C,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  existsSync,
} from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SqliteVault } from '../../../../packages/foundation-runtime/src/adapters/sqlite-vault.ts';
import { hash } from '../../../../packages/foundation-runtime/src/adapters/media-formats.mjs';
import { syncDirectory } from '../../../../packages/foundation-runtime/src/adapters/media-files.mjs';
export function atomicPrivate(path, value) {
  const temp = path + '.' + randomUUID() + '.part',
    fd = openSync(
      temp,
      C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
      0o600
    );
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  syncDirectory(dirname(path));
}
export function json(path) {
  const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 1048576)
      throw Error('INVALID_PRIVATE_FILE');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}
export function bundle(resources) {
  const m = json(join(resources, 'bundle.json'));
  if (m.format !== 'clutter-native-core28') throw Error('WRONG_BUNDLE');
  for (const [name, digest] of Object.entries(m.files)) {
    if (
      name.includes('..') ||
      name.startsWith('/') ||
      hash(readFileSync(join(resources, name))) !== digest
    )
      throw Error('BUNDLE_INTEGRITY');
  }
  return hash(JSON.stringify(m));
}
export function createSession(resources) {
  const bundleId = bundle(resources),
    directory = mkdtempSync(join(realpathSync(tmpdir()), 'clutter-native28-'));
  const v = SqliteVault.createDisposable();
  const value = {
    format: 'clutter-native-session28',
    id: randomUUID(),
    bundleId,
    vaultDir: v.directory,
    spaceId: v.spaceId,
  };
  v.close();
  atomicPrivate(join(directory, 'session.json'), value);
  mkdirSync(join(directory, 'pending'), { mode: 0o700 });
  syncDirectory(directory);
  return directory;
}
export function session(directory, resources) {
  if (
    realpathSync(directory) !== directory ||
    dirname(directory) !== realpathSync(tmpdir()) ||
    !/^clutter-native28-[a-zA-Z0-9]+$/.test(basename(directory)) ||
    lstatSync(directory).isSymbolicLink()
  )
    throw Error('WRONG_NATIVE_SESSION');
  const value = json(join(directory, 'session.json'));
  if (
    value.format !== 'clutter-native-session28' ||
    value.bundleId !== bundle(resources)
  )
    throw Error('WRONG_NATIVE_SESSION');
  const p = lstatSync(join(directory, 'pending'));
  if (!p.isDirectory() || p.isSymbolicLink())
    throw Error('UNSAFE_PENDING_DIRECTORY');
  return value;
}
