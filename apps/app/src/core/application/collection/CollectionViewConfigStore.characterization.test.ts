import { describe, expect, it, vi } from 'vitest';

import { CollectionViewConfigStore } from './CollectionViewConfigStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

/**
 * CHARACTERIZATION of the persisted collection-view shape as it is TODAY, written before the
 * property-registry migration (which will replace `properties` with intent-only overrides and
 * `sort.key` with `sort.property`). The existing CollectionViewConfigStore.test.ts covers the
 * store's mechanics; this file pins the SHAPE decisions a migration has to convert or stay
 * compatible with.
 *
 * "CURRENT BEHAVIOR" tests are what the migration must read (or convert). "KNOWN DEFECT" tests
 * pin shape problems we have confirmed and deliberately not fixed yet; they are tripwires and are
 * expected to be rewritten when the shape changes.
 */

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadWith(collectionViewConfig: Record<string, unknown>): Promise<CollectionViewConfigStore> {
  const fileSystem = new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: JSON.stringify({ collectionViewConfig }) });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const store = await CollectionViewConfigStore.load(fileSystem, ROOT);
  warn.mockRestore();
  return store;
}

const FULL_SNAPSHOT = {
  description: true,
  created: true,
  updated: false,
  archived: true,
  cover: false,
  preview: true,
  title: false,
  size: true,
} as const;

describe('CURRENT BEHAVIOR — the persisted property shape is a full boolean snapshot', () => {
  it('round-trips all eight keys exactly as written, including `preview` (dead) and keys the collection never offers', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const first = await CollectionViewConfigStore.load(fileSystem, ROOT);
    first.update('folder:any', { properties: FULL_SNAPSHOT });
    await flush();

    const reloaded = await CollectionViewConfigStore.load(fileSystem, ROOT);

    expect(reloaded.get('folder:any')).toEqual({ properties: FULL_SNAPSHOT });
  });

  it('writes exactly what it is given into workspace.json under `collectionViewConfig` — it adds no defaults of its own', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await CollectionViewConfigStore.load(fileSystem, ROOT);
    store.update('view:assets', { layout: 'card', sort: { property: 'size', direction: 'down' } });
    await flush();

    const written = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH)) as { collectionViewConfig: unknown };

    expect(written.collectionViewConfig).toEqual({
      'view:assets': { layout: 'card', sort: { property: 'size', direction: 'down' } },
    });
  });

  it('the first three property keys are mandatory; archived / cover / preview / title / size are optional (older entries lack them)', async () => {
    const store = await loadWith({
      'folder:minimal': { properties: { description: true, created: true, updated: true } },
      'folder:missing-required': { properties: { description: true, created: true } },
    });

    expect(store.get('folder:minimal')?.properties).toEqual({ description: true, created: true, updated: true });
    expect(store.get('folder:missing-required')).toBeUndefined();
  });

  it('a non-boolean optional property (title, size) discards the WHOLE properties record — all or nothing, never just that key — while a valid layout beside it survives', async () => {
    const base = { description: true, created: true, updated: true };
    const store = await loadWith({
      'folder:bad-title': { layout: 'list', properties: { ...base, title: 'no' } },
      'folder:bad-size': { layout: 'list', properties: { ...base, size: 1 } },
      'folder:only-bad': { properties: { ...base, title: 'no' } },
      'folder:ok': { layout: 'list', properties: { ...base, title: false, size: true } },
    });

    expect(store.get('folder:bad-title')).toEqual({ layout: 'list' });
    expect(store.get('folder:bad-size')).toEqual({ layout: 'list' });
    expect(store.get('folder:only-bad')).toBeUndefined();
    expect(store.get('folder:ok')?.properties).toEqual({ ...base, title: false, size: true });
  });
});

