import { describe, expect, it, vi } from 'vitest';

import { FoldStateStore } from './FoldStateStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

/** Simulates an app restart: reads whatever was persisted back into a fresh store. */
async function reload(fileSystem: InMemoryVaultFileSystem): Promise<FoldStateStore> {
  return FoldStateStore.load(fileSystem, ROOT);
}

describe('FoldStateStore — load()', () => {
  it('a vault with no workspace.json at all starts with empty fold state (no note has any persisted folds)', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    expect(store.get('page-1')).toBeUndefined();
  });

  it('an empty-object workspace.json (the reserved-resource seed content) starts with empty fold state', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: '{}' });
    const store = await FoldStateStore.load(fileSystem, ROOT);

    expect(store.get('page-1')).toBeUndefined();
  });

  it('malformed JSON is caught and discarded — the app still boots with empty fold state, never throws', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: 'not valid json{{{',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await FoldStateStore.load(fileSystem, ROOT);

    expect(store.get('page-1')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a "foldState" entry with the wrong shape (not an object, missing doc/fold, odd-length fold) is discarded per-entry — one corrupt entry does not invalidate the whole file', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        foldState: {
          'good-page': { doc: 'hello', fold: [1, 2] },
          'bad-page-not-object': 'oops',
          'bad-page-missing-fold': { doc: 'hello' },
          'bad-page-odd-length': { doc: 'hello', fold: [1, 2, 3] },
          'bad-page-non-number': { doc: 'hello', fold: [1, 'two'] },
        },
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await FoldStateStore.load(fileSystem, ROOT);

    expect(store.get('good-page')).toEqual({ doc: 'hello', fold: [1, 2] });
    expect(store.get('bad-page-not-object')).toBeUndefined();
    expect(store.get('bad-page-missing-fold')).toBeUndefined();
    expect(store.get('bad-page-odd-length')).toBeUndefined();
    expect(store.get('bad-page-non-number')).toBeUndefined();
    warn.mockRestore();
  });

  it('preserves unrecognized top-level keys across a load -> persist round trip, so a future sibling feature writing the same file is never silently clobbered', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({ someFutureFeature: { tabs: ['a', 'b'] } }),
    });

    const store = await FoldStateStore.load(fileSystem, ROOT);
    store.set('page-1', { doc: 'hello', fold: [0, 5] });
    await flushMicrotasks();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
    expect(written.someFutureFeature).toEqual({ tabs: ['a', 'b'] });
    expect(written.foldState['page-1']).toEqual({ doc: 'hello', fold: [0, 5] });
  });
});

describe('FoldStateStore — set()/get()/clear() and cross-restart persistence', () => {
  it('set() then get() within the same session returns the just-set entry', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    store.set('page-1', { doc: 'Hello', fold: [6, 11] });

    expect(store.get('page-1')).toEqual({ doc: 'Hello', fold: [6, 11] });
  });

  it('fold state survives a simulated app restart: set() on one store, reload() into a fresh one, the entry is still there', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await FoldStateStore.load(fileSystem, ROOT);

    beforeRestart.set('page-1', { doc: '# Section A\ncontent', fold: [0, 11] });
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);

    expect(afterRestart.get('page-1')).toEqual({ doc: '# Section A\ncontent', fold: [0, 11] });
  });

  it('multiple folded regions for the same page persist and restore together', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await FoldStateStore.load(fileSystem, ROOT);

    beforeRestart.set('page-1', { doc: 'doc text', fold: [0, 5, 10, 15, 20, 25] });
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);

    expect(afterRestart.get('page-1')?.fold).toEqual([0, 5, 10, 15, 20, 25]);
  });

  it('different notes maintain independent persisted fold state', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await FoldStateStore.load(fileSystem, ROOT);

    beforeRestart.set('page-1', { doc: 'doc A', fold: [0, 3] });
    beforeRestart.set('page-2', { doc: 'doc B', fold: [1, 4] });
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);

    expect(afterRestart.get('page-1')).toEqual({ doc: 'doc A', fold: [0, 3] });
    expect(afterRestart.get('page-2')).toEqual({ doc: 'doc B', fold: [1, 4] });
  });

  it('a note that was never folded has no persisted entry — starts unfolded on the next open, exactly like a fresh vault', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    store.set('page-1', { doc: 'doc A', fold: [0, 3] });
    await flushMicrotasks();

    expect(store.get('page-never-folded')).toBeUndefined();
  });

  it('clear() removes a page\'s persisted entry and that removal survives a reload', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    store.set('page-1', { doc: 'doc A', fold: [0, 3] });
    await flushMicrotasks();
    store.clear('page-1');
    await flushMicrotasks();

    expect(store.get('page-1')).toBeUndefined();

    const afterRestart = await reload(fileSystem);
    expect(afterRestart.get('page-1')).toBeUndefined();
  });
});

/**
 * ADR-033's second amendment — the outer "collapse this whole embedded
 * note card" flag (`ImageUiState.collapsed`, a different mechanism from
 * CM6 `foldState`), keyed `hostPageId -> embeddedPageId -> collapsed`, in
 * a second map independent of `entries`/`get`/`set` above.
 */
