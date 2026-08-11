import { describe, expect, it } from 'vitest';
import { VaultEntryDuplicator } from './VaultEntryDuplicator';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';

const ROOT = '/vault';

describe('VaultEntryDuplicator.duplicateFile', () => {
  it('copies file contents verbatim to the destination path', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Idea.md`]: '---\nid: page-1\n---\nHello',
    });
    const duplicator = new VaultEntryDuplicator(fileSystem);

    await duplicator.duplicateFile(`${ROOT}/Idea.md`, `${ROOT}/Idea copy.md`);

    expect(await fileSystem.readFile(`${ROOT}/Idea copy.md`)).toBe(
      '---\nid: page-1\n---\nHello'
    );
    // The source is untouched.
    expect(await fileSystem.readFile(`${ROOT}/Idea.md`)).toBe('---\nid: page-1\n---\nHello');
  });
});

describe('VaultEntryDuplicator.duplicateDirectory', () => {
  it('copies a directory and its files to the destination', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Projects/Idea.md`]: '---\nid: page-1\n---\nHello',
    });
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    await duplicator.duplicateDirectory(`${ROOT}/Projects`, `${ROOT}/Projects copy`);

    expect(await fileSystem.exists(`${ROOT}/Projects copy`)).toBe(true);
    expect(await fileSystem.readFile(`${ROOT}/Projects copy/Idea.md`)).toBe(
      '---\nid: page-1\n---\nHello'
    );
    // The source subtree is untouched.
    expect(await fileSystem.readFile(`${ROOT}/Projects/Idea.md`)).toBe(
      '---\nid: page-1\n---\nHello'
    );
  });

  it('copies nested subfolders recursively', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Projects/Q1/Note.md`]: '---\nid: page-1\n---\nBody',
    });
    await fileSystem.createDirectory(`${ROOT}/Projects/Q1`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    await duplicator.duplicateDirectory(`${ROOT}/Projects`, `${ROOT}/Projects copy`);

    expect(await fileSystem.exists(`${ROOT}/Projects copy/Q1`)).toBe(true);
    expect(await fileSystem.readFile(`${ROOT}/Projects copy/Q1/Note.md`)).toBe(
      '---\nid: page-1\n---\nBody'
    );
  });

  it('does not manufacture a .folder.md that does not exist on the source', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Projects/Idea.md`]: '---\nid: page-1\n---\nHello',
    });
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    await duplicator.duplicateDirectory(`${ROOT}/Projects`, `${ROOT}/Projects copy`);

    expect(await fileSystem.exists(`${ROOT}/Projects copy/.folder.md`)).toBe(false);
  });

  it('copies an existing .folder.md verbatim', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Projects/.folder.md`]: '---\nid: folder-1\n---\n',
    });
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    const duplicator = new VaultEntryDuplicator(fileSystem);

    await duplicator.duplicateDirectory(`${ROOT}/Projects`, `${ROOT}/Projects copy`);

    expect(await fileSystem.readFile(`${ROOT}/Projects copy/.folder.md`)).toBe(
      '---\nid: folder-1\n---\n'
    );
  });
});
