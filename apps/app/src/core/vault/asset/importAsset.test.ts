import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { importAsset } from './importAsset';

const ROOT = '/vault';

describe('importAsset', () => {
  it('copies the source into Assets/ and returns a vault-relative reference', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const sourcePath = '/Users/me/Downloads/photo.png';
    fileSystem.seedFile(sourcePath, 'image-bytes');

    const reference = await importAsset(fileSystem, ROOT, sourcePath);

    expect(reference).toBe('Assets/photo.png');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo.png`)).toBe('image-bytes');
    expect(fileSystem.getFileSync(sourcePath)).toBe('image-bytes');
  });

  it('creates Assets/ when absent', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/photo.png', 'bytes');

    await importAsset(fileSystem, ROOT, '/external/photo.png');

    expect(await fileSystem.exists(`${ROOT}/Assets`)).toBe(true);
  });

  it('resolves filename collisions with the existing numeric suffix convention', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/photo.png', 'first');
    await fileSystem.createDirectory(`${ROOT}/Assets`);
    fileSystem.seedFile(`${ROOT}/Assets/photo.png`, 'existing');

    const reference = await importAsset(fileSystem, ROOT, '/external/photo.png');

    expect(reference).toBe('Assets/photo 2.png');
    expect(fileSystem.getFileSync(`${ROOT}/Assets/photo 2.png`)).toBe('first');
  });

  it('resolves a second collision to the next available suffix', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/photo.png', 'third');
    await fileSystem.createDirectory(`${ROOT}/Assets`);
    fileSystem.seedFile(`${ROOT}/Assets/photo.png`, 'existing');
    fileSystem.seedFile(`${ROOT}/Assets/photo 2.png`, 'existing 2');

    const reference = await importAsset(fileSystem, ROOT, '/external/photo.png');

    expect(reference).toBe('Assets/photo 3.png');
  });

  it('preserves the original file extension', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/scan.jpeg', 'jpeg-bytes');

    const reference = await importAsset(fileSystem, ROOT, '/external/scan.jpeg');

    expect(reference).toBe('Assets/scan.jpeg');
  });
});
