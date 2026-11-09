import { afterEach, describe, expect, it, vi } from 'vitest';

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import type { Folder } from '../vault/models/Folder';
import type { Page } from '../vault/models/Page';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../vault/ingest/PageBuilder';
import { VaultBuilder, VaultScanner } from '../vault/ingest';
import { ParsedNoteCache, sha256Hex } from '../vault/persistence/parsedNoteCache/ParsedNoteCache';
import { InMemoryParsedNoteCacheBackend } from '../vault/testing/InMemoryParsedNoteCacheBackend';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';
const emptyAnalysis = { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] };
const folderMetadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const folder = (id: string, name: string, parent: Folder | null = null): Folder => ({
  id,
  name,
  path: `${parent?.path ?? ROOT}/${name}`,
  parentId: parent?.id ?? null,
  metadata: folderMetadata,
});

function page(id: string, path: string, parentId: string | null): Page {
  return new PageBuilder(ROOT).build({
    parentId,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: emptyAnalysis,
    },
  } as never);
}

const projects = folder('projects', 'Projects');
const inner = folder('inner', 'Inner', projects);
const other = folder('other', 'Other');

async function setup() {
  const pages = [
    page('note-a', `${ROOT}/Note A.md`, null),
    page('note-b', `${ROOT}/Note B.md`, null),
    page('nested', `${ROOT}/Projects/Inner/Nested.md`, 'inner'),
    page('top', `${ROOT}/Projects/Top.md`, 'projects'),
    page('keep', `${ROOT}/Other/Keep.md`, 'other'),
  ];
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  for (const seeded of pages) {
    fileSystem.seedFile(seeded.path, serializer.serializeDocument(seeded, seeded.source.markdown));
  }
  for (const directory of ['Archive', 'Projects', 'Projects/Inner', 'Other']) {
    await fileSystem.createDirectory(`${ROOT}/${directory}`);
  }

  const vault = new Vault(
    ROOT,
    pages,
    [projects, inner, other, folder('archive', 'Archive')],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  const deleted: Array<readonly string[]> = [];
  application.subscribePagesPermanentlyDeleted((ids) => deleted.push(ids));

  /** Gives each of these pages the per-note derived state the delete must drop. */
  const seedDerivedState = (...ids: string[]) => {
    for (const id of ids) {
      application.foldStateStore.set(id, { doc: 'x', fold: [1] });
      application.referencesDisplayStore.setHidden(id, true);
    }
  };
  const derivedStateOf = (id: string) => ({
    fold: application.foldStateStore.get(id),
    references: application.referencesDisplayStore.getHidden(id),
  });

  return { application, vault, fileSystem, deleted, seedDerivedState, derivedStateOf };
}

afterEach(() => vi.restoreAllMocks());

/** `openFallbackPage` is private; the facades reach it through closures, so a test watches it by name. */
const spyOnFallback = (application: Application) =>
  vi
    .spyOn(application as unknown as { openFallbackPage: () => Promise<void> }, 'openFallbackPage')
    .mockResolvedValue(undefined);

describe('permanently deleting through the real Application: derived state', () => {
  it('a single note: fold state, References preference and the editor-cache hook all run, once, after the delete', async () => {
    const { application, deleted, seedDerivedState, derivedStateOf } = await setup();
    seedDerivedState('note-a', 'note-b');
    await application.pageOperations.archive('note-a');

    // Archiving is reversible: nothing is dropped yet.
    expect(deleted).toEqual([]);
    expect(derivedStateOf('note-a')).toEqual({ fold: { doc: 'x', fold: [1] }, references: true });

    await application.pageOperations.delete('note-a');

    expect(deleted).toEqual([['note-a']]);
    expect(derivedStateOf('note-a')).toEqual({ fold: undefined, references: undefined });
    expect(derivedStateOf('note-b').references).toBe(true);
  });

  it('a recursive folder delete drops the state of every descendant page, and only theirs', async () => {
    const { application, deleted, seedDerivedState, derivedStateOf } = await setup();
    seedDerivedState('nested', 'top', 'keep', 'note-a');
    await application.folderOperations.archive('projects');

    await application.folderOperations.delete('projects');

    expect(deleted).toHaveLength(1);
    expect([...deleted[0]!].sort()).toEqual(['nested', 'top']);
    expect(derivedStateOf('nested')).toEqual({ fold: undefined, references: undefined });
    expect(derivedStateOf('top')).toEqual({ fold: undefined, references: undefined });
    expect(derivedStateOf('keep').references).toBe(true);
    expect(derivedStateOf('note-a').references).toBe(true);
  });

  it('the automatic 30-day cleanup goes through the same hook', async () => {
    const { application, deleted, seedDerivedState, derivedStateOf } = await setup();
    seedDerivedState('note-b');
    await application.pageOperations.archive('note-b');

    const removed = await application.purgeExpiredArchivedItems(new Date(2099, 0, 1));

    expect(removed).toBe(1);
    expect(deleted).toEqual([['note-b']]);
    expect(derivedStateOf('note-b')).toEqual({ fold: undefined, references: undefined });
  });

  it('a delete that is refused (not archived) or abandoned drops nothing', async () => {
    const { application, vault, deleted, seedDerivedState, derivedStateOf } = await setup();
    seedDerivedState('note-a');

    await expect(application.pageOperations.delete('note-a')).rejects.toThrow(/not archived/);
    expect(deleted).toEqual([]);
    expect(derivedStateOf('note-a').references).toBe(true);

    // Archived, then restored while the delete was waiting its turn: the Gate abandons it.
    await application.pageOperations.archive('note-a');
    const restoring = application.pageOperations.restore('note-a');
    const pending = application.pageOperations.delete('note-a');
    await restoring;
    await pending;

    expect(vault.getPage('note-a')).toBeDefined();
    expect(deleted).toEqual([]);
    expect(derivedStateOf('note-a')).toEqual({ fold: { doc: 'x', fold: [1] }, references: true });
  });
});

describe('permanently deleting a folder: edit state of its pages', () => {
  it('no page of the deleted subtree stays in unsavedPageIds', async () => {
    const { application } = await setup();
    application.pageOperations.commitTitle('nested', 'Renamed nested');
    application.pageOperations.commitDescription('top', 'A description');
    application.pageOperations.commitTitle('keep', 'Renamed keep');
    expect(application.pageOperations.unsavedPageIds()).toEqual(expect.arrayContaining(['nested', 'top', 'keep']));

    await application.folderOperations.delete('projects', { allowActive: true });

    const unsaved = application.pageOperations.unsavedPageIds();
    expect(unsaved).not.toContain('nested');
    expect(unsaved).not.toContain('top');
    // An unrelated page keeps its pending edit.
    expect(unsaved).toContain('keep');
  });
});

describe('permanently deleting a folder: navigation', () => {
  it('an active descendant folder never renders as active after the Vault dropped it, and exactly one fallback runs', async () => {
    const { application, vault } = await setup();
    const fallback = spyOnFallback(application);
    await application.folderOperations.open('inner');
    const observations: string[] = [];
    const observe = () => {
      const id = application.workspace.activeFolderId;
      if (id !== null && !vault.getFolder(id)) observations.push(`workspace shows deleted folder ${id}`);
    };
    application.workspace.subscribe(observe);
    vault.subscribe(observe);

    await application.folderOperations.delete('projects', { allowActive: true });

    expect(observations).toEqual([]);
    expect(application.workspace.activeFolderId).toBeNull();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('an unrelated active view survives a subtree delete with no fallback', async () => {
    const { application } = await setup();
    const fallback = spyOnFallback(application);
    await application.folderOperations.open('other');

    await application.folderOperations.delete('projects', { allowActive: true });

    expect(application.workspace.activeFolderId).toBe('other');
    expect(fallback).not.toHaveBeenCalled();
  });
});

describe('permanently deleting through the real Application: the parsed-note cache', () => {
  const noteText = (id: string, body: string) => `---\nid: ${id}\n---\n# ${body}\n\nParagraph of ${body}.\n`;
  const TEXT = {
    n1: noteText('n1', 'One'),
    n2: noteText('n2', 'Two'),
    f1: noteText('f1', 'Folder one'),
    f2: noteText('f2', 'Folder two'),
    keep: noteText('keep', 'Keep'),
  };

  /** What `bootstrap` does for the cache: scan through it, bind the notes, build the app, and write the cache once. */
  async function setupCached(texts: Record<string, string> = {
    [`${ROOT}/n1.md`]: TEXT.n1,
    [`${ROOT}/n2.md`]: TEXT.n2,
    [`${ROOT}/Box/f1.md`]: TEXT.f1,
    [`${ROOT}/Box/Inner/f2.md`]: TEXT.f2,
    [`${ROOT}/keep.md`]: TEXT.keep,
  }) {
    const fileSystem = new InMemoryVaultFileSystem(texts);
    await fileSystem.createDirectory(ROOT);
    for (const directory of new Set(Object.keys(texts).map((path) => path.slice(0, path.lastIndexOf('/'))))) {
      await fileSystem.createDirectory(directory);
    }
    const backend = new InMemoryParsedNoteCacheBackend();
    const cache = await ParsedNoteCache.load(backend, ROOT);
    const { vault } = new VaultBuilder(new UuidGenerator()).build(await new VaultScanner(fileSystem, cache).scan(ROOT));
    cache.bindNotes(
      vault.pages(),
      Array.from(vault.folders(), (folder) => ({ id: folder.id, path: `${folder.path}/.folder.md` }))
    );
    const application = new Application(
      vault, fileSystem, new SelfWriteRegistry(), undefined as never,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      cache
    );
    Reflect.set(application, 'rootPath', ROOT);
    application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
    await application.persistParsedNoteCache();

    const cached = (): string[] => {
      const contents = backend.files.get(ROOT);
      return contents === undefined ? [] : Object.keys(JSON.parse(contents).entries).sort();
    };
    const keysOf = async (...texts: string[]) => (await Promise.all(texts.map(sha256Hex))).sort();
    const settle = () => cache.idle();

    return { application, vault, backend, cached, keysOf, settle };
  }

  it('single note: archiving rewrites its file, yet its entry is found and removed when it is permanently deleted', async () => {
    const { application, cached, keysOf, settle } = await setupCached();
    expect(cached()).toEqual(await keysOf(TEXT.n1, TEXT.n2, TEXT.f1, TEXT.f2, TEXT.keep));

    await application.pageOperations.archive('n1');
    await settle();
    // Archiving is reversible: the cache is untouched.
    expect(cached()).toEqual(await keysOf(TEXT.n1, TEXT.n2, TEXT.f1, TEXT.f2, TEXT.keep));

    await application.pageOperations.delete('n1');
    await settle();

    expect(cached()).toEqual(await keysOf(TEXT.n2, TEXT.f1, TEXT.f2, TEXT.keep));
  });

  it('a note that was archived, restored, edited and moved is still found by its id', async () => {
    const { application, cached, keysOf, settle } = await setupCached();

    await application.pageOperations.archive('n2');
    await application.pageOperations.restore('n2');
    await application.pageOperations.move('n2', null);
    await settle();
    await application.pageOperations.archive('n2');
    await application.pageOperations.delete('n2');
    await settle();

    expect(cached()).toEqual(await keysOf(TEXT.n1, TEXT.f1, TEXT.f2, TEXT.keep));
  });

  it('recursive folder delete: every note in the subtree leaves the cache, and no other', async () => {
    const { application, vault, cached, keysOf, settle } = await setupCached();
    const box = [...vault.folders()].find((folder) => folder.name === 'Box')!;

    await application.folderOperations.archive(box.id);
    await application.folderOperations.delete(box.id);
    await settle();

    expect(cached()).toEqual(await keysOf(TEXT.n1, TEXT.n2, TEXT.keep));
  });

  it('recursive folder delete: the .folder.md entries of the folder and its subfolders leave the cache too', async () => {
    const folderText = (id: string, description: string) => `---\nid: ${id}\ndescription: ${description}\n---\n`;
    const boxMeta = folderText('box-id', 'Box');
    const innerMeta = folderText('inner-id', 'Inner');
    const keepMeta = folderText('keep-id', 'Keep folder');
    const { application, vault, cached, keysOf, settle } = await setupCached({
      [`${ROOT}/Box/.folder.md`]: boxMeta,
      [`${ROOT}/Box/f1.md`]: TEXT.f1,
      [`${ROOT}/Box/Inner/.folder.md`]: innerMeta,
      [`${ROOT}/Box/Inner/f2.md`]: TEXT.f2,
      [`${ROOT}/Other/.folder.md`]: keepMeta,
      [`${ROOT}/keep.md`]: TEXT.keep,
    });
    expect(cached()).toEqual(await keysOf(boxMeta, innerMeta, keepMeta, TEXT.f1, TEXT.f2, TEXT.keep));
    const box = [...vault.folders()].find((folder) => folder.name === 'Box')!;

    await application.folderOperations.archive(box.id);
    await application.folderOperations.delete(box.id);
    await settle();

    expect(cached()).toEqual(await keysOf(keepMeta, TEXT.keep));
  });

  it('the automatic cleanup removes them too', async () => {
    const { application, cached, keysOf, settle } = await setupCached();
    await application.pageOperations.archive('n1');

    await application.purgeExpiredArchivedItems(new Date(2099, 0, 1));
    await settle();

    expect(cached()).toEqual(await keysOf(TEXT.n2, TEXT.f1, TEXT.f2, TEXT.keep));
  });

  it('a refused or abandoned delete leaves the cache untouched', async () => {
    const { application, cached, keysOf, settle } = await setupCached();
    const all = await keysOf(TEXT.n1, TEXT.n2, TEXT.f1, TEXT.f2, TEXT.keep);

    await expect(application.pageOperations.delete('n1')).rejects.toThrow(/not archived/);
    await application.pageOperations.archive('n1');
    const restoring = application.pageOperations.restore('n1');
    const pending = application.pageOperations.delete('n1');
    await restoring;
    await pending;
    await settle();

    expect(cached()).toEqual(all);
  });

  it('deleting every note leaves an empty cache, not the old file', async () => {
    const { application, backend, vault, settle } = await setupCached({
      [`${ROOT}/n1.md`]: TEXT.n1,
      [`${ROOT}/n2.md`]: TEXT.n2,
    });
    expect(backend.files.has(ROOT)).toBe(true);

    for (const id of ['n1', 'n2']) {
      await application.pageOperations.archive(id);
      await application.pageOperations.delete(id);
    }
    await settle();

    expect([...vault.pages()]).toHaveLength(0);
    expect(backend.files.has(ROOT)).toBe(false);
  });
});
