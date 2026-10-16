import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { importAssetBytes, isSupportedAssetMimeType, pastedAssetFileName } from './importAsset';

describe('pastedAssetFileName', () => {
  it('names a generic clipboard screenshot, and keeps a real name and extension', () => {
    expect(pastedAssetFileName('image.png', 'image/png')).toBe('Pasted image.png');
    expect(pastedAssetFileName('', 'image/jpeg')).toBe('Pasted image.jpg');
    expect(pastedAssetFileName('Trip.JPG', 'image/jpeg')).toBe('Trip.JPG');
    expect(pastedAssetFileName('report', 'application/pdf')).toBe('report.pdf');
  });

  it('cannot escape Assets/ and refuses unsupported types', () => {
    expect(pastedAssetFileName('../../evil.png', 'image/png')).toBe('evil.png');
    expect(() => pastedAssetFileName('a.zip', 'application/zip')).toThrow();
    expect(isSupportedAssetMimeType('image/webp')).toBe(true);
    expect(isSupportedAssetMimeType('text/html')).toBe(false);
  });
});

describe('importAssetBytes', () => {
  it('writes the bytes into Assets/ with collision-free names and returns the vault-relative reference', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const bytes = new Uint8Array([1, 2, 3]);

    const first = await importAssetBytes(fileSystem, '/vault', 'Pasted image.png', bytes);
    const second = await importAssetBytes(fileSystem, '/vault', 'Pasted image.png', bytes);

    expect(first).toBe('Assets/Pasted image.png');
    expect(second).toBe('Assets/Pasted image 2.png');
    expect(await fileSystem.readBinaryFile!('/vault/Assets/Pasted image.png')).toEqual(bytes);
  });

  it('refuses empty bytes without writing', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    await expect(importAssetBytes(fileSystem, '/vault', 'a.png', new Uint8Array())).rejects.toThrow();
    expect(await fileSystem.exists('/vault/Assets/a.png')).toBe(false);
  });
});
