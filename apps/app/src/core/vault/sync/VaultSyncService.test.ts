import { describe, expect, it } from 'vitest';
import { VaultSyncService } from './VaultSyncService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { VaultScanner } from '../ingest/VaultScanner';
import { VaultBuilder } from '../ingest/VaultBuilder';
import { VaultQuery } from '../queries/VaultQuery';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import type { VaultFileSystem } from '../providers/VaultFileSystem';

const ROOT = '/vault';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function buildPage(path: string, content: string, frontmatterId: string): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${path}`,
      directoryPath: ROOT,
      frontmatter: { id: frontmatterId },
      frontmatterAnalysis: { aliases: [] },
      content,
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

function makeVault(pages: Page[] = [], folders: Folder[] = []): Vault {
  return new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

const defaultFolderMetadata = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeArchiveFolder(): Folder {
  return {
    id: 'folder-archive',
    name: 'Archive',
    path: `${ROOT}/Archive`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function makeProjectsFolder(): Folder {
  return {
    id: 'folder-projects',
    name: 'Projects',
    path: `${ROOT}/Projects`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function makeArchiveSubfolder(id: string, name: string): Folder {
  return {
    id,
    name,
    path: `${ROOT}/Archive/${name}`,
    parentId: 'folder-archive',
    metadata: defaultFolderMetadata,
  };
}

function buildArchivedPage(path: string, content: string, pageId: string): Page {
  const page = buildPage(path, content, pageId);

  return {
    ...page,
    parentId: 'folder-archive',
    metadata: {
      ...page.metadata,
      status: 'archived',
      archivedAt: '2024-01-01T00:00:00.000Z',
      originalPath: `${ROOT}/Inbox/Note.md`,
      originalParentId: 'folder-inbox',
    },
  };
}

function archivedDiskDocument(pageId: string, body: string): string {
  return [
    '---',
    `id: ${pageId}`,
    'status: archived',
    'archivedAt: 2024-01-01T00:00:00.000Z',
    `originalPath: ${ROOT}/Inbox/Note.md`,
    'originalParentId: folder-inbox',
    '---',
    body,
  ].join('\n');
}

function setup(pages: Page[] = [], folders: Folder[] = []) {
  const vault = makeVault(pages, folders);
  const fileSystem = new InMemoryVaultFileSystem();
  const watcher = new FakeVaultFileSystemWatcher();
  const documentRegistry = new DocumentRegistry();
  const service = new VaultSyncService(
    vault,
    fileSystem,
    watcher,
    documentRegistry,
    new FrontmatterSerializer(),
    new FakeIdGenerator()
  );

  return { vault, fileSystem, watcher, documentRegistry, service };
}

describe('VaultSyncService', () => {
  it('created: a new markdown file appearing on disk adds a page to the vault', async () => {
    const { vault, fileSystem, watcher } = setup();
    fileSystem.seedFile(`${ROOT}/New.md`, '---\nid: new-page\n---\nHello');

    watcher.emit({ type: 'created', path: 'New.md', isDirectory: false });
    await flush();

    const page = vault.getPageByPath(`${ROOT}/New.md`);
    expect(page).toBeDefined();
    expect(page!.id).toBe('new-page');
    expect(page!.source.markdown).toBe('Hello');
  });

  it('created: a copied file carrying the original\'s frontmatter id is assigned a fresh id, and the original keeps its own', async () => {
    const original = buildPage('Note.md', 'Original content', 'note-1');
    const { vault, fileSystem, watcher } = setup([original]);

    // A file copy (by any means — Finder, cp, a script) duplicates the
    // file's content byte-for-byte, including the frontmatter id.
    fileSystem.seedFile(
      `${ROOT}/Note copy.md`,
      '---\nid: note-1\n---\nOriginal content'
    );

    watcher.emit({ type: 'created', path: 'Note copy.md', isDirectory: false });
    await flush();

    const originalStill = vault.getPage('note-1');
    const copy = vault.getPageByPath(`${ROOT}/Note copy.md`);

    expect(originalStill).toBeDefined();
    expect(originalStill!.path).toBe(`${ROOT}/Note.md`);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe('note-1');
    expect(vault.pageCount).toBe(2);

    // The duplicate's persisted frontmatter is repaired to match its new
    // id, so a later rescan derives the same id again (identity stays
    // deterministic — spec §2).
    const onDisk = await fileSystem.readFile(`${ROOT}/Note copy.md`);
    expect(onDisk).toContain(`id: ${copy!.id}`);
  });

  it('created: a new page inside an unknown/unresolvable parent folder is safely ignored', async () => {
    const { vault, fileSystem, watcher } = setup();

    fileSystem.seedFile(
      `${ROOT}/unknown-folder/New.md`,
      '---\nid: orphan\n---\nBody'
    );

    watcher.emit({ type: 'created', path: 'unknown-folder/New.md', isDirectory: false });
    await flush();

    expect(
      vault.getPageByPath(`${ROOT}/unknown-folder/New.md`)
    ).toBeUndefined();
    expect(vault.getPage('orphan')).toBeUndefined();
  });

  it('changed: an externally edited file is re-read, re-parsed, and rebuilt into the vault', async () => {
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher } = setup([existing]);

    fileSystem.seedFile(
      `${ROOT}/Note.md`,
      '---\nid: note-1\nfavorite: true\n---\nUpdated body'
    );

    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();

    const updated = vault.getPage('note-1');
    expect(updated).toBeDefined();
    expect(updated!.source.markdown).toBe('Updated body');
    expect(updated!.metadata.favorite).toBe(true);
  });

  it('deleted: a removed file removes its page from the vault', async () => {
    const existing = buildPage('Gone.md', 'content', 'gone-1');
    const { vault, watcher } = setup([existing]);

    expect(vault.getPage('gone-1')).toBeDefined();

    watcher.emit({ type: 'deleted', path: 'Gone.md' });
    await flush();

    expect(vault.getPage('gone-1')).toBeUndefined();
    expect(vault.getPageByPath(`${ROOT}/Gone.md`)).toBeUndefined();
  });

  it('moved: a renamed/moved file preserves page id and updates its path', async () => {
    const existing = buildPage('old/path.md', 'content', 'moved-1');
    const { vault, watcher } = setup([existing]);

    watcher.emit({
      type: 'moved',
      fromPath: 'old/path.md',
      toPath: 'new/path.md',
    });
    await flush();

    const moved = vault.getPage('moved-1');
    expect(moved).toBeDefined();
    expect(moved!.id).toBe('moved-1');
    expect(moved!.path).toBe(`${ROOT}/new/path.md`);
    expect(vault.getPageByPath(`${ROOT}/old/path.md`)).toBeUndefined();
  });

  it('moved: content and metadata are left untouched by a pure location change', async () => {
    const existing = buildPage('old/path.md', 'Untouched content', 'moved-2');
    const existingWithMetadata: Page = {
      ...existing,
      metadata: { ...existing.metadata, favorite: true, icon: '📌' },
    };
    const { vault, watcher } = setup([existingWithMetadata]);

    watcher.emit({
      type: 'moved',
      fromPath: 'old/path.md',
      toPath: 'new/path.md',
    });
    await flush();

    const moved = vault.getPage('moved-2')!;
    expect(moved.source.markdown).toBe('Untouched content');
    expect(moved.metadata.favorite).toBe(true);
    expect(moved.metadata.icon).toBe('📌');
  });

  it('moved (atomic save, replace): a temp-file-renamed-over-the-original save is reconciled as a content change, not dropped', async () => {
    // An atomic save (write a fresh file, then rename it over the real
    // path — one common way to implement "save," regardless of which
    // application does it) produces a single 'moved' event via the
    // watcher's rename pairing, whose fromPath (the temporary file) was
    // never tracked as vault content.
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher } = setup([existing]);

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nEdited externally');

    watcher.emit({
      type: 'moved',
      fromPath: '.Note.md.tmp',
      toPath: 'Note.md',
    });
    await flush();

    const page = vault.getPage('note-1');
    expect(page).toBeDefined();
    expect(page!.path).toBe(`${ROOT}/Note.md`);
    expect(page!.source.markdown).toBe('Edited externally');
    expect(vault.pageCount).toBe(1);
  });

  it('moved (atomic save, new file): a temp-file-renamed-into-place file that was never tracked is discovered as a new page', async () => {
    const { vault, fileSystem, watcher } = setup();

    fileSystem.seedFile(`${ROOT}/New.md`, '---\nid: page-new\n---\nBrand new content');

    watcher.emit({
      type: 'moved',
      fromPath: '.New.md.tmp',
      toPath: 'New.md',
    });
    await flush();

    const page = vault.getPageByPath(`${ROOT}/New.md`);
    expect(page).toBeDefined();
    expect(page!.id).toBe('page-new');
    expect(page!.source.markdown).toBe('Brand new content');
  });

  it('delete-then-create (a separate save pattern equivalent to atomic rename-over): the resulting page keeps its original id regardless of how much of the delete has settled before create arrives', async () => {
    // Some editors/tools save by deleting the file and writing a fresh one
    // at the same path, rather than a rename. Two independent events, no
    // 'moved' pairing — the reconciliation must still converge on the same
    // page identity a rename-over or a plain 'changed' event would produce.
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher } = setup([existing]);

    watcher.emit({ type: 'deleted', path: 'Note.md' });
    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nEdited body');
    watcher.emit({ type: 'created', path: 'Note.md', isDirectory: false });
    await flush();

    const page = vault.getPageByPath(`${ROOT}/Note.md`);
    expect(page).toBeDefined();
    expect(page!.id).toBe('note-1');
    expect(page!.source.markdown).toBe('Edited body');
    expect(vault.pageCount).toBe(1);
  });

  it('delete-then-create: still correct even when the delete fully settles before the create event is even received (a larger event-delivery gap)', async () => {
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher } = setup([existing]);

    watcher.emit({ type: 'deleted', path: 'Note.md' });
    await flush();
    expect(vault.getPageByPath(`${ROOT}/Note.md`)).toBeUndefined();

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nEdited body');
    watcher.emit({ type: 'created', path: 'Note.md', isDirectory: false });
    await flush();

    const page = vault.getPageByPath(`${ROOT}/Note.md`);
    expect(page).toBeDefined();
    expect(page!.id).toBe('note-1');
    expect(page!.source.markdown).toBe('Edited body');
    expect(vault.pageCount).toBe(1);
  });

  it('changed: page id is unchanged and analysis is recomputed (PageRebuilder actually ran)', async () => {
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher } = setup([existing]);

    fileSystem.seedFile(
      `${ROOT}/Note.md`,
      '---\nid: note-1\n---\nNew body #project'
    );

    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();

    const updated = vault.getPage('note-1')!;
    expect(updated.id).toBe('note-1');
    // Analysis is derived fresh from the new body, proving PageRebuilder
    // (not just a raw markdown string copy) ran on the external change.
    expect(updated.analysis.tags.map((t) => t.name)).toContain('project');
  });

  it('created: resolves the correct parent folder id when the file lands inside a known subfolder', async () => {
    const folder: Folder = {
      id: 'folder-1',
      name: 'notes',
      path: `${ROOT}/notes`,
      parentId: null,
      metadata: {
        icon: null,
        favorite: false,
        description: '',
        cover: null,
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
      },
    };
    const { vault, fileSystem, watcher } = setup([], [folder]);

    fileSystem.seedFile(
      `${ROOT}/notes/New.md`,
      '---\nid: nested-page\n---\nBody'
    );

    watcher.emit({ type: 'created', path: 'notes/New.md', isDirectory: false });
    await flush();

    const page = vault.getPage('nested-page');
    expect(page).toBeDefined();
    expect(page!.parentId).toBe('folder-1');
  });
});

describe('VaultSyncService: folder lifecycle (ADR-024)', () => {
  it('created: a new directory with no .folder.md becomes a Folder (identity is path-derived, matching VaultScanner)', async () => {
    const { vault, fileSystem, watcher } = setup();
    await fileSystem.createDirectory(`${ROOT}/Projects`);

    watcher.emit({ type: 'created', path: 'Projects', isDirectory: true });
    await flush();

    const folder = vault.getFolderByPath(`${ROOT}/Projects`);
    expect(folder).toBeDefined();
    expect(folder!.parentId).toBeNull();
  });

  it('created: a new directory with a .folder.md picks up its frontmatter (icon, favorite, etc.)', async () => {
    const { vault, fileSystem, watcher } = setup();
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    await fileSystem.writeFile(
      `${ROOT}/Projects/.folder.md`,
      '---\nid: folder-imported\nicon: 📁\nfavorite: true\n---\n'
    );

    watcher.emit({ type: 'created', path: 'Projects', isDirectory: true });
    await flush();

    const folder = vault.getFolder('folder-imported');
    expect(folder).toBeDefined();
    expect(folder!.metadata.icon).toBe('📁');
    expect(folder!.metadata.favorite).toBe(true);
  });

  it("created: a .folder.md file's own 'created' event (arriving as a separate filesystem event) is not built as a page", async () => {
    const { vault, fileSystem, watcher } = setup();
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    await fileSystem.writeFile(
      `${ROOT}/Projects/.folder.md`,
      '---\nid: folder-1\n---\n'
    );

    watcher.emit({ type: 'created', path: 'Projects', isDirectory: true });
    await flush();
    watcher.emit({ type: 'created', path: 'Projects/.folder.md', isDirectory: false });
    await flush();

    expect(vault.getFolder('folder-1')).toBeDefined();
    expect(vault.getPageByPath(`${ROOT}/Projects/.folder.md`)).toBeUndefined();
  });

  it('created: a directory moved into the vault with existing notes and subfolders is ingested as a full subtree, not just the empty directory', async () => {
    const { vault, fileSystem, watcher } = setup();
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    await fileSystem.createDirectory(`${ROOT}/Projects/Design`);
    await fileSystem.writeFile(
      `${ROOT}/Projects/Roadmap.md`,
      '---\nid: page-roadmap\n---\ncontent'
    );
    await fileSystem.writeFile(
      `${ROOT}/Projects/Design/Mockup.md`,
      '---\nid: page-mockup\n---\ncontent'
    );

    // A single 'created' event for the top-level directory is all the OS
    // guarantees when a folder is dragged/moved in from outside the vault
    // — events for its pre-existing descendants may or may not fire.
    watcher.emit({ type: 'created', path: 'Projects', isDirectory: true });
    await flush();

    const projects = vault.getFolderByPath(`${ROOT}/Projects`);
    const design = vault.getFolderByPath(`${ROOT}/Projects/Design`);
    const roadmap = vault.getPageByPath(`${ROOT}/Projects/Roadmap.md`);
    const mockup = vault.getPageByPath(`${ROOT}/Projects/Design/Mockup.md`);

    expect(projects).toBeDefined();
    expect(projects!.parentId).toBeNull();
    expect(design).toBeDefined();
    expect(design!.parentId).toBe(projects!.id);
    expect(roadmap).toBeDefined();
    expect(roadmap!.parentId).toBe(projects!.id);
    expect(mockup).toBeDefined();
    expect(mockup!.parentId).toBe(design!.id);
  });

  it('created: a note added inside a directory right after that directory was itself just moved in is still discovered', async () => {
    const { vault, fileSystem, watcher } = setup();
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    await fileSystem.writeFile(
      `${ROOT}/Projects/First.md`,
      '---\nid: page-first\n---\ncontent'
    );

    watcher.emit({ type: 'created', path: 'Projects', isDirectory: true });
    await flush();

    // A file created inside the folder arrives as its own event; even if
    // it raced ahead of (or was already covered by) the subtree scan, the
    // page must end up known exactly once.
    await fileSystem.writeFile(
      `${ROOT}/Projects/Second.md`,
      '---\nid: page-second\n---\ncontent'
    );
    watcher.emit({ type: 'created', path: 'Projects/Second.md', isDirectory: false });
    await flush();

    const projects = vault.getFolderByPath(`${ROOT}/Projects`);
    expect(vault.getPageByPath(`${ROOT}/Projects/First.md`)!.parentId).toBe(projects!.id);
    expect(vault.getPageByPath(`${ROOT}/Projects/Second.md`)!.parentId).toBe(projects!.id);
    expect(vault.pageCount).toBe(2);
  });

  it('created: a duplicated folder subtree (every note carrying its original\'s frontmatter id) gets fresh ids for the copies, leaving originals untouched', async () => {
    const original = buildPage('Projects/Roadmap.md', 'Roadmap content', 'page-roadmap');
    const { vault, fileSystem, watcher } = setup([original]);

    // Copying the whole subtree duplicates every note's frontmatter,
    // including its id.
    await fileSystem.createDirectory(`${ROOT}/Projects copy`);
    await fileSystem.writeFile(
      `${ROOT}/Projects copy/Roadmap.md`,
      '---\nid: page-roadmap\n---\nRoadmap content'
    );

    watcher.emit({ type: 'created', path: 'Projects copy', isDirectory: true });
    await flush();

    const originalStill = vault.getPage('page-roadmap');
    const copy = vault.getPageByPath(`${ROOT}/Projects copy/Roadmap.md`);

    expect(originalStill).toBeDefined();
    expect(originalStill!.path).toBe(`${ROOT}/Projects/Roadmap.md`);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe('page-roadmap');
    expect(vault.pageCount).toBe(2);

    const onDisk = await fileSystem.readFile(`${ROOT}/Projects copy/Roadmap.md`);
    expect(onDisk).toContain(`id: ${copy!.id}`);
  });

  it('created: a duplicated folder (its own .folder.md carrying the original\'s frontmatter id) is assigned a fresh id, persisted to its own .folder.md, and the original is untouched', async () => {
    const projects = makeProjectsFolder();
    const { vault, fileSystem, watcher } = setup([], [projects]);
    await fileSystem.writeFile(
      `${ROOT}/Projects/.folder.md`,
      '---\nid: folder-projects\nicon: 📁\nfavorite: true\n---\n'
    );

    // "Projects copy" duplicates the folder's own .folder.md verbatim,
    // including its id.
    await fileSystem.createDirectory(`${ROOT}/Projects copy`);
    await fileSystem.writeFile(
      `${ROOT}/Projects copy/.folder.md`,
      '---\nid: folder-projects\nicon: 📁\nfavorite: true\n---\n'
    );

    watcher.emit({ type: 'created', path: 'Projects copy', isDirectory: true });
    await flush();

    const originalStill = vault.getFolder('folder-projects');
    const copy = vault.getFolderByPath(`${ROOT}/Projects copy`);

    expect(originalStill).toBeDefined();
    expect(originalStill!.path).toBe(`${ROOT}/Projects`);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe('folder-projects');
    // Metadata besides the id survives the repair, not just the id itself.
    expect(copy!.metadata.icon).toBe('📁');
    expect(copy!.metadata.favorite).toBe(true);

    // The new id is written back to the duplicate's own .folder.md — a
    // future rescan must not encounter the same collision again.
    const onDisk = await fileSystem.readFile(`${ROOT}/Projects copy/.folder.md`);
    expect(onDisk).toContain(`id: ${copy!.id}`);

    // The original's own .folder.md is never touched.
    const originalOnDisk = await fileSystem.readFile(`${ROOT}/Projects/.folder.md`);
    expect(originalOnDisk).toContain('id: folder-projects');
  });

  it('created: a duplicated folder subtree with BOTH the folder\'s own id and its notes\' ids colliding gets every collision resolved and persisted independently', async () => {
    const projects = makeProjectsFolder();
    const original = buildPage('Projects/Roadmap.md', 'Roadmap content', 'page-roadmap');
    const { vault, fileSystem, watcher } = setup([original], [projects]);
    await fileSystem.writeFile(
      `${ROOT}/Projects/.folder.md`,
      '---\nid: folder-projects\n---\n'
    );

    await fileSystem.createDirectory(`${ROOT}/Projects copy`);
    await fileSystem.writeFile(
      `${ROOT}/Projects copy/.folder.md`,
      '---\nid: folder-projects\n---\n'
    );
    await fileSystem.writeFile(
      `${ROOT}/Projects copy/Roadmap.md`,
      '---\nid: page-roadmap\n---\nRoadmap content'
    );

    watcher.emit({ type: 'created', path: 'Projects copy', isDirectory: true });
    await flush();

    const originalFolder = vault.getFolder('folder-projects')!;
    const copyFolder = vault.getFolderByPath(`${ROOT}/Projects copy`)!;
    const originalPage = vault.getPage('page-roadmap')!;
    const copyPage = vault.getPageByPath(`${ROOT}/Projects copy/Roadmap.md`)!;

    expect(originalFolder.path).toBe(`${ROOT}/Projects`);
    expect(copyFolder.id).not.toBe('folder-projects');
    expect(originalPage.path).toBe(`${ROOT}/Projects/Roadmap.md`);
    expect(copyPage.id).not.toBe('page-roadmap');
    // The two independent collisions must not be resolved to the same id.
    expect(copyFolder.id).not.toBe(copyPage.id);
    expect(vault.folderCount).toBe(2);
    expect(vault.pageCount).toBe(2);

    const folderOnDisk = await fileSystem.readFile(`${ROOT}/Projects copy/.folder.md`);
    expect(folderOnDisk).toContain(`id: ${copyFolder.id}`);
    const pageOnDisk = await fileSystem.readFile(`${ROOT}/Projects copy/Roadmap.md`);
    expect(pageOnDisk).toContain(`id: ${copyPage.id}`);
  });

  it('created: a duplicate folder id resolved by sync survives a fresh full scan/reload — the repaired id is stable, not re-collided', async () => {
    const projects = makeProjectsFolder();
    const original = buildPage('Projects/Roadmap.md', 'Roadmap content', 'page-roadmap');
    const { vault, fileSystem, watcher } = setup([original], [projects]);
    // The original folder must also exist on disk (not just in the
    // pre-seeded Vault) so the later rescan can discover it too.
    await fileSystem.createDirectory(`${ROOT}/Projects`);
    await fileSystem.writeFile(
      `${ROOT}/Projects/.folder.md`,
      '---\nid: folder-projects\n---\n'
    );
    await fileSystem.writeFile(
      `${ROOT}/Projects/Roadmap.md`,
      '---\nid: page-roadmap\n---\nRoadmap content'
    );

    await fileSystem.createDirectory(`${ROOT}/Projects copy`);
    await fileSystem.writeFile(
      `${ROOT}/Projects copy/.folder.md`,
      '---\nid: folder-projects\n---\n'
    );
    await fileSystem.writeFile(
      `${ROOT}/Projects copy/Roadmap.md`,
      '---\nid: page-roadmap\n---\nRoadmap content'
    );

    watcher.emit({ type: 'created', path: 'Projects copy', isDirectory: true });
    await flush();

    const repairedFolderId = vault.getFolderByPath(`${ROOT}/Projects copy`)!.id;
    const repairedPageId = vault.getPageByPath(`${ROOT}/Projects copy/Roadmap.md`)!.id;

    // Simulate an app restart: scan the same on-disk state from scratch and
    // rebuild a brand-new Vault, exactly like VaultBuilder does at startup.
    const scanner = new VaultScanner(fileSystem);
    const scanResult = await scanner.scan(ROOT);
    const builder = new VaultBuilder(new FakeIdGenerator());
    const { vault: reloadedVault, reassignedFolderPaths, reassignedPagePaths } =
      builder.build(scanResult);

    // No collision is rediscovered — the repaired ids round-trip exactly.
    expect(reassignedFolderPaths.size).toBe(0);
    expect(reassignedPagePaths.size).toBe(0);
    expect(reloadedVault.getFolderByPath(`${ROOT}/Projects`)!.id).toBe('folder-projects');
    expect(reloadedVault.getFolderByPath(`${ROOT}/Projects copy`)!.id).toBe(repairedFolderId);
    expect(reloadedVault.getPageByPath(`${ROOT}/Projects/Roadmap.md`)!.id).toBe('page-roadmap');
    expect(reloadedVault.getPageByPath(`${ROOT}/Projects copy/Roadmap.md`)!.id).toBe(repairedPageId);
  });

  it('created: a folder with no .folder.md at all never gets one manufactured by duplicate-id repair', async () => {
    // A path-derived (frontmatter-less) folder id can never collide with
    // anything (see resolveDuplicateId) — this proves the repair pass
    // still never writes a .folder.md for a folder that never had one,
    // even when the subtree also contains an unrelated real collision.
    const original = buildPage('Projects/Roadmap.md', 'Roadmap content', 'page-roadmap');
    const { vault, fileSystem, watcher } = setup([original]);

    await fileSystem.createDirectory(`${ROOT}/Projects copy`);
    await fileSystem.writeFile(
      `${ROOT}/Projects copy/Roadmap.md`,
      '---\nid: page-roadmap\n---\nRoadmap content'
    );

    watcher.emit({ type: 'created', path: 'Projects copy', isDirectory: true });
    await flush();

    expect(vault.getFolderByPath(`${ROOT}/Projects copy`)).toBeDefined();
    expect(await fileSystem.exists(`${ROOT}/Projects copy/.folder.md`)).toBe(false);
  });

  it("created: Clutter's own reserved .clutter directory at the vault root is never treated as a folder to build, duplicate-check, or repair", async () => {
    const { vault, fileSystem, watcher } = setup();
    // .clutter already exists (VaultInitializer's job at real startup) —
    // simulate an external tool touching it, which must still never
    // surface as vault content.
    await fileSystem.createDirectory(`${ROOT}/.clutter`);
    await fileSystem.writeFile(`${ROOT}/.clutter/workspace.json`, '{}');

    watcher.emit({ type: 'created', path: '.clutter', isDirectory: true });
    await flush();

    expect(vault.getFolderByPath(`${ROOT}/.clutter`)).toBeUndefined();
    expect(await fileSystem.exists(`${ROOT}/.clutter/.folder.md`)).toBe(false);
  });

  it('created: a nested directory inside an unresolvable parent is safely ignored, same as a page would be', async () => {
    const { vault, fileSystem, watcher } = setup();
    await fileSystem.createDirectory(`${ROOT}/unknown-parent/Nested`);

    watcher.emit({ type: 'created', path: 'unknown-parent/Nested', isDirectory: true });
    await flush();

    expect(vault.getFolderByPath(`${ROOT}/unknown-parent/Nested`)).toBeUndefined();
  });

  it('deleted: an externally removed folder disappears from the vault, cascading to its descendants', async () => {
    const projects = makeProjectsFolder();
    const design = { ...makeArchiveSubfolder('folder-design', 'Design'), parentId: 'folder-projects', path: `${ROOT}/Projects/Design` };
    const notes = buildPage('Projects/Design/Notes.md', 'content', 'page-notes');
    const notesInDesign: Page = { ...notes, parentId: 'folder-design' };
    const { vault, watcher } = setup([notesInDesign], [projects, design]);

    watcher.emit({ type: 'deleted', path: 'Projects' });
    await flush();

    expect(vault.getFolder('folder-projects')).toBeUndefined();
    expect(vault.getFolder('folder-design')).toBeUndefined();
    expect(vault.getPage('page-notes')).toBeUndefined();
  });

  it('deleted: an unrelated sibling folder is untouched', async () => {
    const projects = makeProjectsFolder();
    const archive = makeArchiveFolder();
    const { vault, watcher } = setup([], [projects, archive]);

    watcher.emit({ type: 'deleted', path: 'Projects' });
    await flush();

    expect(vault.getFolder('folder-archive')).toBeDefined();
  });

  it('moved: an externally renamed folder keeps its id and updates its path — the folder-rename case', async () => {
    const projects = makeProjectsFolder();
    const { vault, watcher } = setup([], [projects]);

    watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Work' });
    await flush();

    const renamed = vault.getFolder('folder-projects');
    expect(renamed).toBeDefined();
    expect(renamed!.path).toBe(`${ROOT}/Work`);
    expect(renamed!.name).toBe('Work');
    expect(renamed!.parentId).toBeNull();
  });

  it('moved: an externally moved folder (reparented) updates path and parentId — the folder-move case, same event shape as rename', async () => {
    const projects = makeProjectsFolder();
    const archive = makeArchiveFolder();
    const { vault, watcher } = setup([], [projects, archive]);

    watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Archive/Projects' });
    await flush();

    const moved = vault.getFolder('folder-projects');
    expect(moved).toBeDefined();
    expect(moved!.path).toBe(`${ROOT}/Archive/Projects`);
    expect(moved!.parentId).toBe('folder-archive');
  });

  it('moved: cascades to descendant folders and pages', async () => {
    const projects = makeProjectsFolder();
    const design = { ...makeArchiveSubfolder('folder-design', 'Design'), parentId: 'folder-projects', path: `${ROOT}/Projects/Design` };
    const notes = buildPage('Projects/Design/Notes.md', 'content', 'page-notes');
    const notesInDesign: Page = { ...notes, parentId: 'folder-design' };
    const { vault, watcher } = setup([notesInDesign], [projects, design]);

    watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Work' });
    await flush();

    expect(vault.getFolder('folder-design')!.path).toBe(`${ROOT}/Work/Design`);
    expect(vault.getPage('page-notes')!.path).toBe(`${ROOT}/Work/Design/Notes.md`);
  });
});

describe('VaultSyncService: sync correctness', () => {
  it('dirty session protection: an external change replaces the Vault page but does not overwrite unsaved local edits', async () => {
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher, documentRegistry } = setup([existing]);

    // The user opens the page and makes an unsaved local edit.
    const session = documentRegistry.open(existing.id, existing.source.markdown);
    session.commit(new DocumentTransaction('My unsaved local edit'));
    expect(session.isDirty).toBe(true);

    // Meanwhile the file changes externally (e.g. edited in another app).
    fileSystem.seedFile(
      `${ROOT}/Note.md`,
      '---\nid: note-1\n---\nExternally changed body'
    );

    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();

    // Documented current behavior:
    // - The Vault's domain snapshot (Vault.getPage) is unconditionally
    //   replaced with the external content, regardless of session dirtiness.
    const vaultPage = vault.getPage('note-1')!;
    expect(vaultPage.source.markdown).toBe('Externally changed body');

    // - The open DocumentSession's live revision is left untouched because
    //   VaultSyncService checks `!session.isDirty` before committing the
    //   external content into the session, specifically to avoid clobbering
    //   unsaved user work.
    expect(session.currentRevision.markdown).toBe('My unsaved local edit');
    expect(session.isDirty).toBe(true);

    // Net effect (reported, not fixed): the Vault and the open session now
    // disagree about this page's content. If the user later saves,
    // PersistenceService/PagePersistenceCoordinator will serialize the
    // session's markdown ("My unsaved local edit") together with whatever
    // metadata the Vault currently holds (which includes the externally
    // changed page's metadata) — silently discarding the external edit's
    // body content without ever telling the user it existed.
  });

  it('repeated external changes to the same open page: every one of several consecutive external edits updates the open session, not just the first', async () => {
    // Regression test: DocumentSession.isDirty is `currentRevision !==
    // savedRevision`. Committing an externally-synced revision without
    // also marking it saved left isDirty permanently true after the very
    // first external change, which made every handler's `!session.isDirty`
    // guard block every subsequent external change to that same open page
    // — the note effectively stopped syncing after one update.
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { fileSystem, watcher, documentRegistry } = setup([existing]);

    const session = documentRegistry.open(existing.id, existing.source.markdown);
    expect(session.isDirty).toBe(false);

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nExternal edit 1');
    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();
    expect(session.currentRevision.markdown).toBe('External edit 1');
    expect(session.isDirty).toBe(false);

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nExternal edit 2');
    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();
    expect(session.currentRevision.markdown).toBe('External edit 2');
    expect(session.isDirty).toBe(false);

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nExternal edit 3');
    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();
    expect(session.currentRevision.markdown).toBe('External edit 3');
    expect(session.isDirty).toBe(false);
  });

  it('duplicate events: three identical changed events for the same content do not corrupt vault state', async () => {
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher } = setup([existing]);

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nStable body');

    let notificationCount = 0;
    vault.subscribe(() => {
      notificationCount += 1;
    });

    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();
    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();
    watcher.emit({ type: 'changed', path: 'Note.md' });
    await flush();

    const final = vault.getPage('note-1')!;
    expect(final.source.markdown).toBe('Stable body');
    expect(vault.pageCount).toBe(1);

    // No deduplication currently exists: each of the three identical events
    // is fully re-processed (read + parse + rebuild + replacePage), so the
    // Vault emits one change notification per event rather than collapsing
    // them. State stays correct here only because every event happened to
    // carry the same content — see the out-of-order test below for what
    // happens when they don't.
    expect(notificationCount).toBe(3);
  });

  it('FIXED (was a race): a slow read for an earlier change no longer resolves after a fast read for a later change', async () => {
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const vault = makeVault([existing]);
    const inner = new InMemoryVaultFileSystem();

    // Snapshots whatever content is on disk at the moment readFile is
    // called, then resolves after an artificial delay — modeling a slow
    // disk read for an event that fired earlier in wall-clock time.
    class SnapshotThenDelayFileSystem implements VaultFileSystem {
      private readonly delays: number[];
      constructor(
        private readonly innerFs: VaultFileSystem,
        delays: number[]
      ) {
        this.delays = [...delays];
      }
      exists(path: string) {
        return this.innerFs.exists(path);
      }
      createDirectory(path: string) {
        return this.innerFs.createDirectory(path);
      }
      readDirectory(path: string) {
        return this.innerFs.readDirectory(path);
      }
      writeFile(path: string, contents: string) {
        return this.innerFs.writeFile(path, contents);
      }
      deleteFile(path: string) {
        return this.innerFs.deleteFile(path);
      }
      moveFile(sourcePath: string, destinationPath: string) {
        return this.innerFs.moveFile(sourcePath, destinationPath);
      }
      async readFile(path: string): Promise<string> {
        const snapshot = await this.innerFs.readFile(path);
        const delay = this.delays.shift() ?? 0;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return snapshot;
      }
    }

    inner.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nFirst update');
    // First readFile call (for the first 'changed' event) is slow; the
    // second (for the second 'changed' event) would have resolved
    // immediately if it were allowed to start before the first settled.
    const fileSystem = new SnapshotThenDelayFileSystem(inner, [30, 0]);
    const watcher = new FakeVaultFileSystemWatcher();
    const documentRegistry = new DocumentRegistry();
    new VaultSyncService(
      vault,
      fileSystem,
      watcher,
      documentRegistry,
      new FrontmatterSerializer(),
      new FakeIdGenerator()
    );

    // Event 1: file changes to "First update".
    watcher.emit({ type: 'changed', path: 'Note.md' });

    // Before event 1's slow read resolves, the file changes again and a
    // second event fires.
    inner.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nSecond update');
    watcher.emit({ type: 'changed', path: 'Note.md' });

    // Let both async handlers fully settle.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const final = vault.getPage('note-1')!;

    // FIXED: both events resolve to the same SyncKey (the page already
    // exists, so both use { type: 'page', id: 'note-1' }), so
    // VaultSyncCoordinator forces the second event's entire operation —
    // including its readFile call — to wait until the first has fully
    // settled. Its readFile then snapshots whatever is on disk at that
    // later point, which by then is "Second update". The Vault correctly
    // ends up with the most recent content instead of regressing.
    expect(final.source.markdown).toBe('Second update');
  });

  it('duplicate changed events with different content still converge to the last-emitted content, in order', async () => {
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher } = setup([existing]);

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nUpdate 1');
    watcher.emit({ type: 'changed', path: 'Note.md' });

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nUpdate 2');
    watcher.emit({ type: 'changed', path: 'Note.md' });

    fileSystem.seedFile(`${ROOT}/Note.md`, '---\nid: note-1\n---\nUpdate 3');
    watcher.emit({ type: 'changed', path: 'Note.md' });

    await flush();
    await flush();
    await flush();

    const final = vault.getPage('note-1')!;
    expect(final.source.markdown).toBe('Update 3');
  });

  it('created event immediately followed by a changed event for the same new file does not race', async () => {
    const vault = makeVault();
    const inner = new InMemoryVaultFileSystem();

    class DelayedReadOnceFileSystem implements VaultFileSystem {
      private usedDelay = false;
      constructor(
        private readonly innerFs: VaultFileSystem,
        private readonly delayMs: number
      ) {}
      exists(path: string) {
        return this.innerFs.exists(path);
      }
      createDirectory(path: string) {
        return this.innerFs.createDirectory(path);
      }
      readDirectory(path: string) {
        return this.innerFs.readDirectory(path);
      }
      writeFile(path: string, contents: string) {
        return this.innerFs.writeFile(path, contents);
      }
      deleteFile(path: string) {
        return this.innerFs.deleteFile(path);
      }
      moveFile(sourcePath: string, destinationPath: string) {
        return this.innerFs.moveFile(sourcePath, destinationPath);
      }
      async readFile(path: string): Promise<string> {
        if (!this.usedDelay) {
          this.usedDelay = true;
          await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        }
        return this.innerFs.readFile(path);
      }
    }

    // The 'created' handler's read is slow (models a large initial write
    // still being flushed to disk); the file already holds its final
    // content by the time 'changed' fires moments later.
    inner.seedFile(`${ROOT}/New.md`, '---\nid: new-page\n---\nInitial content');
    const fileSystem = new DelayedReadOnceFileSystem(inner, 20);
    const watcher = new FakeVaultFileSystemWatcher();
    const documentRegistry = new DocumentRegistry();
    new VaultSyncService(
      vault,
      fileSystem,
      watcher,
      documentRegistry,
      new FrontmatterSerializer(),
      new FakeIdGenerator()
    );

    watcher.emit({ type: 'created', path: 'New.md', isDirectory: false });

    // Fires before 'created' has resolved. Before VaultSyncCoordinator
    // existed, handleChanged() would run concurrently, find no page yet
    // (addPage() hadn't happened), and silently no-op — discarding this
    // event's content forever, even though the file already had it.
    inner.seedFile(
      `${ROOT}/New.md`,
      '---\nid: new-page\n---\nEdited before create finished'
    );
    watcher.emit({ type: 'changed', path: 'New.md' });

    await new Promise((resolve) => setTimeout(resolve, 40));

    const page = vault.getPage('new-page');
    expect(page).toBeDefined();
    // FIXED: both events fall back to the same { type: 'path', ... } key
    // while the page doesn't exist yet, so 'changed' is forced to wait
    // until 'created' has added the page before it even attempts its own
    // read — at which point the page exists and the edit applies.
    expect(page!.source.markdown).toBe('Edited before create finished');
  });

  it('moved event followed by a changed event for the new path keeps the same page id and correct path', async () => {
    const existing = buildPage('old/Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher } = setup([existing]);

    watcher.emit({
      type: 'moved',
      fromPath: 'old/Note.md',
      toPath: 'new/Note.md',
    });
    await flush();

    fileSystem.seedFile(
      `${ROOT}/new/Note.md`,
      '---\nid: note-1\n---\nEdited after move'
    );
    watcher.emit({ type: 'changed', path: 'new/Note.md' });
    await flush();

    const final = vault.getPage('note-1')!;
    expect(final.id).toBe('note-1');
    expect(final.path).toBe(`${ROOT}/new/Note.md`);
    expect(final.source.markdown).toBe('Edited after move');
    expect(vault.getPageByPath(`${ROOT}/old/Note.md`)).toBeUndefined();
  });
});

