import { describe, expect, it } from 'vitest';
import { ensureClutterDirectory } from './ensureClutterDirectory';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';

const ROOT = '/vault';

describe('ensureClutterDirectory', () => {
  it('creates .clutter when missing', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    await ensureClutterDirectory(fileSystem, ROOT);

    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(true);
  });

  it('is a no-op when .clutter already exists', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(`${ROOT}/.clutter/tags.json`, '{"tags":{}}');

    await ensureClutterDirectory(fileSystem, ROOT);

    // Untouched — no re-creation, no overwrite of existing content.
    expect(await fileSystem.exists(`${ROOT}/.clutter/tags.json`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(true);
  });

  it('is safe to call repeatedly (idempotent)', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    await ensureClutterDirectory(fileSystem, ROOT);
    await ensureClutterDirectory(fileSystem, ROOT);
    await ensureClutterDirectory(fileSystem, ROOT);

    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(true);
  });
});
