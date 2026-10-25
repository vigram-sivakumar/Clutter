import { describe, expect, it, vi } from 'vitest';

import { PreferredTemplatesStore, clearPreferredTemplates } from './PreferredTemplatesStore';
import { flushWorkspaceStateWrites } from '../../vault/initialize/workspaceStateFile';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/space';
const FILE = `${ROOT}/.clutter/workspace.json`;

/** Everything else a Space's file holds, including the Space's own identity: none of it is a preferred template. */
const OTHER_STATE = {
  space: { version: 1, id: 'space-1', defaultCoverPosition: 'above' },
  collectionViewConfig: { 'view:notes': { layout: 'table' } },
  templateUsage: { 't-a': 1700000000000 },
};

const PREFERRED = {
  preferredTemplates: ['t-a', 't-b'],
  preferredNoteTemplates: ['t-c'],
  defaultDailyNoteTemplate: 't-a',
};

const withFile = (contents: unknown) =>
  new InMemoryVaultFileSystem({ [FILE]: typeof contents === 'string' ? contents : JSON.stringify(contents) });
const persisted = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(FILE));

describe('PreferredTemplatesStore.reset — the open Space', () => {
  it('empties both lists and clears the default daily note template', async () => {
    const store = await PreferredTemplatesStore.load(withFile({ ...OTHER_STATE, ...PREFERRED }), ROOT);
    expect(store.getIds('dailyNotes')).toEqual(['t-a', 't-b']);
    expect(store.getIds('notes')).toEqual(['t-c']);
    expect(store.getDefaultDailyNoteTemplateId()).toBe('t-a');

    await store.reset();

    expect(store.getIds('dailyNotes')).toEqual([]);
    expect(store.getIds('notes')).toEqual([]);
    expect(store.getDefaultDailyNoteTemplateId()).toBeUndefined();
  });

  it('takes the keys out of the file and leaves every other key as it was', async () => {
    const fileSystem = withFile({ ...OTHER_STATE, ...PREFERRED });
    const store = await PreferredTemplatesStore.load(fileSystem, ROOT);

    await store.reset();

    expect(await persisted(fileSystem)).toEqual(OTHER_STATE);
  });

  it('tells subscribers, so Settings and the template suggestions follow at once', async () => {
    const store = await PreferredTemplatesStore.load(withFile({ ...OTHER_STATE, ...PREFERRED }), ROOT);
    const listener = vi.fn();
    store.subscribe(listener);

    const done = store.reset();
    expect(store.getIds('notes')).toEqual([]);
    await done;

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('persists: reopening the Space after a reset finds no preferred templates', async () => {
    const fileSystem = withFile({ ...OTHER_STATE, ...PREFERRED });
    await (await PreferredTemplatesStore.load(fileSystem, ROOT)).reset();
    await flushWorkspaceStateWrites();

    const reopened = await PreferredTemplatesStore.load(fileSystem, ROOT);

    expect(reopened.getIds('dailyNotes')).toEqual([]);
    expect(reopened.getIds('notes')).toEqual([]);
    expect(reopened.getDefaultDailyNoteTemplateId()).toBeUndefined();
  });

  it('changes and writes nothing when nothing is set', async () => {
    const fileSystem = withFile(OTHER_STATE);
    const write = vi.spyOn(fileSystem, 'writeFile');
    const store = await PreferredTemplatesStore.load(fileSystem, ROOT);
    const listener = vi.fn();
    store.subscribe(listener);

    await store.reset();

    expect(write).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('puts everything back and rejects when the file cannot be written', async () => {
    const fileSystem = withFile({ ...OTHER_STATE, ...PREFERRED });
    const store = await PreferredTemplatesStore.load(fileSystem, ROOT);
    const before = await fileSystem.readFile(FILE);
    vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('disk full'));

    await expect(store.reset()).rejects.toThrow('disk full');

    expect(store.getIds('dailyNotes')).toEqual(['t-a', 't-b']);
    expect(store.getIds('notes')).toEqual(['t-c']);
    expect(store.getDefaultDailyNoteTemplateId()).toBe('t-a');
    expect(await fileSystem.readFile(FILE)).toBe(before);
  });
});

describe('clearPreferredTemplates — a Space that is not open', () => {
  it('takes the three keys out of its file and leaves the rest', async () => {
    const fileSystem = withFile({ ...OTHER_STATE, ...PREFERRED });

    expect(await clearPreferredTemplates(fileSystem, ROOT)).toBe(true);
    await flushWorkspaceStateWrites();

    expect(await persisted(fileSystem)).toEqual(OTHER_STATE);
  });

  it('clears a Space that only has a default daily note template', async () => {
    const fileSystem = withFile({ ...OTHER_STATE, defaultDailyNoteTemplate: 't-a' });

    expect(await clearPreferredTemplates(fileSystem, ROOT)).toBe(true);
    await flushWorkspaceStateWrites();

    expect(await persisted(fileSystem)).toEqual(OTHER_STATE);
  });

  it('writes nothing when none of the keys is there, and never creates .clutter in a folder without one', async () => {
    const plain = withFile(OTHER_STATE);
    const writePlain = vi.spyOn(plain, 'writeFile');
    const empty = new InMemoryVaultFileSystem();
    const writeEmpty = vi.spyOn(empty, 'writeFile');

    expect(await clearPreferredTemplates(plain, ROOT)).toBe(false);
    expect(await clearPreferredTemplates(empty, ROOT)).toBe(false);

    expect(writePlain).not.toHaveBeenCalled();
    expect(writeEmpty).not.toHaveBeenCalled();
    expect(await empty.exists(`${ROOT}/.clutter`)).toBe(false);
  });

  it('leaves a file it cannot understand exactly as it is, instead of rewriting it from an empty base', async () => {
    const fileSystem = withFile('{ not json');
    const write = vi.spyOn(fileSystem, 'writeFile');

    expect(await clearPreferredTemplates(fileSystem, ROOT)).toBe(false);

    expect(write).not.toHaveBeenCalled();
    expect(await fileSystem.readFile(FILE)).toBe('{ not json');
  });

  it('rejects when the file cannot be read', async () => {
    const fileSystem = withFile({ ...OTHER_STATE, ...PREFERRED });
    vi.spyOn(fileSystem, 'readFile').mockRejectedValue(new Error('permission denied'));

    await expect(clearPreferredTemplates(fileSystem, ROOT)).rejects.toThrow('permission denied');
  });
});