describe('VaultSyncService: external archive reconciliation', () => {
  it('archived page moved Archive → Projects clears archive metadata, persists frontmatter, and appears in normal queries', async () => {
    const archivedPage = buildArchivedPage(
      'Archive/Clutter.md',
      'Archived body',
      'page-archived-1'
    );
    const { vault, fileSystem, watcher } = setup(
      [archivedPage],
      [makeArchiveFolder(), makeProjectsFolder()]
    );

    fileSystem.seedFile(
      `${ROOT}/Projects/Clutter.md`,
      archivedDiskDocument('page-archived-1', 'Archived body')
    );

    watcher.emit({
      type: 'moved',
      fromPath: 'Archive/Clutter.md',
      toPath: 'Projects/Clutter.md',
    });
    await flush();

    const restored = vault.getPage('page-archived-1')!;
    expect(restored.path).toBe(`${ROOT}/Projects/Clutter.md`);
    expect(restored.parentId).toBe('folder-projects');
    expect(restored.metadata.status).toBe('active');
    expect(restored.metadata.archivedAt).toBeNull();
    expect(restored.metadata.originalPath).toBeNull();
    expect(restored.metadata.originalParentId).toBeNull();
    expect(restored.source.markdown).toBe('Archived body');

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/Clutter.md`)!;
    expect(disk).toMatch(/status:\s*active/);
    expect(disk).not.toMatch(/status:\s*archived/);
    expect(disk).toMatch(/archivedAt:\s*null/);
    expect(disk).toMatch(/originalPath:\s*null/);
    expect(disk).toMatch(/originalParentId:\s*null/);

    const query = new VaultQuery(vault);
    expect(query.getChildPages('folder-projects').map((page) => page.id)).toContain(
      'page-archived-1'
    );
    expect(query.getArchivedPages().map((page) => page.id)).not.toContain(
      'page-archived-1'
    );
  });

  it('archived page moved Archive → Projects publishes exactly one consistent notification (no intermediate archived-at-new-path state)', async () => {
    const archivedPage = buildArchivedPage(
      'Archive/Clutter.md',
      'Archived body',
      'page-archived-consistency'
    );
    const { vault, fileSystem, watcher } = setup(
      [archivedPage],
      [makeArchiveFolder(), makeProjectsFolder()]
    );

    fileSystem.seedFile(
      `${ROOT}/Projects/Clutter.md`,
      archivedDiskDocument('page-archived-consistency', 'Archived body')
    );

    const observedStates: Array<{ path: string; status: string }> = [];
    vault.subscribe(() => {
      const page = vault.getPage('page-archived-consistency')!;
      observedStates.push({ path: page.path, status: page.metadata.status });
    });

    watcher.emit({
      type: 'moved',
      fromPath: 'Archive/Clutter.md',
      toPath: 'Projects/Clutter.md',
    });
    await flush();

    // Exactly one notification is published for this move, and it already
    // carries the fully-corrected final state — never an intermediate
    // snapshot with the new path but still-archived status.
    expect(observedStates).toHaveLength(1);
    expect(observedStates[0]).toEqual({
      path: `${ROOT}/Projects/Clutter.md`,
      status: 'active',
    });
  });

  it('active page moved Projects → Projects leaves metadata untouched', async () => {
    const activePage = buildPage('Projects/Note.md', 'Active body', 'page-active-1');
    const activeWithMetadata: Page = {
      ...activePage,
      parentId: 'folder-projects',
      metadata: {
        ...activePage.metadata,
        favorite: true,
        icon: '📌',
      },
    };
    const { vault, fileSystem, watcher } = setup(
      [activeWithMetadata],
      [makeProjectsFolder()]
    );

    fileSystem.seedFile(
      `${ROOT}/Projects/Renamed.md`,
      '---\nid: page-active-1\nfavorite: true\nicon: 📌\n---\nActive body'
    );

    watcher.emit({
      type: 'moved',
      fromPath: 'Projects/Note.md',
      toPath: 'Projects/Renamed.md',
    });
    await flush();

    const moved = vault.getPage('page-active-1')!;
    expect(moved.path).toBe(`${ROOT}/Projects/Renamed.md`);
    expect(moved.metadata.status).toBe('active');
    expect(moved.metadata.favorite).toBe(true);
    expect(moved.metadata.icon).toBe('📌');
    expect(moved.metadata.archivedAt).toBeNull();

    expect(fileSystem.getFileSync(`${ROOT}/Projects/Renamed.md`)).toBe(
      '---\nid: page-active-1\nfavorite: true\nicon: 📌\n---\nActive body'
    );
  });

  it('normal move (no archive repair needed) still publishes exactly one notification with no extra read/write', async () => {
    const activePage = buildPage('Projects/Plain.md', 'Plain body', 'page-plain-1');
    const activeWithParent: Page = {
      ...activePage,
      parentId: 'folder-projects',
    };
    const { vault, fileSystem, watcher } = setup(
      [activeWithParent],
      [makeProjectsFolder()]
    );

    let notificationCount = 0;
    vault.subscribe(() => {
      notificationCount += 1;
    });

    watcher.emit({
      type: 'moved',
      fromPath: 'Projects/Plain.md',
      toPath: 'Projects/Renamed-Plain.md',
    });
    await flush();

    expect(notificationCount).toBe(1);

    const moved = vault.getPage('page-plain-1')!;
    expect(moved.path).toBe(`${ROOT}/Projects/Renamed-Plain.md`);
    expect(moved.metadata.status).toBe('active');

    // No reconciliation write occurred: the file at the destination was
    // never seeded/written by sync, since the original file only ever
    // "existed" via the in-memory move (there's nothing to read/rewrite
    // for a page that doesn't need archive-metadata repair).
    expect(fileSystem.getFileSync(`${ROOT}/Projects/Renamed-Plain.md`)).toBeUndefined();
  });

  it('archived page moved within Archive leaves metadata untouched', async () => {
    const archivedPage = buildArchivedPage(
      'Archive/Old/Note.md',
      'Still archived',
      'page-archived-2'
    );
    const archivedInSubfolder: Page = {
      ...archivedPage,
      parentId: 'folder-archive-old',
    };
    const { vault, fileSystem, watcher } = setup(
      [archivedInSubfolder],
      [makeArchiveFolder(), makeArchiveSubfolder('folder-archive-old', 'Old')]
    );

    fileSystem.seedFile(
      `${ROOT}/Archive/New/Note.md`,
      archivedDiskDocument('page-archived-2', 'Still archived')
    );

    watcher.emit({
      type: 'moved',
      fromPath: 'Archive/Old/Note.md',
      toPath: 'Archive/New/Note.md',
    });
    await flush();

    const moved = vault.getPage('page-archived-2')!;
    expect(moved.path).toBe(`${ROOT}/Archive/New/Note.md`);
    expect(moved.metadata.status).toBe('archived');
    expect(moved.metadata.archivedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(moved.metadata.originalPath).toBe(`${ROOT}/Inbox/Note.md`);
    expect(moved.metadata.originalParentId).toBe('folder-inbox');

    expect(fileSystem.getFileSync(`${ROOT}/Archive/New/Note.md`)).toBe(
      archivedDiskDocument('page-archived-2', 'Still archived')
    );

    const query = new VaultQuery(vault);
    expect(query.getArchivedPages().map((page) => page.id)).toContain(
      'page-archived-2'
    );
  });

  it('active page moved into Archive externally stays active and is not auto-archived', async () => {
    const activePage = buildPage('Projects/Note.md', 'Active body', 'page-active-2');
    const activeWithParent: Page = {
      ...activePage,
      parentId: 'folder-projects',
    };
    const { vault, fileSystem, watcher } = setup(
      [activeWithParent],
      [makeArchiveFolder(), makeProjectsFolder()]
    );

    fileSystem.seedFile(
      `${ROOT}/Archive/Note.md`,
      '---\nid: page-active-2\nstatus: active\n---\nActive body'
    );

    watcher.emit({
      type: 'moved',
      fromPath: 'Projects/Note.md',
      toPath: 'Archive/Note.md',
    });
    await flush();

    const moved = vault.getPage('page-active-2')!;
    expect(moved.path).toBe(`${ROOT}/Archive/Note.md`);
    expect(moved.metadata.status).toBe('active');
    expect(moved.metadata.archivedAt).toBeNull();
    expect(moved.metadata.originalPath).toBeNull();

    expect(fileSystem.getFileSync(`${ROOT}/Archive/Note.md`)).toBe(
      '---\nid: page-active-2\nstatus: active\n---\nActive body'
    );

    const query = new VaultQuery(vault);
    expect(query.getArchivedPages().map((page) => page.id)).not.toContain(
      'page-active-2'
    );
  });

  it('stale archive metadata is repaired via changed event without a moved event', async () => {
    const stalePage = buildArchivedPage(
      'Projects/Note.md',
      'Externally restored body',
      'page-stale-1'
    );
    const staleWithParent: Page = {
      ...stalePage,
      parentId: 'folder-projects',
    };
    const { vault, fileSystem, watcher } = setup(
      [staleWithParent],
      [makeProjectsFolder()]
    );

    fileSystem.seedFile(
      `${ROOT}/Projects/Note.md`,
      archivedDiskDocument('page-stale-1', 'Externally restored body')
    );

    watcher.emit({ type: 'changed', path: 'Projects/Note.md' });
    await flush();

    const repaired = vault.getPage('page-stale-1')!;
    expect(repaired.metadata.status).toBe('active');
    expect(repaired.metadata.archivedAt).toBeNull();
    expect(repaired.source.markdown).toBe('Externally restored body');

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/Note.md`)!;
    expect(disk).toMatch(/status:\s*active/);
  });

  it('created event with stale archive metadata outside Archive is repaired', async () => {
    const { vault, fileSystem, watcher } = setup(
      [],
      [makeProjectsFolder()]
    );

    fileSystem.seedFile(
      `${ROOT}/Projects/Imported.md`,
      archivedDiskDocument('page-imported-1', 'Imported while closed')
    );

    watcher.emit({ type: 'created', path: 'Projects/Imported.md', isDirectory: false });
    await flush();

    const page = vault.getPage('page-imported-1')!;
    expect(page.path).toBe(`${ROOT}/Projects/Imported.md`);
    expect(page.metadata.status).toBe('active');
    expect(page.metadata.archivedAt).toBeNull();

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/Imported.md`)!;
    expect(disk).toMatch(/status:\s*active/);
  });
});

// ADR-026's Sync amendment: an archived folder moved out of Archive/
// externally must be unarchived immediately, live — mirroring the page
// coverage above one aggregate over.
function makeArchivedProjectsFolder(): Folder {
  return {
    ...makeProjectsFolder(),
    id: 'folder-archived-projects',
    metadata: {
      ...defaultFolderMetadata,
      status: 'archived',
      archivedAt: '2024-01-01T00:00:00.000Z',
      originalPath: `${ROOT}/Inbox`,
      originalParentId: null,
    },
  };
}

describe('VaultSyncService: external folder archive reconciliation (ADR-026 Sync amendment)', () => {
  it('archived folder moved Archive → Projects clears archive metadata, persists .folder.md, and appears in normal queries', async () => {
    const archivedFolder: Folder = {
      ...makeArchivedProjectsFolder(),
      path: `${ROOT}/Archive/Projects`,
      parentId: 'folder-archive',
    };
    const { vault, fileSystem, watcher } = setup([], [makeArchiveFolder(), archivedFolder]);

    watcher.emit({
      type: 'moved',
      fromPath: 'Archive/Projects',
      toPath: 'Projects',
    });
    await flush();

    const restored = vault.getFolder('folder-archived-projects')!;
    expect(restored.path).toBe(`${ROOT}/Projects`);
    expect(restored.parentId).toBeNull();
    expect(restored.metadata.status).toBe('active');
    expect(restored.metadata.archivedAt).toBeNull();
    expect(restored.metadata.originalPath).toBeNull();
    expect(restored.metadata.originalParentId).toBeNull();

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/.folder.md`)!;
    expect(disk).toMatch(/status:\s*active/);
    expect(disk).not.toMatch(/status:\s*archived/);

    const query = new VaultQuery(vault);
    expect(query.getRootFolders().map((folder) => folder.id)).toContain(
      'folder-archived-projects'
    );
  });

  it('archived folder moved out of Archive publishes exactly one consistent notification (no intermediate archived-at-new-path state)', async () => {
    const archivedFolder: Folder = {
      ...makeArchivedProjectsFolder(),
      path: `${ROOT}/Archive/Projects`,
      parentId: 'folder-archive',
    };
    const { vault, watcher } = setup([], [makeArchiveFolder(), archivedFolder]);

    const observedStates: Array<{ path: string; status: string }> = [];
    vault.subscribe(() => {
      const folder = vault.getFolder('folder-archived-projects')!;
      observedStates.push({ path: folder.path, status: folder.metadata.status });
    });

    watcher.emit({
      type: 'moved',
      fromPath: 'Archive/Projects',
      toPath: 'Projects',
    });
    await flush();

    expect(observedStates).toHaveLength(1);
    expect(observedStates[0]).toEqual({ path: `${ROOT}/Projects`, status: 'active' });
  });

  it('active folder moved into Archive externally stays active and is not auto-archived', async () => {
    const projects = makeProjectsFolder();
    const { vault, fileSystem, watcher } = setup([], [makeArchiveFolder(), projects]);

    watcher.emit({
      type: 'moved',
      fromPath: 'Projects',
      toPath: 'Archive/Projects',
    });
    await flush();

    const moved = vault.getFolder('folder-projects')!;
    expect(moved.path).toBe(`${ROOT}/Archive/Projects`);
    expect(moved.parentId).toBe('folder-archive');
    expect(moved.metadata.status).toBe('active');
    expect(moved.metadata.archivedAt).toBeNull();

    // No reconciliation write occurred — an active folder moving into
    // Archive/ needs no repair, so nothing is written to its .folder.md.
    expect(fileSystem.getFileSync(`${ROOT}/Archive/Projects/.folder.md`)).toBeUndefined();

    const query = new VaultQuery(vault);
    expect(query.getChildFolders('folder-archive').map((f) => f.id)).toContain(
      'folder-projects'
    );
  });

  it('archived folder moved within Archive leaves metadata untouched', async () => {
    const archivedSubfolder: Folder = {
      ...makeArchiveSubfolder('folder-archived-old', 'Old'),
      metadata: {
        ...defaultFolderMetadata,
        status: 'archived',
        archivedAt: '2024-01-01T00:00:00.000Z',
        originalPath: `${ROOT}/Inbox`,
        originalParentId: null,
      },
    };
    const { vault, watcher } = setup([], [makeArchiveFolder(), archivedSubfolder]);

    watcher.emit({
      type: 'moved',
      fromPath: 'Archive/Old',
      toPath: 'Archive/New',
    });
    await flush();

    const moved = vault.getFolder('folder-archived-old')!;
    expect(moved.path).toBe(`${ROOT}/Archive/New`);
    expect(moved.metadata.status).toBe('archived');
    expect(moved.metadata.archivedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(moved.metadata.originalPath).toBe(`${ROOT}/Inbox`);
  });

  it('unarchiving a folder never touches descendant folders/pages — only the moved folder\'s own metadata is repaired', async () => {
    const archivedFolder: Folder = {
      ...makeArchivedProjectsFolder(),
      path: `${ROOT}/Archive/Projects`,
      parentId: 'folder-archive',
    };
    const nestedFolder: Folder = {
      id: 'folder-design',
      name: 'Design',
      path: `${ROOT}/Archive/Projects/Design`,
      parentId: 'folder-archived-projects',
      metadata: defaultFolderMetadata,
    };
    const nestedPage = buildPage('Archive/Projects/Design/Notes.md', 'content', 'page-notes');
    const nestedPageInDesign: Page = { ...nestedPage, parentId: 'folder-design' };
    const { vault, watcher } = setup(
      [nestedPageInDesign],
      [makeArchiveFolder(), archivedFolder, nestedFolder]
    );

    watcher.emit({
      type: 'moved',
      fromPath: 'Archive/Projects',
      toPath: 'Projects',
    });
    await flush();

    expect(vault.getFolder('folder-archived-projects')!.metadata.status).toBe('active');

    // Descendants relocate (path/parentId cascade) but their own metadata
    // — never individually archived by the parent's archival — is
    // byte-for-byte unchanged.
    const design = vault.getFolder('folder-design')!;
    expect(design.path).toBe(`${ROOT}/Projects/Design`);
    expect(design.parentId).toBe('folder-archived-projects');
    expect(design.metadata).toEqual(defaultFolderMetadata);

    const notes = vault.getPage('page-notes')!;
    expect(notes.path).toBe(`${ROOT}/Projects/Design/Notes.md`);
    expect(notes.parentId).toBe('folder-design');
    expect(notes.metadata.status).toBe('active');
  });

  it('normal folder move (no archive repair needed) still publishes exactly one notification with no extra read/write', async () => {
    const projects = makeProjectsFolder();
    const { vault, fileSystem, watcher } = setup([], [projects]);

    let notificationCount = 0;
    vault.subscribe(() => {
      notificationCount += 1;
    });

    watcher.emit({ type: 'moved', fromPath: 'Projects', toPath: 'Work' });
    await flush();

    expect(notificationCount).toBe(1);
    expect(vault.getFolder('folder-projects')!.path).toBe(`${ROOT}/Work`);
    expect(fileSystem.getFileSync(`${ROOT}/Work/.folder.md`)).toBeUndefined();
  });
});

