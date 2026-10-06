import { describe, expect, it } from 'vitest';
import { ResourceArchiveMetadataStore } from './ResourceArchiveMetadataStore';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';

const ROOT = '/vault';

function setup() {
  const fileSystem = new InMemoryVaultFileSystem();
  const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);

  return { fileSystem, store };
}

describe('ResourceArchiveMetadataStore.read', () => {
  it('returns an empty store when .clutter/resource-archive.json does not exist', async () => {
    const { store } = setup();

    const entries = await store.read();

    expect(entries.size).toBe(0);
  });

  it('returns an empty store when .clutter exists but the file does not', async () => {
    const { fileSystem, store } = setup();
    await fileSystem.createDirectory(`${ROOT}/.clutter`);

    const entries = await store.read();

    expect(entries.size).toBe(0);
  });
});

describe('ResourceArchiveMetadataStore.record', () => {
  it('ensures .clutter exists before writing the file when it was missing', async () => {
    const { fileSystem, store } = setup();

    await store.record('Archive/hero.png', 'Projects/Website/hero.png');

    expect(await fileSystem.exists(`${ROOT}/.clutter`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/.clutter/resource-archive.json`)).toBe(true);
  });

  it('persists the archivedPath -> originalPath record, readable back', async () => {
    const { store } = setup();

    await store.record('Archive/hero.png', 'Projects/Website/hero.png');

    const entries = await store.read();

    expect(entries.get('Archive/hero.png')).toMatchObject({
      originalPath: 'Projects/Website/hero.png',
    });
  });

  it('writes valid JSON in the documented { resources: { ... } } shape', async () => {
    const { fileSystem, store } = setup();

    await store.record('Archive/hero.png', 'Projects/Website/hero.png', '2026-10-06T09:30:00.000Z');

    const raw = fileSystem.getFileSync(`${ROOT}/.clutter/resource-archive.json`);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toEqual({
      resources: {
        'Archive/hero.png': { originalPath: 'Projects/Website/hero.png', archivedAt: '2026-10-06T09:30:00.000Z' },
      },
    });
  });

  it('keeps multiple archived resources as independent entries, without overwriting each other', async () => {
    const { store } = setup();

    await store.record('Archive/hero.png', 'Projects/Website/hero.png');
    await store.record('Archive/spec.pdf', 'Projects/Docs/spec.pdf');
    await store.record('Archive/logo.png', 'Marketing/Assets/logo.png');

    const entries = await store.read();

    expect(entries.size).toBe(3);
    expect(entries.get('Archive/hero.png')).toMatchObject({
      originalPath: 'Projects/Website/hero.png',
    });
    expect(entries.get('Archive/spec.pdf')).toMatchObject({
      originalPath: 'Projects/Docs/spec.pdf',
    });
    expect(entries.get('Archive/logo.png')).toMatchObject({
      originalPath: 'Marketing/Assets/logo.png',
    });
  });
});

describe('ResourceArchiveMetadataStore — archivedAt (when the app archived the file)', () => {
  it('records the date it is given, and reads it back', async () => {
    const { store } = setup();

    await store.record('Archive/hero.png', 'Projects/hero.png', '2026-10-06T09:30:00.000Z');

    expect((await store.read()).get('Archive/hero.png')).toEqual({
      originalPath: 'Projects/hero.png',
      archivedAt: '2026-10-06T09:30:00.000Z',
    });
  });

  it('stamps the moment of the call when no date is given', async () => {
    const { store } = setup();
    const before = Date.now();

    await store.record('Archive/hero.png', 'Projects/hero.png');

    const archivedAt = (await store.read()).get('Archive/hero.png')!.archivedAt!;
    expect(Date.parse(archivedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(archivedAt)).toBeLessThanOrEqual(Date.now());
  });

  it('reads a record written before the date existed: the file is still archived, just without a date', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/.clutter/resource-archive.json`]: JSON.stringify({
        resources: { 'Archive/old.png': { originalPath: 'Projects/old.png' } },
      }),
    });
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);

    const entry = (await store.read()).get('Archive/old.png');

    expect(entry).toEqual({ originalPath: 'Projects/old.png' });
    expect(entry?.archivedAt).toBeUndefined();
  });

  it('keeps the date when the archived file is renamed inside Archive/', async () => {
    const { store } = setup();
    await store.record('Archive/hero.png', 'Projects/hero.png', '2026-10-06T09:30:00.000Z');

    await store.updateArchivedPath('Archive/hero.png', 'Archive/renamed.png');

    expect((await store.read()).get('Archive/renamed.png')?.archivedAt).toBe('2026-10-06T09:30:00.000Z');
  });

  it('removing the record (Restore) removes the date with it', async () => {
    const { store } = setup();
    await store.record('Archive/hero.png', 'Projects/hero.png', '2026-10-06T09:30:00.000Z');

    await store.remove('Archive/hero.png');

    expect((await store.read()).get('Archive/hero.png')).toBeUndefined();
  });

  it('a record never gains a date from anything but record(): a legacy entry stays dateless after another file is archived', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/.clutter/resource-archive.json`]: JSON.stringify({
        resources: { 'Archive/old.png': { originalPath: 'Projects/old.png' } },
      }),
    });
    const store = new ResourceArchiveMetadataStore(fileSystem, ROOT);

    await store.record('Archive/new.png', 'Projects/new.png', '2026-10-06T09:30:00.000Z');

    const entries = await store.read();
    expect(entries.get('Archive/old.png')).toEqual({ originalPath: 'Projects/old.png' });
    expect(entries.get('Archive/new.png')?.archivedAt).toBe('2026-10-06T09:30:00.000Z');
  });
});

describe('ResourceArchiveMetadataStore.updateArchivedPath', () => {
  it('re-keys an existing record to the new archived path, preserving originalPath', async () => {
    const { store } = setup();
    await store.record('Archive/hero.png', 'Projects/Website/hero.png');

    await store.updateArchivedPath('Archive/hero.png', 'Archive/hero-renamed.png');

    const entries = await store.read();
    expect(entries.has('Archive/hero.png')).toBe(false);
    expect(entries.get('Archive/hero-renamed.png')).toMatchObject({
      originalPath: 'Projects/Website/hero.png',
    });
  });

  it('does not disturb other archived resources', async () => {
    const { store } = setup();
    await store.record('Archive/hero.png', 'Projects/Website/hero.png');
    await store.record('Archive/spec.pdf', 'Projects/Docs/spec.pdf');

    await store.updateArchivedPath('Archive/hero.png', 'Archive/hero-renamed.png');

    const entries = await store.read();
    expect(entries.get('Archive/spec.pdf')).toMatchObject({
      originalPath: 'Projects/Docs/spec.pdf',
    });
  });

  it('is a no-op when no record exists for the given archived path', async () => {
    const { fileSystem, store } = setup();

    await store.updateArchivedPath('Archive/missing.png', 'Archive/renamed.png');

    expect(await fileSystem.exists(`${ROOT}/.clutter/resource-archive.json`)).toBe(false);
    const entries = await store.read();
    expect(entries.size).toBe(0);
  });
});

describe('ResourceArchiveMetadataStore.remove', () => {
  it('removes the record after a successful Restore', async () => {
    const { store } = setup();
    await store.record('Archive/hero.png', 'Projects/Website/hero.png');

    await store.remove('Archive/hero.png');

    const entries = await store.read();
    expect(entries.has('Archive/hero.png')).toBe(false);
  });

  it('leaves other archived resources untouched', async () => {
    const { store } = setup();
    await store.record('Archive/hero.png', 'Projects/Website/hero.png');
    await store.record('Archive/spec.pdf', 'Projects/Docs/spec.pdf');

    await store.remove('Archive/hero.png');

    const entries = await store.read();
    expect(entries.size).toBe(1);
    expect(entries.get('Archive/spec.pdf')).toMatchObject({
      originalPath: 'Projects/Docs/spec.pdf',
    });
  });

  it('is a no-op when no record exists for the given archived path', async () => {
    const { fileSystem, store } = setup();

    await store.remove('Archive/missing.png');

    expect(await fileSystem.exists(`${ROOT}/.clutter/resource-archive.json`)).toBe(false);
  });

  it('does not maintain a history — a removed record cannot be read back', async () => {
    const { store } = setup();
    await store.record('Archive/hero.png', 'Projects/Website/hero.png');
    await store.remove('Archive/hero.png');

    await store.record('Archive/hero.png', 'Somewhere/Else/hero.png');

    const entries = await store.read();
    expect(entries.get('Archive/hero.png')).toMatchObject({
      originalPath: 'Somewhere/Else/hero.png',
    });
  });
});
