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
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
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
    new FrontmatterSerializer()
  );

  return { vault, fileSystem, watcher, documentRegistry, service };
}

describe('VaultSyncService', () => {
  it('created: a new markdown file appearing on disk adds a page to the vault', async () => {
    const { vault, fileSystem, watcher } = setup();
    fileSystem.seedFile(`${ROOT}/New.md`, '---\nid: new-page\n---\nHello');

    watcher.emit({ type: 'created', path: 'New.md' });
    await flush();

    const page = vault.getPageByPath(`${ROOT}/New.md`);
    expect(page).toBeDefined();
    expect(page!.id).toBe('new-page');
    expect(page!.source.markdown).toBe('Hello');
  });

  it('created: a new page inside an unknown/unresolvable parent folder is safely ignored', async () => {
    const { vault, fileSystem, watcher } = setup();

    fileSystem.seedFile(
      `${ROOT}/unknown-folder/New.md`,
      '---\nid: orphan\n---\nBody'
    );

    watcher.emit({ type: 'created', path: 'unknown-folder/New.md' });
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

    watcher.emit({ type: 'created', path: 'notes/New.md' });
    await flush();

    const page = vault.getPage('nested-page');
    expect(page).toBeDefined();
    expect(page!.parentId).toBe('folder-1');
  });
});

describe('VaultSyncService: sync correctness', () => {
  it('dirty session protection: an external change replaces the Vault page but does not overwrite unsaved local edits', async () => {
    const existing = buildPage('Note.md', 'Original body', 'note-1');
    const { vault, fileSystem, watcher, documentRegistry } = setup([existing]);

    // The user opens the page and makes an unsaved local edit.
    const session = documentRegistry.open(existing);
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
      new FrontmatterSerializer()
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
      new FrontmatterSerializer()
    );

    watcher.emit({ type: 'created', path: 'New.md' });

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

    watcher.emit({ type: 'created', path: 'Projects/Imported.md' });
    await flush();

    const page = vault.getPage('page-imported-1')!;
    expect(page.path).toBe(`${ROOT}/Projects/Imported.md`);
    expect(page.metadata.status).toBe('active');
    expect(page.metadata.archivedAt).toBeNull();

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/Imported.md`)!;
    expect(disk).toMatch(/status:\s*active/);
  });
});
