import { describe, expect, it } from 'vitest';
import { VaultEntryDuplicator } from './VaultEntryDuplicator';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import type { VaultFileSystem } from '../providers/VaultFileSystem';

const ROOT = '/vault';

describe('VaultEntryDuplicator.duplicateFile', () => {
  it('lets the provider choose the destination path and copies contents verbatim there', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Idea.md`]: '---\nid: page-1\n---\nHello',
    });
    const duplicator = new VaultEntryDuplicator(fileSystem);

    const destinationPath = await duplicator.duplicateFile(`${ROOT}/Idea.md`);

    expect(destinationPath).toBe(`${ROOT}/Idea copy.md`);
    expect(await fileSystem.readFile(destinationPath)).toBe('---\nid: page-1\n---\nHello');
    // The source is untouched.
    expect(await fileSystem.readFile(`${ROOT}/Idea.md`)).toBe('---\nid: page-1\n---\nHello');
  });

  it('never computes or inspects a name itself — it forwards to fileSystem.duplicate() and returns whatever comes back', async () => {
    let calledWith: [string, 'file' | 'directory'] | undefined;
    const fileSystem: VaultFileSystem = {
      exists: async () => false,
      createDirectory: async () => {},
      readDirectory: async () => [],
      readFile: async () => '',
      writeFile: async () => {},
      deleteFile: async () => {},
      moveFile: async () => {},
      copyFile: async () => {},
      duplicate: async (sourcePath, kind) => {
        calledWith = [sourcePath, kind];
        return '/provider-chosen/Arbitrary Name.md';
      },
    };
    const duplicator = new VaultEntryDuplicator(fileSystem);

    const destinationPath = await duplicator.duplicateFile(`${ROOT}/Idea.md`);

    expect(calledWith).toEqual([`${ROOT}/Idea.md`, 'file']);
    expect(destinationPath).toBe('/provider-chosen/Arbitrary Name.md');
  });

  it('throws a clear error when the underlying VaultFileSystem does not implement duplicate()', async () => {
    const fileSystem: VaultFileSystem = {
      exists: async () => false,
      createDirectory: async () => {},
      readDirectory: async () => [],
      readFile: async () => '',
      writeFile: async () => {},
      deleteFile: async () => {},
      moveFile: async () => {},
      copyFile: async () => {},
    };
    const duplicator = new VaultEntryDuplicator(fileSystem);

    await expect(duplicator.duplicateFile(`${ROOT}/Idea.md`)).rejects.toThrow(
      /does not implement duplicate/
    );
  });
});

describe('VaultEntryDuplicator.duplicateDirectory', () => {
  it('lets the provider choose the destination directory name and copies files into it', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Projects/Idea.md`]: '---\nid: page-1\n---\nHello',
    });
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    const destinationPath = await duplicator.duplicateDirectory(`${ROOT}/Projects`);

    expect(destinationPath).toBe(`${ROOT}/Projects copy`);
    expect(await fileSystem.exists(destinationPath)).toBe(true);
    expect(await fileSystem.readFile(`${destinationPath}/Idea.md`)).toBe(
      '---\nid: page-1\n---\nHello'
    );
    // The source subtree is untouched.
    expect(await fileSystem.readFile(`${ROOT}/Projects/Idea.md`)).toBe(
      '---\nid: page-1\n---\nHello'
    );
  });

  it('copies nested subfolders recursively without asking the provider to name them', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Projects/Q1/Note.md`]: '---\nid: page-1\n---\nBody',
    });
    await fileSystem.createDirectory(`${ROOT}/Projects/Q1`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    const destinationPath = await duplicator.duplicateDirectory(`${ROOT}/Projects`);

    expect(await fileSystem.exists(`${destinationPath}/Q1`)).toBe(true);
    expect(await fileSystem.readFile(`${destinationPath}/Q1/Note.md`)).toBe(
      '---\nid: page-1\n---\nBody'
    );
  });

  it('does not manufacture a .folder.md that does not exist on the source', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Projects/Idea.md`]: '---\nid: page-1\n---\nHello',
    });
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    const destinationPath = await duplicator.duplicateDirectory(`${ROOT}/Projects`);

    expect(await fileSystem.exists(`${destinationPath}/.folder.md`)).toBe(false);
  });

  it('copies an existing .folder.md verbatim', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Projects/.folder.md`]: '---\nid: folder-1\n---\n',
    });
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    const destinationPath = await duplicator.duplicateDirectory(`${ROOT}/Projects`);

    expect(await fileSystem.readFile(`${destinationPath}/.folder.md`)).toBe(
      '---\nid: folder-1\n---\n'
    );
  });

  it('repeated duplication increments the "copy" suffix instead of stacking it', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Project`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    const first = await duplicator.duplicateDirectory(`${ROOT}/Project`);
    expect(first).toBe(`${ROOT}/Project copy`);

    const second = await duplicator.duplicateDirectory(first);
    expect(second).toBe(`${ROOT}/Project copy 2`);

    const third = await duplicator.duplicateDirectory(second);
    expect(third).toBe(`${ROOT}/Project copy 3`);
  });
});
