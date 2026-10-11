import { describe, expect, it, vi } from 'vitest';

import { TemplateUsageStore } from './TemplateUsageStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

/** Simulates an app restart: reads whatever was persisted back into a fresh store. */
const reload = (fileSystem: InMemoryVaultFileSystem) => TemplateUsageStore.load(fileSystem, ROOT);

/** Lets the store's fire-and-forget recordUse() writes complete before assertions. */
const flushWrites = () => new Promise((resolve) => setTimeout(resolve, 0));

const persisted = async (fileSystem: InMemoryVaultFileSystem) =>
  JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));

describe('TemplateUsageStore — load()', () => {
  it('a vault with no workspace.json starts with no usage', async () => {
    const store = await reload(new InMemoryVaultFileSystem());

    expect(store.lastUsedAt('meeting-notes-id')).toBeUndefined();
  });

  it('a workspace.json without a "templateUsage" key starts with no usage', async () => {
    const store = await reload(
      new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: JSON.stringify({ foldState: {} }) })
    );

    expect(store.lastUsedAt('meeting-notes-id')).toBeUndefined();
  });

  it('reads persisted usage, keyed by template page id', async () => {
    const store = await reload(
      new InMemoryVaultFileSystem({
        [WORKSPACE_PATH]: JSON.stringify({
          templateUsage: {
            'meeting-notes-id': { lastUsedAt: 1791626400000 },
            'weekly-review-id': { lastUsedAt: 1791540000000 },
          },
        }),
      })
    );

    expect(store.lastUsedAt('meeting-notes-id')).toBe(1791626400000);
    expect(store.lastUsedAt('weekly-review-id')).toBe(1791540000000);
    expect(store.lastUsedAt('never-used-id')).toBeUndefined();
  });

  it('invalid JSON is caught and discarded: the app still boots, with no usage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await reload(new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: 'not json{{{' }));

    expect(store.lastUsedAt('meeting-notes-id')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([
    ['an array', []],
    ['a string', 'recent'],
    ['null', null],
  ])('a "templateUsage" that is %s is discarded whole, with a warning', async (_label, value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await reload(
      new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: JSON.stringify({ templateUsage: value }) })
    );

    expect(store.lastUsedAt('meeting-notes-id')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a malformed record is dropped without affecting its neighbours', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await reload(
      new InMemoryVaultFileSystem({
        [WORKSPACE_PATH]: JSON.stringify({
          templateUsage: {
            good: { lastUsedAt: 1791626400000 },
            'not-a-number': { lastUsedAt: '1791626400000' },
            'no-field': {},
            'not-an-object': 7,
            'null-record': null,
          },
        }),
      })
    );

    expect(store.lastUsedAt('good')).toBe(1791626400000);
    expect(store.lastUsedAt('not-a-number')).toBeUndefined();
    expect(store.lastUsedAt('no-field')).toBeUndefined();
    expect(store.lastUsedAt('not-an-object')).toBeUndefined();
    expect(store.lastUsedAt('null-record')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });
});

describe('TemplateUsageStore — recordUse()', () => {
  it('stores only lastUsedAt, as the given Date.now() milliseconds, under the template id', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    store.recordUse('meeting-notes-id', 1791626400000);
    await flushWrites();

    expect(await persisted(fileSystem)).toEqual({
      templateUsage: { 'meeting-notes-id': { lastUsedAt: 1791626400000 } },
    });
  });

  it('uses Date.now() when no time is given', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1791626400000);

    store.recordUse('meeting-notes-id');
    await flushWrites();

    expect(store.lastUsedAt('meeting-notes-id')).toBe(1791626400000);
    now.mockRestore();
  });

  it('survives an app restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const first = await reload(fileSystem);
    first.recordUse('meeting-notes-id', 1791626400000);
    first.recordUse('weekly-review-id', 1791630000000);
    await flushWrites();

    const second = await reload(fileSystem);

    expect(second.lastUsedAt('meeting-notes-id')).toBe(1791626400000);
    expect(second.lastUsedAt('weekly-review-id')).toBe(1791630000000);
  });

  it('a later use replaces the earlier time: one record per template, no history', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    store.recordUse('meeting-notes-id', 1000);
    store.recordUse('meeting-notes-id', 2000);
    await flushWrites();

    expect(store.lastUsedAt('meeting-notes-id')).toBe(2000);
    expect((await persisted(fileSystem)).templateUsage).toEqual({
      'meeting-notes-id': { lastUsedAt: 2000 },
    });
  });

  it("preserves every other top-level key of workspace.json (a sibling store's data)", async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        foldState: { page: { doc: 'x', fold: [1, 2] } },
        tagExpansion: ['design'],
        collectionViewConfig: { k: { layout: 'table' } },
      }),
    });
    const store = await reload(fileSystem);

    store.recordUse('meeting-notes-id', 1791626400000);
    await flushWrites();

    expect(await persisted(fileSystem)).toEqual({
      foldState: { page: { doc: 'x', fold: [1, 2] } },
      tagExpansion: ['design'],
      collectionViewConfig: { k: { layout: 'table' } },
      templateUsage: { 'meeting-notes-id': { lastUsedAt: 1791626400000 } },
    });
  });

  it('a record for one template does not disturb the records already loaded for others', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({ templateUsage: { a: { lastUsedAt: 1 } } }),
    });
    const store = await reload(fileSystem);

    store.recordUse('b', 2);
    await flushWrites();

    expect((await persisted(fileSystem)).templateUsage).toEqual({
      a: { lastUsedAt: 1 },
      b: { lastUsedAt: 2 },
    });
  });
});
