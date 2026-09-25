import { describe, expect, it, vi } from 'vitest';

import { CollectionViewConfigStore } from './CollectionViewConfigStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

/** Simulates an app restart: reads whatever was persisted back into a fresh store. */
async function reload(fileSystem: InMemoryVaultFileSystem): Promise<CollectionViewConfigStore> {
  return CollectionViewConfigStore.load(fileSystem, ROOT);
}

/** Lets the store's fire-and-forget update() writes complete before assertions. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CollectionViewConfigStore — load()', () => {
  it('a vault with no workspace.json at all starts with no persisted collection view configuration', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    expect(store.get('folder:folder-1')).toBeUndefined();
  });

  it('an empty-object workspace.json (the reserved-resource seed content) starts with no persisted configuration', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: '{}' });
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    expect(store.get('folder:folder-1')).toBeUndefined();
  });

  it('malformed JSON is caught and discarded — the app still boots with no configuration, never throws', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: 'not valid json{{{',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    expect(store.get('folder:folder-1')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a "collectionViewConfig" entry with the wrong shape is discarded per-entry — one corrupt entry does not invalidate the whole file', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        collectionViewConfig: {
          'folder:good': { layout: 'list' },
          'folder:bad-not-object': 'oops',
          'folder:bad-empty': {},
          'folder:bad-layout': { layout: 'card' },
          'folder:bad-properties-not-boolean': {
            properties: { description: true, lastOpened: true, created: true, updated: 'yes' },
          },
          'folder:bad-sort-key': { sort: { key: 'nonsense', direction: 'down' } },
          'folder:bad-sort-direction': { sort: { key: 'name', direction: 'sideways' } },
        },
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    expect(store.get('folder:good')).toEqual({ layout: 'list' });
    expect(store.get('folder:bad-not-object')).toBeUndefined();
    expect(store.get('folder:bad-empty')).toBeUndefined();
    expect(store.get('folder:bad-layout')).toBeUndefined();
    expect(store.get('folder:bad-properties-not-boolean')).toBeUndefined();
    expect(store.get('folder:bad-sort-key')).toBeUndefined();
    expect(store.get('folder:bad-sort-direction')).toBeUndefined();
    warn.mockRestore();
  });

  it('an entry with some valid fields and one malformed field keeps the valid fields, drops only the malformed one', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        collectionViewConfig: {
          'folder:mixed': {
            layout: 'list',
            sort: { key: 'nonsense', direction: 'down' },
          },
        },
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    expect(store.get('folder:mixed')).toEqual({ layout: 'list' });
    warn.mockRestore();
  });

  it('preserves unrecognized top-level keys (e.g. foldState) across a load -> update -> persist round trip', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        foldState: { 'page-1': { doc: 'hello', fold: [1, 2] } },
      }),
    });

    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);
    store.update('folder:folder-1', { layout: 'list' });
    await flushMicrotasks();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
    expect(written.foldState).toEqual({ 'page-1': { doc: 'hello', fold: [1, 2] } });
    expect(written.collectionViewConfig['folder:folder-1']).toEqual({ layout: 'list' });
  });
});

describe('CollectionViewConfigStore — update()/get() and per-collection scoping', () => {
  it('update() then get() within the same session returns the merged entry', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    store.update('folder:folder-1', { layout: 'list' });

    expect(store.get('folder:folder-1')).toEqual({ layout: 'list' });
  });

  it('update() merges into an existing entry field-by-field, rather than replacing it', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    store.update('folder:folder-1', { layout: 'list' });
    store.update('folder:folder-1', { sort: { key: 'updated', direction: 'up' } });

    expect(store.get('folder:folder-1')).toEqual({
      layout: 'list',
      sort: { key: 'updated', direction: 'up' },
    });
  });

  it('a missing collection returns undefined — caller resolves defaults, not this store', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    expect(store.get('folder:never-configured')).toBeUndefined();
  });

  it('configuration is scoped independently per collection — two different folders never share an entry', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    store.update('folder:projects', { layout: 'table' });
    store.update('folder:work', { layout: 'list' });

    expect(store.get('folder:projects')).toEqual({ layout: 'table' });
    expect(store.get('folder:work')).toEqual({ layout: 'list' });
  });

  it('folder, workspace, favorites, archive, and tag identities coexist without collision', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    store.update('folder:Archive', { layout: 'table' });
    store.update('view:workspace', { layout: 'list' });
    store.update('view:favorites', { layout: 'table' });
    store.update('tag:project', { layout: 'list' });

    expect(store.get('folder:Archive')).toEqual({ layout: 'table' });
    expect(store.get('view:workspace')).toEqual({ layout: 'list' });
    expect(store.get('view:favorites')).toEqual({ layout: 'table' });
    expect(store.get('tag:project')).toEqual({ layout: 'list' });
  });

  it('set()/update() persists correctly and survives a simulated app restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await CollectionViewConfigStore.load(fileSystem, ROOT);

    beforeRestart.update('folder:projects', {
      layout: 'table',
      properties: { description: true, lastOpened: false, created: false, updated: true },
      sort: { key: 'updated', direction: 'down' },
    });
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);

    expect(afterRestart.get('folder:projects')).toEqual({
      layout: 'table',
      properties: { description: true, lastOpened: false, created: false, updated: true },
      sort: { key: 'updated', direction: 'down' },
    });
  });
});

describe('CollectionViewConfigStore — renameKey()', () => {
  it('moves an existing entry from the old key to the new key', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    store.update('tag:Project', { layout: 'list' });
    store.renameKey('tag:Project', 'tag:project');

    expect(store.get('tag:Project')).toBeUndefined();
    expect(store.get('tag:project')).toEqual({ layout: 'list' });
  });

  it('renaming a tag with no persisted configuration is a safe no-op', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    expect(() => store.renameKey('tag:never-configured', 'tag:renamed')).not.toThrow();
    expect(store.get('tag:renamed')).toBeUndefined();
  });

  it('renaming to the same key is a no-op (no persist, entry untouched)', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    store.update('tag:project', { layout: 'list' });
    store.renameKey('tag:project', 'tag:project');

    expect(store.get('tag:project')).toEqual({ layout: 'list' });
  });

  it('the moved entry survives a simulated app restart under its new key', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await CollectionViewConfigStore.load(fileSystem, ROOT);

    beforeRestart.update('tag:Project', { layout: 'list' });
    await flushMicrotasks();
    beforeRestart.renameKey('tag:Project', 'tag:project');
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);
    expect(afterRestart.get('tag:Project')).toBeUndefined();
    expect(afterRestart.get('tag:project')).toEqual({ layout: 'list' });
  });

  it('is deterministic: renaming the same key twice in a row lands on the final key with the original config, never losing or duplicating data', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    store.update('tag:a', { layout: 'list' });
    store.renameKey('tag:a', 'tag:b');
    store.renameKey('tag:b', 'tag:c');

    expect(store.get('tag:a')).toBeUndefined();
    expect(store.get('tag:b')).toBeUndefined();
    expect(store.get('tag:c')).toEqual({ layout: 'list' });
  });

  it('never overwrites an existing entry already present at the new key', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    store.update('tag:old', { layout: 'list' });
    store.update('tag:new', { layout: 'table' });
    store.renameKey('tag:old', 'tag:new');

    expect(store.get('tag:new')).toEqual({ layout: 'table' });
    expect(store.get('tag:old')).toBeUndefined();
  });
});

describe('CollectionViewConfigStore — multi-writer coexistence with FoldStateStore', () => {
  it('an update() write never clobbers a sibling "foldState"/"embedCollapse" key written after this store loaded', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);

    // Simulates FoldStateStore writing *after* CollectionViewConfigStore's
    // own boot-time load(), the way two independent, same-session stores
    // sharing one file actually interleave in the real app.
    await fileSystem.writeFile(
      WORKSPACE_PATH,
      JSON.stringify({ foldState: { 'page-1': { doc: 'hello', fold: [1, 2] } } })
    );

    store.update('folder:folder-1', { layout: 'list' });
    await flushMicrotasks();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
    expect(written.foldState).toEqual({ 'page-1': { doc: 'hello', fold: [1, 2] } });
    expect(written.collectionViewConfig['folder:folder-1']).toEqual({ layout: 'list' });
  });
});
