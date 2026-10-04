import { describe, expect, it, vi } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { MAX_REMOTE_ASSET_BYTES, importRemoteAsset, remoteAssetStem } from './importRemoteAsset';

const ROOT = '/vault';
const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const otherBytes = new Uint8Array([137, 80, 78, 71, 9, 9, 9]);
const png = (payload = bytes) => vi.fn(async () => ({ bytes: payload, contentType: 'image/png' }));

describe('importRemoteAsset — name from the display text', () => {
  it('names the file after the display text the user typed, keeping the extension from the response', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://example.com/f1fe.jpg', png(), {
      displayName: 'Mountain at dawn',
    });

    expect(saved.reference).toBe('Assets/Mountain at dawn.png');
    expect(saved.absolutePath).toBe(`${ROOT}/Assets/Mountain at dawn.png`);
    expect(saved.reused).toBe(false);
    expect(await fileSystem.exists(saved.absolutePath)).toBe(true);
  });

  it.each([undefined, '', '  ', 'image', 'Screenshot', 'IMG_1234', 'https://example.com/x.png', '12345'])(
    'falls back to the URL\'s own name for display text %j',
    async (displayName) => {
      const fileSystem = new InMemoryVaultFileSystem();

      const saved = await importRemoteAsset(fileSystem, ROOT, 'https://example.com/img/mountain.png?w=800', png(), {
        displayName,
      });

      expect(saved.reference).toBe('Assets/mountain.png');
    }
  );

  it('keeps non-Latin text', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/a.png', png(), { displayName: 'மலை காட்சி' });

    expect(saved.reference).toBe('Assets/மலை காட்சி.png');
  });

  it('cannot escape Assets/ whatever the display text says', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/a.png', png(), {
      displayName: '../../etc/passwd',
    });

    expect(saved.reference.startsWith('Assets/')).toBe(true);
    expect(saved.reference.slice('Assets/'.length)).not.toMatch(/[/\\]/);
    expect(saved.absolutePath.startsWith(`${ROOT}/Assets/`)).toBe(true);
  });

  it.each([
    ['https://example.com/image.jpg', 'image'],
    ['https://example.com/image', 'image'],
    ['https://example.com/photo?id=123', 'photo'],
    ['https://example.com/image.jpg?token=abc', 'image'],
    ['https://example.com/', 'image'],
  ])('URL fallback stem for %s', (url, stem) => {
    expect(remoteAssetStem(url)).toBe(stem);
  });

  it('the content type wins over a wrong URL extension; a URL with no extension works via its content type', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const webp = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/pic.png', async () => ({
      bytes,
      contentType: 'image/webp; charset=binary',
    }), { displayName: 'A' });
    const bare = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/photo/123', png(), { displayName: 'B' });

    expect(webp.reference).toBe('Assets/A.webp');
    expect(bare.reference).toBe('Assets/B.png');
  });

  it('uses the URL extension when the server sends a generic binary type', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const saved = await importRemoteAsset(fileSystem, ROOT, 'https://x.com/pic.png', async () => ({
      bytes,
      contentType: 'application/octet-stream',
    }), { displayName: 'Sunrise' });

    expect(saved.reference).toBe('Assets/Sunrise.png');
  });
});

describe('importRemoteAsset — collisions and reuse', () => {
  it('a different image with the same name gets the collision-free suffix, never overwriting', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const first = await importRemoteAsset(fileSystem, ROOT, 'https://a.com/1.png', png(bytes), { displayName: 'Sunset' });
    const second = await importRemoteAsset(fileSystem, ROOT, 'https://b.com/2.png', png(otherBytes), { displayName: 'Sunset' });
    const third = await importRemoteAsset(fileSystem, ROOT, 'https://c.com/3.png', png(new Uint8Array([5, 5])), { displayName: 'Sunset' });

    expect(first.reference).toBe('Assets/Sunset.png');
    expect(second.reference).toBe('Assets/Sunset 2.png');
    expect(third.reference).toBe('Assets/Sunset 3.png');
    expect(second.reused).toBe(false);
  });

  it('the name check ignores case: Sunset vs sunset is the same file on macOS/Windows', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const first = await importRemoteAsset(fileSystem, ROOT, 'https://a.com/1.png', png(bytes), { displayName: 'Sunset' });
    const second = await importRemoteAsset(fileSystem, ROOT, 'https://b.com/2.png', png(otherBytes), { displayName: 'sunset' });

    expect(first.reference).toBe('Assets/Sunset.png');
    expect(second.reference).toBe('Assets/sunset 2.png');
  });

  it('saving the same image again reuses the identical file instead of making "Name 2"', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const url = 'https://example.com/a.png';

    const first = await importRemoteAsset(fileSystem, ROOT, url, png(), { displayName: 'Mountain' });
    const again = await importRemoteAsset(fileSystem, ROOT, url, png(), { displayName: 'Mountain' });

    expect(again).toMatchObject({ reference: first.reference, reused: true });
    expect((await fileSystem.readDirectory(`${ROOT}/Assets`)).filter((e) => !e.isDirectory)).toHaveLength(1);
  });

  it('reuses an identical file in the name family even when it is "Name 2", and even with a different display text only if the name matches', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await importRemoteAsset(fileSystem, ROOT, 'https://a.com/1.png', png(bytes), { displayName: 'Sunset' });
    const second = await importRemoteAsset(fileSystem, ROOT, 'https://b.com/2.png', png(otherBytes), { displayName: 'Sunset' });

    const again = await importRemoteAsset(fileSystem, ROOT, 'https://b.com/2.png', png(otherBytes), { displayName: 'Sunset' });

    expect(second.reference).toBe('Assets/Sunset 2.png');
    expect(again).toMatchObject({ reference: 'Assets/Sunset 2.png', reused: true });
  });

  it('without a binary read primitive it skips the reuse check and writes a new file', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    Object.defineProperty(fileSystem, 'readBinaryFile', { value: undefined });
    await importRemoteAsset(fileSystem, ROOT, 'https://a.com/1.png', png(), { displayName: 'Sunset' });

    const again = await importRemoteAsset(fileSystem, ROOT, 'https://a.com/1.png', png(), { displayName: 'Sunset' });

    expect(again).toMatchObject({ reference: 'Assets/Sunset 2.png', reused: false });
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
