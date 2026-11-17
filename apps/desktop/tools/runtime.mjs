// Standalone bootstrap: runs on the developer's current Node before typed Core loads.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  mkdtempSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
export const lock = JSON.parse(
  readFileSync(new URL('./runtime-lock.json', import.meta.url))
);
const hash = (b) => createHash('sha256').update(b).digest('hex');
export function verifyArchive(bytes, arch) {
  const item = lock.archives[arch];
  if (!item || hash(bytes) !== item.sha256)
    throw Error('PINNED_RUNTIME_CHECKSUM_MISMATCH');
  return item;
}
export async function acquireRuntime(cache, arch) {
  const item = lock.archives[arch];
  if (!item) throw Error('UNSUPPORTED_RUNTIME_ARCH');
  mkdirSync(cache, { recursive: true });
  const archive = join(cache, item.file);
  if (!existsSync(archive)) {
    const r = await fetch(
      'https://nodejs.org/download/release/' + lock.version + '/' + item.file,
      { signal: AbortSignal.timeout(120000) }
    );
    if (!r.ok) throw Error('RUNTIME_DOWNLOAD_FAILED');
    const chunks = [];
    let size = 0;
    for await (const c of r.body) {
      size += c.length;
      if (size > 150 * 1024 * 1024) throw Error('RUNTIME_ARCHIVE_LIMIT');
      chunks.push(c);
    }
    const bytes = Buffer.concat(chunks);
    verifyArchive(bytes, arch);
    writeFileSync(archive, bytes, { mode: 0o600, flag: 'wx' });
  }
  verifyArchive(readFileSync(archive), arch);
  const target = mkdtempSync(join(cache, 'extract-'));
  const r = spawnSync('/usr/bin/tar', ['-xzf', archive, '-C', target], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw Error('RUNTIME_EXTRACT_FAILED');
  return {
    binary: join(target, item.file.slice(0, -7), 'bin/node'),
    license: join(target, item.file.slice(0, -7), 'LICENSE'),
  };
}