describe('CURRENT BEHAVIOR — the persisted sort shape and its key vocabulary', () => {
  it('stores `{ property, direction }`; the property is one of name, description, cover, size, created, updated, archived', async () => {
    const ids = ['name', 'description', 'cover', 'size', 'created', 'updated', 'archived'];
    const store = await loadWith(
      Object.fromEntries(ids.map((property) => [`folder:${property}`, { sort: { property, direction: 'up' } }]))
    );

    for (const property of ids) {
      expect(store.get(`folder:${property}`)).toEqual({ sort: { property, direction: 'up' } });
    }
  });

  it('an entry written before the registry stored the same ids as `{ key, direction }` — read as the same sort, written back as `property`', async () => {
    const ids = ['name', 'description', 'cover', 'size', 'created', 'updated', 'archived'];
    const store = await loadWith(
      Object.fromEntries(ids.map((key) => [`folder:${key}`, { sort: { key, direction: 'down' } }]))
    );

    for (const property of ids) {
      expect(store.get(`folder:${property}`)).toEqual({ sort: { property, direction: 'down' } });
    }
  });

  it('`updated` is the current id for "Last edited" — `modified` (the frontmatter / system-property name) is NOT accepted today', async () => {
    const store = await loadWith({
      'folder:current': { sort: { key: 'updated', direction: 'down' } },
      'folder:future-name': { sort: { key: 'modified', direction: 'down' } },
    });

    expect(store.get('folder:current')).toEqual({ sort: { property: 'updated', direction: 'down' } });
    expect(store.get('folder:future-name')).toBeUndefined();
  });

  it('the direction is `down` or `up` — anything else (including asc / desc) discards the entry', async () => {
    const store = await loadWith({
      'folder:asc': { sort: { key: 'name', direction: 'asc' } },
      'folder:up': { sort: { key: 'name', direction: 'up' } },
    });

    expect(store.get('folder:asc')).toBeUndefined();
    expect(store.get('folder:up')).toEqual({ sort: { property: 'name', direction: 'up' } });
  });

  it('retired keys still in a saved file: `lastOpened` and `type` as a sort key are dropped (the layout survives; `type` rejects its whole entry)', async () => {
    const store = await loadWith({
      'folder:last-opened': { layout: 'table', sort: { key: 'lastOpened', direction: 'down' } },
      'folder:type': { sort: { key: 'type', direction: 'down' } },
    });

    expect(store.get('folder:last-opened')).toEqual({ layout: 'table' });
    expect(store.get('folder:type')).toBeUndefined();
  });
});

describe('CURRENT BEHAVIOR — tolerant loading', () => {
  it('a legacy `lastOpened` PROPERTY is dropped on load, keeping the three required keys', async () => {
    const store = await loadWith({
      'folder:old': { properties: { description: true, lastOpened: false, created: true, updated: false } },
    });

    expect(store.get('folder:old')?.properties).toEqual({ description: true, created: true, updated: false });
  });

  it('an unknown layout drops that field; an entry left with nothing valid is discarded entirely', async () => {
    const store = await loadWith({
      'folder:half': { layout: 'gallery', sort: { key: 'name', direction: 'down' } },
      'folder:none': { layout: 'gallery' },
    });

    expect(store.get('folder:half')).toEqual({ sort: { property: 'name', direction: 'down' } });
    expect(store.get('folder:none')).toBeUndefined();
  });

  it('collections are keyed `folder:<id>`, `view:workspace|favorites|assets` and `tag:<name>` — one entry each, never shared', async () => {
    const store = await loadWith({
      'folder:a': { layout: 'list' },
      'view:workspace': { layout: 'table' },
      'view:favorites': { layout: 'card' },
      'view:assets': { layout: 'list' },
      'tag:todo': { layout: 'card' },
    });

    expect(['folder:a', 'view:workspace', 'view:favorites', 'view:assets', 'tag:todo'].map((key) => store.get(key)?.layout)).toEqual([
      'list',
      'table',
      'card',
      'list',
      'card',
    ]);
  });
});

describe('CURRENT BEHAVIOR — a shape this build does not know is discarded, not interpreted', () => {
  // Matters for rollback: an older build reading an entry written in a future shape must fall back to
  // defaults rather than misread it. (It also means a migration must convert on READ, because the old
  // reader cannot be taught.)
  it('an entry holding only unknown fields is discarded', async () => {
    const store = await loadWith({ 'folder:future': { someFutureField: { cover: false } } });

    expect(store.get('folder:future')).toBeUndefined();
  });

  it('unknown fields next to valid ones are dropped on load, not preserved', async () => {
    const store = await loadWith({
      'folder:mixed': { layout: 'list', someFutureField: { cover: false } },
    });

    expect(store.get('folder:mixed')).toEqual({ layout: 'list' });
  });
});

describe('KNOWN DEFECT — the snapshot shape cannot tell the user\'s choice from a default', () => {
  it('KNOWN DEFECT: an entry written with every default value is indistinguishable from one the user set deliberately, so a later change of default never reaches it', async () => {
    const allDefaults = { description: true, created: true, updated: true, archived: true, cover: true, preview: true, title: true, size: true };
    const store = await loadWith({ 'folder:untouched-but-snapshotted': { properties: allDefaults } });

    // The store faithfully keeps all eight keys — including `size` and `title`, which a note collection
    // never offers. There is no "no opinion" representation for any of them.
    expect(store.get('folder:untouched-but-snapshotted')?.properties).toEqual(allDefaults);
  });
});
