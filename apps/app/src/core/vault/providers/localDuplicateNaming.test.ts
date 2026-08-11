import { describe, expect, it } from 'vitest';
import { resolveLocalDuplicatePath } from './localDuplicateNaming';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';

const ROOT = '/vault';

describe('resolveLocalDuplicatePath', () => {
  it('appends " copy" for a file, preserving its extension', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [`${ROOT}/Idea.md`]: '# Idea' });

    const result = await resolveLocalDuplicatePath(fileSystem, `${ROOT}/Idea.md`, 'file');

    expect(result).toBe(`${ROOT}/Idea copy.md`);
  });

  it('appends " copy" for a directory (no extension handling)', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Projects`);

    const result = await resolveLocalDuplicatePath(fileSystem, `${ROOT}/Projects`, 'directory');

    expect(result).toBe(`${ROOT}/Projects copy`);
  });

  it('increments an existing "copy" suffix instead of stacking a second one', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [`${ROOT}/Idea copy.md`]: '# Idea' });

    const result = await resolveLocalDuplicatePath(fileSystem, `${ROOT}/Idea copy.md`, 'file');

    expect(result).toBe(`${ROOT}/Idea copy 2.md`);
  });

  it('increments an existing "copy N" suffix to N+1', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [`${ROOT}/Idea copy 2.md`]: '# Idea' });

    const result = await resolveLocalDuplicatePath(fileSystem, `${ROOT}/Idea copy 2.md`, 'file');

    expect(result).toBe(`${ROOT}/Idea copy 3.md`);
  });

  it('walks past an occupied "copy" name to the next free number', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Idea.md`]: '# Idea',
      [`${ROOT}/Idea copy.md`]: '# Idea',
      [`${ROOT}/Idea copy 2.md`]: '# Idea',
    });

    const result = await resolveLocalDuplicatePath(fileSystem, `${ROOT}/Idea.md`, 'file');

    expect(result).toBe(`${ROOT}/Idea copy 3.md`);
  });

  it('simulates repeated duplication: Project -> Project copy -> Project copy 2 -> Project copy 3', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    await fileSystem.createDirectory(`${ROOT}/Project`);

    const first = await resolveLocalDuplicatePath(fileSystem, `${ROOT}/Project`, 'directory');
    expect(first).toBe(`${ROOT}/Project copy`);
    await fileSystem.createDirectory(first);

    const second = await resolveLocalDuplicatePath(fileSystem, first, 'directory');
    expect(second).toBe(`${ROOT}/Project copy 2`);
    await fileSystem.createDirectory(second);

    const third = await resolveLocalDuplicatePath(fileSystem, second, 'directory');
    expect(third).toBe(`${ROOT}/Project copy 3`);
  });
});
