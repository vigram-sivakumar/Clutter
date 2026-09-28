import { describe, expect, it, vi } from 'vitest';

import { TasksViewConfigStore } from './TasksViewConfigStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

/** Simulates an app restart: reads whatever was persisted back into a fresh store. */
async function reload(fileSystem: InMemoryVaultFileSystem): Promise<TasksViewConfigStore> {
  return TasksViewConfigStore.load(fileSystem, ROOT);
}

/** Lets the store's fire-and-forget update() writes complete before assertions. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TasksViewConfigStore — load()', () => {
  it('a vault with no workspace.json at all starts with no persisted configuration', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    expect(store.get()).toEqual({});
  });

  it('an empty-object workspace.json (the reserved-resource seed content) starts with no persisted configuration', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: '{}' });
    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    expect(store.get()).toEqual({});
  });

  it('malformed JSON is caught and discarded — the app still boots with no configuration, never throws', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: 'not valid json{{{',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    expect(store.get()).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reads a persisted showCompleted/autoSortCompleted entry', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        tasksViewConfig: { showCompleted: false, autoSortCompleted: true },
      }),
    });

    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    expect(store.get()).toEqual({ showCompleted: false, autoSortCompleted: true });
  });

  it('a malformed "tasksViewConfig" shape is discarded entirely, logging a warning', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        tasksViewConfig: { showCompleted: 'yes' },
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    expect(store.get()).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps the one valid field and drops only the malformed one', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        tasksViewConfig: { showCompleted: true, autoSortCompleted: 'nope' },
      }),
    });

    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    expect(store.get()).toEqual({ showCompleted: true });
  });

  it('preserves unrecognized top-level keys (e.g. foldState) across a load -> update -> persist round trip', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        foldState: { 'page-1': { doc: 'hello', fold: [1, 2] } },
      }),
    });

    const store = await TasksViewConfigStore.load(fileSystem, ROOT);
    store.update({ showCompleted: false });
    await flushMicrotasks();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
    expect(written.foldState).toEqual({ 'page-1': { doc: 'hello', fold: [1, 2] } });
    expect(written.tasksViewConfig).toEqual({ showCompleted: false });
  });
});

describe('TasksViewConfigStore — update()/get()', () => {
  it('update() then get() within the same session returns the merged entry', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    store.update({ showCompleted: false });

    expect(store.get()).toEqual({ showCompleted: false });
  });

  it('update() merges into the existing entry field-by-field, rather than replacing it', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    store.update({ showCompleted: false });
    store.update({ autoSortCompleted: true });

    expect(store.get()).toEqual({ showCompleted: false, autoSortCompleted: true });
  });

  it('turning showCompleted back on leaves a previously-set autoSortCompleted untouched', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    store.update({ showCompleted: true, autoSortCompleted: true });
    store.update({ showCompleted: false });
    store.update({ showCompleted: true });

    expect(store.get()).toEqual({ showCompleted: true, autoSortCompleted: true });
  });

  it('persists correctly and survives a simulated app restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await TasksViewConfigStore.load(fileSystem, ROOT);

    beforeRestart.update({ showCompleted: false, autoSortCompleted: true });
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);

    expect(afterRestart.get()).toEqual({ showCompleted: false, autoSortCompleted: true });
  });
});

describe('TasksViewConfigStore — multi-writer coexistence with FoldStateStore', () => {
  it('an update() write never clobbers a sibling "foldState" key written after this store loaded', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TasksViewConfigStore.load(fileSystem, ROOT);

    // Simulates FoldStateStore writing *after* TasksViewConfigStore's own
    // boot-time load(), the way two independent, same-session stores
    // sharing one file actually interleave in the real app.
    await fileSystem.writeFile(
      WORKSPACE_PATH,
      JSON.stringify({ foldState: { 'page-1': { doc: 'hello', fold: [1, 2] } } })
    );

    store.update({ showCompleted: false });
    await flushMicrotasks();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
    expect(written.foldState).toEqual({ 'page-1': { doc: 'hello', fold: [1, 2] } });
    expect(written.tasksViewConfig).toEqual({ showCompleted: false });
  });
});
