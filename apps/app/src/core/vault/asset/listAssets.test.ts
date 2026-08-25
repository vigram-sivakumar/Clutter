import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { importAsset } from './importAsset';
import { listAssets } from './listAssets';

const ROOT = '/vault';

describe('listAssets', () => {
  it('lists existing assets as vault-relative references', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Assets`);
    fileSystem.seedFile(`${ROOT}/Assets/photo.png`, 'bytes');
    fileSystem.seedFile(`${ROOT}/Assets/scan.jpeg`, 'bytes');

    const entries = await listAssets(fileSystem, ROOT);

    expect(entries).toEqual(
      expect.arrayContaining([
        { reference: 'Assets/photo.png', name: 'photo.png' },
        { reference: 'Assets/scan.jpeg', name: 'scan.jpeg' },
      ])
    );
    expect(entries).toHaveLength(2);
  });

  it('returns an empty list when Assets/ does not exist yet', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const entries = await listAssets(fileSystem, ROOT);

    expect(entries).toEqual([]);
  });

  it('returns an empty list when Assets/ exists but is empty', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Assets`);

    const entries = await listAssets(fileSystem, ROOT);

    expect(entries).toEqual([]);
  });

  it('excludes subdirectories from the listing', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Assets`);
    await fileSystem.createDirectory(`${ROOT}/Assets/Nested`);
    fileSystem.seedFile(`${ROOT}/Assets/photo.png`, 'bytes');

    const entries = await listAssets(fileSystem, ROOT);

    expect(entries).toEqual([{ reference: 'Assets/photo.png', name: 'photo.png' }]);
  });

  it('reflects an asset imported via importAsset', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/photo.png', 'bytes');
    await importAsset(fileSystem, ROOT, '/external/photo.png');

    const entries = await listAssets(fileSystem, ROOT);

    expect(entries).toEqual([{ reference: 'Assets/photo.png', name: 'photo.png' }]);
  });
});
