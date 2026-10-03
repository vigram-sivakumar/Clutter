import { describe, expect, it, vi } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { importRemoteAsset } from './importRemoteAsset';

const ROOT = '/vault';
const bytes = new Uint8Array([137, 80, 78, 71]);
const fetchPng = vi.fn(async () => ({ bytes, contentType: 'image/png' }));

describe('importRemoteAsset', () => {
  it('saves the bytes into Assets/ under the URL\'s file name and returns the vault-relative reference', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const reference = await importRemoteAsset(fileSystem, ROOT, 'https://example.com/img/mountain.jpg?w=800', fetchPng);

    expect(reference).toBe('Assets/mountain.jpg');
    expect(await fileSystem.exists(`${ROOT}/Assets/mountain.jpg`)).toBe(true);
    expect(fetchPng).toHaveBeenCalledWith('https://example.com/img/mountain.jpg?w=800');
  });

  it('names a collision like every other import (`photo`, `photo 2`) — never overwriting', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [`${ROOT}/Assets/photo.png`]: 'existing' });

    const reference = await importRemoteAsset(fileSystem, ROOT, 'https://example.com/photo.png', fetchPng);

    expect(reference).toBe('Assets/photo 2.png');
    expect(await fileSystem.readFile(`${ROOT}/Assets/photo.png`)).toBe('existing');
  });

  it('takes the extension from the content type when the URL has none', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const reference = await importRemoteAsset(fileSystem, ROOT, 'https://images.example.com/photo/123', async () => ({
      bytes,
      contentType: 'image/webp; charset=binary',
    }));

    expect(reference).toBe('Assets/123.webp');
  });

  it('falls back to "image" for a URL with no file name', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    expect(await importRemoteAsset(fileSystem, ROOT, 'https://example.com/', fetchPng)).toBe('Assets/image.png');
  });

  it('refuses a response that is not a supported asset, writing nothing', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    await expect(
      importRemoteAsset(fileSystem, ROOT, 'https://example.com/page', async () => ({ bytes, contentType: 'text/html' }))
    ).rejects.toThrow(/Not a supported/);
    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(false);
  });

  it('refuses when the file system cannot write binary data', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    Object.defineProperty(fileSystem, 'writeBinaryFile', { value: undefined });

    await expect(importRemoteAsset(fileSystem, ROOT, 'https://example.com/a.png', fetchPng)).rejects.toThrow(/cannot save/);
  });
});