describe('VaultSyncService: external .folder.md edit reconciliation', () => {
  it('status hand-edited to archived in place clears the stray status without moving the folder', async () => {
    const projects = makeProjectsFolder();
    const { vault, fileSystem, watcher } = setup([], [projects]);

    await fileSystem.writeFile(
      `${ROOT}/Projects/.folder.md`,
      ['---', 'id: folder-projects', 'status: archived', '---', ''].join('\n')
    );

    watcher.emit({ type: 'changed', path: 'Projects/.folder.md' });
    await flush();

    const reconciled = vault.getFolder('folder-projects')!;
    expect(reconciled.path).toBe(`${ROOT}/Projects`);
    expect(reconciled.metadata.status).toBe('active');
    expect(reconciled.metadata.archivedAt).toBeNull();

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/.folder.md`)!;
    expect(disk).toMatch(/status:\s*active/);
    expect(disk).not.toMatch(/status:\s*archived/);
  });

  it('unrelated field edited in place with status unchanged performs no reconciliation write', async () => {
    const projects = makeProjectsFolder();
    const { vault, fileSystem, watcher } = setup([], [projects]);

    await fileSystem.writeFile(
      `${ROOT}/Projects/.folder.md`,
      ['---', 'id: folder-projects', 'status: active', 'icon: 📁', '---', ''].join('\n')
    );

    let notificationCount = 0;
    vault.subscribe(() => {
      notificationCount += 1;
    });

    watcher.emit({ type: 'changed', path: 'Projects/.folder.md' });
    await flush();

    expect(notificationCount).toBe(0);
    expect(vault.getFolder('folder-projects')!.metadata.status).toBe('active');
  });

  it('archived folder edited in place while still inside Archive/ is left untouched (repair is one-directional)', async () => {
    const archivedFolder: Folder = {
      ...makeArchivedProjectsFolder(),
      path: `${ROOT}/Archive/Projects`,
      parentId: 'folder-archive',
    };
    const { vault, fileSystem, watcher } = setup([], [makeArchiveFolder(), archivedFolder]);

    await fileSystem.writeFile(
      `${ROOT}/Archive/Projects/.folder.md`,
      [
        '---',
        'id: folder-archived-projects',
        'status: archived',
        'archivedAt: 2024-01-01T00:00:00.000Z',
        '---',
        '',
      ].join('\n')
    );

    watcher.emit({ type: 'changed', path: 'Archive/Projects/.folder.md' });
    await flush();

    expect(vault.getFolder('folder-archived-projects')!.metadata.status).toBe('archived');
  });

  it('changed event for a .folder.md whose folder is not yet tracked is a no-op', async () => {
    const { vault, watcher } = setup([], []);

    watcher.emit({ type: 'changed', path: 'Unknown/.folder.md' });
    await flush();

    expect(vault.getFolder('folder-projects')).toBeUndefined();
  });
});
