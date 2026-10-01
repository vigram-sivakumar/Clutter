import { describe, expect, it, vi } from 'vitest';

import { TagExpansionStore } from './TagExpansionStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

/** Simulates an app restart: reads whatever was persisted back into a fresh store. */
async function reload(fileSystem: InMemoryVaultFileSystem): Promise<TagExpansionStore> {
  return TagExpansionStore.load(fileSystem, ROOT);
}

/** Lets the store's fire-and-forget toggleExpanded() writes complete before assertions. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TagExpansionStore — load()', () => {
  it('a vault with no workspace.json at all starts with every tag collapsed', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TagExpansionStore.load(fileSystem, ROOT);

    expect(store.isExpanded('design')).toBe(false);
  });

  it('an empty-object workspace.json (the reserved-resource seed content) starts with every tag collapsed', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: '{}' });
    const store = await TagExpansionStore.load(fileSystem, ROOT);

    expect(store.isExpanded('design')).toBe(false);
  });

  it('malformed JSON is caught and discarded — the app still boots with every tag collapsed, never throws', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: 'not valid json{{{',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await TagExpansionStore.load(fileSystem, ROOT);

    expect(store.isExpanded('design')).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reads a persisted set of expanded tag names', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({ tagExpansion: ['design', 'project'] }),
    });

    const store = await TagExpansionStore.load(fileSystem, ROOT);

    expect(store.isExpanded('design')).toBe(true);
    expect(store.isExpanded('project')).toBe(true);
    expect(store.isExpanded('marketing')).toBe(false);
  });

  it('a malformed "tagExpansion" shape is discarded entirely, logging a warning', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({ tagExpansion: { design: true } }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await TagExpansionStore.load(fileSystem, ROOT);

    expect(store.isExpanded('design')).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('preserves unrecognized top-level keys (e.g. foldState) across a load -> toggle -> persist round trip', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        foldState: { 'page-1': { doc: 'hello', fold: [1, 2] } },
      }),
    });

    const store = await TagExpansionStore.load(fileSystem, ROOT);
    store.toggleExpanded('design');
    await flushMicrotasks();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
    expect(written.foldState).toEqual({ 'page-1': { doc: 'hello', fold: [1, 2] } });
    expect(written.tagExpansion).toEqual(['design']);
  });
});

describe('TagExpansionStore — toggleExpanded()/isExpanded()', () => {
  it('a newly encountered tag with no stored state starts collapsed', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TagExpansionStore.load(fileSystem, ROOT);

    expect(store.isExpanded('never-seen')).toBe(false);
  });

  it('toggling an unexpanded tag expands it', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TagExpansionStore.load(fileSystem, ROOT);

    store.toggleExpanded('design');

    expect(store.isExpanded('design')).toBe(true);
  });

  it('toggling an expanded tag collapses it', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TagExpansionStore.load(fileSystem, ROOT);

    store.toggleExpanded('design');
    store.toggleExpanded('design');

    expect(store.isExpanded('design')).toBe(false);
  });

  it('each tag toggles independently — expanding one never affects another', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TagExpansionStore.load(fileSystem, ROOT);

    store.toggleExpanded('design');

    expect(store.isExpanded('design')).toBe(true);
    expect(store.isExpanded('project')).toBe(false);
  });

  it('notifies subscribers on toggle', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TagExpansionStore.load(fileSystem, ROOT);
    const listener = vi.fn();
    store.subscribe(listener);

    store.toggleExpanded('design');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('an unsubscribed listener is no longer notified', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TagExpansionStore.load(fileSystem, ROOT);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.toggleExpanded('design');

    expect(listener).not.toHaveBeenCalled();
  });

  it('persists correctly and survives a simulated app restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await TagExpansionStore.load(fileSystem, ROOT);

    beforeRestart.toggleExpanded('design');
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);

    expect(afterRestart.isExpanded('design')).toBe(true);
  });

  it('a collapsed tag (explicitly toggled back off) stays collapsed across a simulated app restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await TagExpansionStore.load(fileSystem, ROOT);

    beforeRestart.toggleExpanded('design');
    beforeRestart.toggleExpanded('design');
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);

    expect(afterRestart.isExpanded('design')).toBe(false);
  });

  it('multiple expanded tags each retain their own state across a simulated app restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await TagExpansionStore.load(fileSystem, ROOT);

    beforeRestart.toggleExpanded('design');
    beforeRestart.toggleExpanded('project');
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);

    expect(afterRestart.isExpanded('design')).toBe(true);
    expect(afterRestart.isExpanded('project')).toBe(true);
    expect(afterRestart.isExpanded('marketing')).toBe(false);
  });
});

describe('TagExpansionStore — multi-writer coexistence with FoldStateStore', () => {
  it('a toggleExpanded() write never clobbers a sibling "foldState" key written after this store loaded', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await TagExpansionStore.load(fileSystem, ROOT);

    // Simulates FoldStateStore writing *after* TagExpansionStore's own
    // boot-time load(), the way two independent, same-session stores
    // sharing one file actually interleave in the real app.
    await fileSystem.writeFile(
      WORKSPACE_PATH,
      JSON.stringify({ foldState: { 'page-1': { doc: 'hello', fold: [1, 2] } } })
    );

    store.toggleExpanded('design');
    await flushMicrotasks();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
    expect(written.foldState).toEqual({ 'page-1': { doc: 'hello', fold: [1, 2] } });
    expect(written.tagExpansion).toEqual(['design']);
  });
});
