import { describe, expect, it, vi } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import {
  MAX_REMOTE_ASSET_BYTES,
  importRemoteAsset,
  remoteAssetStem,
  remoteAssetUrlHash,
} from './importRemoteAsset';

const ROOT = '/vault';
const bytes = new Uint8Array([137, 80, 78, 71]);
const png = () => vi.fn(async () => ({ bytes, contentType: 'image/png' }));

const nameOf = (url: string, ext: string) => `${remoteAssetStem(url)}-${remoteAssetUrlHash(url)}${ext}`;

describe('importRemoteAsset — destination and file name', () => {
  it('saves under Assets/ as <stem>-<url hash>.<ext> and reports reference, absolute path and not-reused', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const url = 'https://example.com/image.jpg';

    const saved = await importRemoteAsset(fileSystem, ROOT, url, async () => ({ bytes, contentType: 'image/jpeg' }));

    expect(saved.reference).toBe(`Assets/${nameOf(url, '.jpg')}`);
    expect(saved.absolutePath).toBe(`${ROOT}/${saved.reference}`);
    expect(saved.reused).toBe(false);
    expect(await fileSystem.exists(saved.absolutePath)).toBe(true);
  });

  it.each([
    ['https://example.com/image.jpg', 'image'],
    ['https://example.com/image', 'image'],
    ['https://example.com/photo?id=123', 'photo'],
    ['https://example.com/image.jpg?token=abc', 'image'],
    ['https://example.com/', 'image'],
  ])('derives a safe stem from %s', (url, stem) => {
    expect(remoteAssetStem(url)).toBe(stem);
  });

  it('is deterministic, and the query string makes a different file (it can be a different image)', () => {
    const a = 'https://example.com/photo?id=1';
    const b = 'https://example.com/photo?id=2';

    expect(remoteAssetUrlHash(a)).toBe(remoteAssetUrlHash(a));
    expect(remoteAssetUrlHash(a)).not.toBe(remoteAssetUrlHash(b));
  });

  it('can never escape Assets/ or produce a hidden/odd name, whatever the URL says', () => {
    for (const url of [
      'https://example.com/..%2F..%2Fetc%2Fpasswd',
      'https://example.com/%2e%2e/%2e%2e/secret.png',
      'https://example.com/a%00b%5Cc.png',
      'https://example.com/.hidden.png',
      `https://example.com/${'x'.repeat(500)}.png`,
    ]) {
      const stem = remoteAssetStem(url);
      expect(stem).not.toMatch(/[/\\]|^\./);
      expect(stem.length).toBeLessThanOrEqual(80);
      expect(stem.length).toBeGreaterThan(0);
    }
  });

  it('takes the extension from the content type, which wins over a wrong URL extension', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/pic.png', async () => ({
      bytes,
      contentType: 'image/webp; charset=binary',
    }));

    expect(saved.reference.endsWith('.webp')).toBe(true);
  });

  it('uses the URL extension when the server sends a generic binary type', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/pic.png', async () => ({
      bytes,
      contentType: 'application/octet-stream',
    }));

    expect(saved.reference.endsWith('.png')).toBe(true);
  });

  it('handles a URL with no extension, via its content type', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/photo/123', png());

    expect(saved.reference.endsWith('.png')).toBe(true);
  });
});

describe('importRemoteAsset — reuse and collisions', () => {
  it('reuses the file already saved from the same URL: no download, no second copy', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const fetchAsset = png();
    const url = 'https://example.com/a.png';

    const first = await importRemoteAsset(fileSystem, ROOT, url, fetchAsset);
    const second = await importRemoteAsset(fileSystem, ROOT, url, fetchAsset);

    expect(second.reference).toBe(first.reference);
    expect(second.reused).toBe(true);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(await fileSystem.readDirectory(`${ROOT}/Assets`)).toHaveLength(1);
  });

  it('two URLs that share a file name get different files', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const a = await importRemoteAsset(fileSystem, ROOT, 'https://a.com/photo.png', png());
    const b = await importRemoteAsset(fileSystem, ROOT, 'https://b.com/photo.png', png());

    expect(a.reference).not.toBe(b.reference);
  });

  it('a file already holding this URL\'s name is reused as is, never overwritten', async () => {
    const url = 'https://example.com/a.png';
    const taken = `${ROOT}/Assets/${nameOf(url, '.png')}`;
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Assets`);
    await fileSystem.writeFile(taken, 'earlier save');
    const fetchAsset = png();

    const saved = await importRemoteAsset(fileSystem, ROOT, url, fetchAsset);

    expect(saved.reused).toBe(true);
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(await fileSystem.readFile(taken)).toBe('earlier save');
  });
});

describe('importRemoteAsset — validation (nothing is written on failure)', () => {
  const failsWithoutWriting = async (url: string, fetched: { bytes: Uint8Array; contentType?: string | null }, message: RegExp) => {
    const fileSystem = new InMemoryVaultFileSystem();

    await expect(importRemoteAsset(fileSystem, ROOT, url, async () => fetched)).rejects.toThrow(message);
    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(false);
  };

  it('refuses an HTML page even when the URL ends in .jpg', () =>
    failsWithoutWriting('https://x.com/a.jpg', { bytes, contentType: 'text/html' }, /Not a supported/));

  it('refuses an unsupported image type', () =>
    failsWithoutWriting('https://x.com/a', { bytes, contentType: 'image/bmp' }, /Not a supported/));

  it('refuses a generic binary type when the URL has no supported extension', () =>
    failsWithoutWriting('https://x.com/a', { bytes, contentType: 'application/octet-stream' }, /Not a supported/));

  it('refuses an empty download', () =>
    failsWithoutWriting('https://x.com/a.png', { bytes: new Uint8Array(0), contentType: 'image/png' }, /empty/));

  it('refuses a file over the size limit', () =>
    failsWithoutWriting(
      'https://x.com/big.png',
      { bytes: new Uint8Array(MAX_REMOTE_ASSET_BYTES + 1), contentType: 'image/png' },
      /too large/
    ));

  it('accepts a large file that is under the limit', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/big.png', async () => ({
      bytes: new Uint8Array(5 * 1024 * 1024),
      contentType: 'image/png',
    }));

    expect(saved.reused).toBe(false);
  });

  it('refuses when the file system cannot write binary data', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    Object.defineProperty(fileSystem, 'writeBinaryFile', { value: undefined });

    await expect(importRemoteAsset(fileSystem, ROOT, 'https://x.com/a.png', png())).rejects.toThrow(/cannot save/);
  });

  it('propagates a failed download without writing', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    await expect(
      importRemoteAsset(fileSystem, ROOT, 'https://x.com/a.png', async () => {
        throw new Error('Could not download (404).');
      })
    ).rejects.toThrow(/404/);
    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(false);
  });
});
