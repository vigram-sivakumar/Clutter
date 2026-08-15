import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from './testing/InMemoryVaultFileSystem';
import { ensureAssetsDirectory } from './initialize/ensureAssetsDirectory';
import { importCoverAsset } from './importCoverAsset';

const ROOT = '/vault';

describe('ensureAssetsDirectory', () => {
  it('creates Assets/ lazily when missing', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    await ensureAssetsDirectory(fileSystem, ROOT);

    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(true);
  });

  it('is idempotent when Assets/ already exists', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Assets`);

    await ensureAssetsDirectory(fileSystem, ROOT);

    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(true);
  });
});

describe('importCoverAsset', () => {
  it('copies the source into Assets/ and returns a vault-relative reference', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const sourcePath = '/Users/me/Downloads/photo.png';
    fileSystem.seedFile(sourcePath, 'image-bytes');

    const reference = await importCoverAsset(fileSystem, ROOT, sourcePath);

    expect(reference).toBe('Assets/photo.png');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo.png`)).toBe('image-bytes');
    expect(fileSystem.getFileSync(sourcePath)).toBe('image-bytes');
  });

  it('creates Assets/ on first import', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/photo.png', 'bytes');

    await importCoverAsset(fileSystem, ROOT, '/external/photo.png');

    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(true);
  });

  it('resolves filename collisions with the numeric suffix convention', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/photo.png', 'first');
    await fileSystem.createDirectory(`${ROOT}/Assets`);
    fileSystem.seedFile(`${ROOT}/Assets/photo.png`, 'existing');

    const reference = await importCoverAsset(fileSystem, ROOT, '/external/photo.png');

    expect(reference).toBe('Assets/photo 2.png');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo 2.png`)).toBe('first');
  });

  it('preserves the original file extension', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/scan.jpeg', 'jpeg-bytes');

    const reference = await importCoverAsset(fileSystem, ROOT, '/external/scan.jpeg');

    expect(reference).toBe('Assets/scan.jpeg');
  });
});

describe('InMemoryVaultFileSystem.copyFile', () => {
  it('copies bytes without removing the source file', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/source/photo.png', 'bytes');

    await fileSystem.copyFile('/source/photo.png', `${ROOT}/Assets/photo.png`);

    expect(fileSystem.getFileSync('/source/photo.png')).toBe('bytes');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo.png`)).toBe('bytes');
  });
});