describe('FoldStateStore — embedCollapse (getEmbedCollapse/setEmbedCollapse)', () => {
  it('setEmbedCollapse() then getEmbedCollapse() within the same session returns the just-set flag', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    store.setEmbedCollapse('host-page', 'embedded-page', true);

    expect(store.getEmbedCollapse('host-page', 'embedded-page')).toBe(true);
  });

  it('an embed never toggled has no persisted entry — undefined, the ordinary "expanded" default', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    expect(store.getEmbedCollapse('host-page', 'never-toggled')).toBeUndefined();
  });

  it('survives a simulated app restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const beforeRestart = await FoldStateStore.load(fileSystem, ROOT);

    beforeRestart.setEmbedCollapse('host-page', 'embedded-page', true);
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);
    expect(afterRestart.getEmbedCollapse('host-page', 'embedded-page')).toBe(true);
  });

  it('different host pages maintain independent collapse state for the same embedded page', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    store.setEmbedCollapse('host-a', 'embedded-page', true);
    store.setEmbedCollapse('host-b', 'embedded-page', false);
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);
    expect(afterRestart.getEmbedCollapse('host-a', 'embedded-page')).toBe(true);
    expect(afterRestart.getEmbedCollapse('host-b', 'embedded-page')).toBe(false);
  });

  it('a host embedding two different pages tracks each independently', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    store.setEmbedCollapse('host-page', 'embedded-a', true);
    store.setEmbedCollapse('host-page', 'embedded-b', false);
    await flushMicrotasks();

    const afterRestart = await reload(fileSystem);
    expect(afterRestart.getEmbedCollapse('host-page', 'embedded-a')).toBe(true);
    expect(afterRestart.getEmbedCollapse('host-page', 'embedded-b')).toBe(false);
  });

  it('writing embedCollapse for a page never disturbs that same page\'s own top-level fold entry, and vice versa — independent maps, no clobbering regardless of write order', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    // Top-level fold written first, embed-collapse written after — the
    // shape MarkdownEditor.tsx's cleanup (writes first) then
    // NoteEmbedWidget.destroy()'s cascade (writes after, per ADR-033's
    // first amendment) actually produces for a host page that hosts an
    // embed.
    store.set('host-page', { doc: 'host doc', fold: [0, 3] });
    store.setEmbedCollapse('host-page', 'embedded-page', true);
    await flushMicrotasks();

    let afterRestart = await reload(fileSystem);
    expect(afterRestart.get('host-page')).toEqual({ doc: 'host doc', fold: [0, 3] });
    expect(afterRestart.getEmbedCollapse('host-page', 'embedded-page')).toBe(true);

    // Reverse order — embed-collapse written first, top-level fold after —
    // must be equally non-destructive.
    afterRestart.setEmbedCollapse('host-page', 'embedded-page', false);
    afterRestart.set('host-page', { doc: 'host doc v2', fold: [1, 4] });
    await flushMicrotasks();

    const finalStore = await reload(fileSystem);
    expect(finalStore.get('host-page')).toEqual({ doc: 'host doc v2', fold: [1, 4] });
    expect(finalStore.getEmbedCollapse('host-page', 'embedded-page')).toBe(false);
  });

  it('persists embedCollapse under a sibling top-level JSON key ("embedCollapse"), never folded into "foldState"', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    store.set('host-page', { doc: 'host doc', fold: [0, 3] });
    store.setEmbedCollapse('host-page', 'embedded-page', true);
    await flushMicrotasks();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
    expect(written.foldState['host-page']).toEqual({ doc: 'host doc', fold: [0, 3] });
    expect(written.foldState['host-page'].embedCollapse).toBeUndefined();
    expect(written.embedCollapse['host-page']).toEqual({ 'embedded-page': true });
  });

  it('a malformed "embedCollapse" top-level value is discarded without throwing or affecting "foldState"', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        foldState: { 'good-page': { doc: 'hello', fold: [1, 2] } },
        embedCollapse: 'not an object',
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await FoldStateStore.load(fileSystem, ROOT);

    expect(store.get('good-page')).toEqual({ doc: 'hello', fold: [1, 2] });
    expect(store.getEmbedCollapse('any-host', 'any-embed')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a malformed per-host embedCollapse entry (not an object) is discarded per-host, without affecting a sibling host\'s valid entry', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        embedCollapse: {
          'good-host': { 'embedded-page': true },
          'bad-host': 'oops',
        },
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = await FoldStateStore.load(fileSystem, ROOT);

    expect(store.getEmbedCollapse('good-host', 'embedded-page')).toBe(true);
    expect(store.getEmbedCollapse('bad-host', 'embedded-page')).toBeUndefined();
    warn.mockRestore();
  });

  it('a non-boolean value for a specific embedded page is discarded, leaving sibling entries under the same host intact', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [WORKSPACE_PATH]: JSON.stringify({
        embedCollapse: {
          'host-page': { 'good-embed': true, 'bad-embed': 'yes' },
        },
      }),
    });

    const store = await FoldStateStore.load(fileSystem, ROOT);

    expect(store.getEmbedCollapse('host-page', 'good-embed')).toBe(true);
    expect(store.getEmbedCollapse('host-page', 'bad-embed')).toBeUndefined();
  });

  it("clear()'ing a page drops its own embedCollapse entries (the embeds it hosts) but leaves its own top-level fold entry logic untouched (already covered) — and does not attempt to scrub it from other hosts' maps", async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await FoldStateStore.load(fileSystem, ROOT);

    store.setEmbedCollapse('host-page', 'embedded-a', true);
    store.setEmbedCollapse('other-host', 'host-page', true); // 'host-page' also embedded elsewhere
    await flushMicrotasks();

    store.clear('host-page');
    await flushMicrotasks();

    expect(store.getEmbedCollapse('host-page', 'embedded-a')).toBeUndefined();
    // Accepted staleness, per this class's own `clear()` doc comment — an
    // orphaned entry for a since-deleted page, embedded elsewhere, is left
    // in place rather than cross-scanned away.
    expect(store.getEmbedCollapse('other-host', 'host-page')).toBe(true);
  });
});

/** Lets FoldStateStore's fire-and-forget `set()`/`clear()` writes complete before assertions. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
