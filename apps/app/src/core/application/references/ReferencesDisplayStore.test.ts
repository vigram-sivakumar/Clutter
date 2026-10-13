import { describe, expect, it, vi } from 'vitest';

import { ReferencesDisplayStore } from './ReferencesDisplayStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

async function reload(fileSystem: InMemoryVaultFileSystem): Promise<ReferencesDisplayStore> {
  return ReferencesDisplayStore.load(fileSystem, ROOT);
}

/** Lets the store's fire-and-forget writes complete before assertions. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function persisted(fileSystem: InMemoryVaultFileSystem): Promise<Record<string, unknown>> {
  return JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
}

describe('ReferencesDisplayStore — load()', () => {
  it('a vault with no workspace.json starts with the defaults: automatic visibility, expanded', async () => {
    const store = await reload(new InMemoryVaultFileSystem());

    expect(store.getHidden('p1')).toBeUndefined();
    expect(store.isCollapsed('p1')).toBe(false);
  });

  it('the reserved seed content ({}) starts with the defaults', async () => {
    const store = await reload(new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: '{}' }));

    expect(store.getHidden('p1')).toBeUndefined();
    expect(store.isCollapsed('p1')).toBe(false);
  });

  it('malformed JSON is discarded with a warning — never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await reload(new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: 'not json{{' }));

    expect(store.getHidden('p1')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a non-object "referencesDisplay" is discarded with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await reload(
      new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: JSON.stringify({ referencesDisplay: ['p1'] }) })
    );

    expect(store.getHidden('p1')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reads saved entries, discarding only the malformed one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await reload(
      new InMemoryVaultFileSystem({
        [WORKSPACE_PATH]: JSON.stringify({
          referencesDisplay: {
            hiddenAndCollapsed: { hidden: true, collapsed: true },
            shown: { hidden: false },
            bad: { hidden: 'yes' },
            empty: {},
          },
        }),
      })
    );

    expect(store.getHidden('hiddenAndCollapsed')).toBe(true);
    expect(store.isCollapsed('hiddenAndCollapsed')).toBe(true);
    expect(store.getHidden('shown')).toBe(false);
    expect(store.isCollapsed('shown')).toBe(false);
    expect(store.getHidden('bad')).toBeUndefined();
    expect(store.getHidden('empty')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('ReferencesDisplayStore — preferences', () => {
  it('visibility and expansion are independent: hiding then showing restores the saved collapse', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    store.setCollapsed('p1', true);
    store.setHidden('p1', true);
    store.setHidden('p1', false);

    expect(store.isCollapsed('p1')).toBe(true);
    expect(store.getHidden('p1')).toBe(false);
  });

  it('expanding does not touch visibility', async () => {
    const store = await reload(new InMemoryVaultFileSystem());

    store.setHidden('p1', true);
    store.setCollapsed('p1', true);
    store.setCollapsed('p1', false);

    expect(store.getHidden('p1')).toBe(true);
    expect(store.isCollapsed('p1')).toBe(false);
  });

  it('preferences are per page', async () => {
    const store = await reload(new InMemoryVaultFileSystem());

    store.setHidden('p1', true);
    store.setCollapsed('p1', true);

    expect(store.getHidden('p2')).toBeUndefined();
    expect(store.isCollapsed('p2')).toBe(false);
  });

  it('stores only non-default values and survives a restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    store.setCollapsed('p1', true);
    store.setHidden('p2', false);
    await flush();

    expect(await persisted(fileSystem)).toEqual({
      referencesDisplay: { p1: { collapsed: true }, p2: { hidden: false } },
    });

    const restarted = await reload(fileSystem);
    expect(restarted.isCollapsed('p1')).toBe(true);
    expect(restarted.getHidden('p1')).toBeUndefined();
    expect(restarted.getHidden('p2')).toBe(false);
  });

  it('an entry returned to the defaults is removed from the file', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    store.setCollapsed('p1', true);
    store.setCollapsed('p1', false);
    await flush();

    expect(await persisted(fileSystem)).toEqual({ referencesDisplay: {} });
  });

  it('a no-op change does not notify or write', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    const listener = vi.fn();
    store.subscribe(listener);

    store.setCollapsed('p1', false);

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies subscribers until they unsubscribe', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setHidden('p1', true);
    unsubscribe();
    store.setHidden('p1', false);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clear() forgets a page and removes it from the file', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    store.setHidden('p1', true);
    store.clear('p1');
    await flush();

    expect(store.getHidden('p1')).toBeUndefined();
    expect(await persisted(fileSystem)).toEqual({ referencesDisplay: {} });
  });

  it('writing preserves the sibling keys other stores own', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({ tagExpansion: ['design'] }),
    });
    const store = await reload(fileSystem);

    store.setHidden('p1', true);
    await flush();

    expect(await persisted(fileSystem)).toEqual({
      tagExpansion: ['design'],
      referencesDisplay: { p1: { hidden: true } },
    });
  });
});
