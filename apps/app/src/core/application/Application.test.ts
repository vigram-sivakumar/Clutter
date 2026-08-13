import { describe, expect, it, vi } from 'vitest';
import { Application } from './Application';
import { PageOperations } from './page/PageOperations';
import { FolderOperations } from './folder/FolderOperations';
import { TaskOperations } from './task/TaskOperations';
import { NavigationRouter } from './navigation/NavigationRouter';
import { VaultSyncService } from '../vault/sync/VaultSyncService';
import { EffectivePageState } from './page/EffectivePageState';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { VaultQuery } from '../vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../vault/ingest/PageBuilder';
import type { Page } from '../vault/models/Page';
import type { Folder } from '../vault/models/Folder';

// close() reaches LocalFileSystemWatcher.stop(), which calls Tauri's
// invoke('stop_vault_watcher') — real Platform IPC with no runtime to
// answer it under vitest, same reason bootstrap()'s own Platform pieces
// are documented above as untestable here. Mocked at the module boundary,
// test-file-local only, so close()'s pure in-memory disposal ordering
// (the actual thing under test) becomes reachable at all.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

/**
 * bootstrap()'s own Platform construction (LocalVaultProvider,
 * LocalFileSystemWatcher) is Tauri-backed and cannot run under vitest — this
 * was already true before Phase 4 (no Application test existed at all).
 * What's newly testable is attachVault() in isolation, which is exactly
 * where the "every subsystem constructed exactly once" invariant (spec §11's
 * testing strategy) actually lives, independent of Platform.
 */
function makeVault(): Vault {
  return new Vault(
    '/vault',
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

describe('Application.attachVault', () => {
  it('constructs every vault-dependent subsystem exactly once', () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();
    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());

    const application = new Application(vault, fileSystem, selfWriteRegistry);
    application.attachVault(vault, pageCreator, new DailyNoteService());

    expect(application.pageOperations).toBeInstanceOf(PageOperations);
    expect(application.folderOperations).toBeInstanceOf(FolderOperations);
    expect(application.taskOperations).toBeInstanceOf(TaskOperations);
    expect(application.navigation).toBeInstanceOf(NavigationRouter);
    expect(application.vaultSyncService).toBeInstanceOf(VaultSyncService);
    // ADR-020, M2: constructed alongside the other vault-dependent
    // subsystems, after query/workspace/pageOperations all exist.
    expect(application.effectivePageState).toBeInstanceOf(EffectivePageState);
  });

  it('exposes the vault passed to the constructor unchanged', () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();

    const application = new Application(vault, fileSystem, selfWriteRegistry);

    expect(application.vault).toBe(vault);
  });

  it('constructs a single shared VaultQuery instance in the constructor, per rule 6', () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();

    const application = new Application(vault, fileSystem, selfWriteRegistry);

    expect(application.query).toBeInstanceOf(VaultQuery);
  });
});

describe('Application.close — EffectivePageState disposal (ADR-020, M2)', () => {
  function attach(): Application {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();
    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());

    const application = new Application(vault, fileSystem, selfWriteRegistry);
    application.attachVault(vault, pageCreator, new DailyNoteService());

    return application;
  }

  it('disposes EffectivePageState exactly once, even across repeated close() calls', async () => {
    const application = attach();
    const disposeSpy = vi.spyOn(application.effectivePageState, 'dispose');

    await application.close();
    await application.close();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('disposes EffectivePageState before clearing the DocumentRegistry', async () => {
    const application = attach();
    const order: string[] = [];

    vi.spyOn(application.effectivePageState, 'dispose').mockImplementation(() => {
      order.push('effectivePageState.dispose');
    });
    vi.spyOn(application.documentRegistry, 'clear').mockImplementation(() => {
      order.push('documentRegistry.clear');
    });

    await application.close();

    expect(order).toEqual(['effectivePageState.dispose', 'documentRegistry.clear']);
  });

  it('shutdown remains idempotent: a second close() call is a safe no-op', async () => {
    const application = attach();

    await expect(application.close()).resolves.toBeUndefined();
    await expect(application.close()).resolves.toBeUndefined();
  });
});

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

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function buildPage(path: string, id: string, parentId: string | null = null): Page {
  return new PageBuilder().build({
    parentId,
    page: {
      path: `/vault/${path}`,
      directoryPath: '/vault',
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
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

/**
 * Whether the app-recovers-to-a-valid-view mechanism (Application-level
 * Vault subscription, added alongside PageOperations.delete()/
 * FolderOperations.delete()'s existing close()-then-fallback-if-empty
 * shape) covers external deletion — a Vault mutation nobody routed through
 * PageOperations/FolderOperations, the same shape VaultSyncService.
 * handleDeleted actually produces. Exercised here by mutating the Vault
 * directly (vault.removePage/removeFolder), the same primitive
 * handleDeleted itself calls — deliberately below Sync, since the
 * reconciliation this covers is keyed only on Vault state, not on how it
 * changed.
 */
describe('Application: recovers when the active Vault resource disappears (external deletion)', () => {
  function attachWith(pages: Page[], folders: Folder[]) {
    const vault = new Vault(
      '/vault',
      pages,
      folders,
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder()
    );
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();
    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());

    const application = new Application(vault, fileSystem, selfWriteRegistry);
    application.attachVault(vault, pageCreator, new DailyNoteService());

    return { application, vault, fileSystem };
  }

  it('active note deleted externally: workspace recovers to a valid view, not the deleted id', async () => {
    const note = buildPage('Note.md', 'page-note');
    const { application, vault } = attachWith([note], []);

    await application.pageOperations.open('page-note');
    expect(application.workspace.activePageId).toBe('page-note');

    vault.removePage('page-note');

    expect(application.workspace.activePageId).not.toBe('page-note');
    expect(application.workspace.activeView).not.toBeNull();
  });

  it('active folder deleted externally: workspace recovers to a valid view, not the deleted id', async () => {
    const folder = makeFolder('folder-projects', '/vault/Projects');
    const { application, vault } = attachWith([], [folder]);

    await application.folderOperations.open('folder-projects');
    expect(application.workspace.activeFolderId).toBe('folder-projects');

    vault.removeFolder('folder-projects');

    expect(application.workspace.activeFolderId).not.toBe('folder-projects');
    expect(application.workspace.activeView).not.toBeNull();
  });

  it('active note removed because its containing folder is deleted externally: workspace recovers', async () => {
    const folder = makeFolder('folder-projects', '/vault/Projects');
    const note = buildPage('Projects/Note.md', 'page-note', 'folder-projects');
    const { application, vault } = attachWith([note], [folder]);

    await application.pageOperations.open('page-note');
    expect(application.workspace.activePageId).toBe('page-note');

    // Vault.removeFolder's own cascade removes the descendant page too —
    // the same cascade VaultSyncService.handleDeleted relies on for a
    // real external folder delete.
    vault.removeFolder('folder-projects');

    expect(application.workspace.activePageId).not.toBe('page-note');
    expect(application.workspace.activeView).not.toBeNull();
  });

  it('active Archive folder deleted externally: recovers via the same general mechanism, no Archive-specific branch', async () => {
    const archiveFolder = makeFolder('folder-archive', '/vault/Archive');
    const { application, vault } = attachWith([], [archiveFolder]);

    await application.folderOperations.open('folder-archive');
    expect(application.workspace.activeFolderId).toBe('folder-archive');

    vault.removeFolder('folder-archive');

    expect(application.workspace.activeFolderId).not.toBe('folder-archive');
    expect(application.workspace.activeView).not.toBeNull();
  });

  it('non-active resource deleted externally: no navigation change', async () => {
    const noteA = buildPage('A.md', 'page-a');
    const noteB = buildPage('B.md', 'page-b');
    const { application, vault } = attachWith([noteA, noteB], []);

    await application.pageOperations.open('page-a');
    expect(application.workspace.activePageId).toBe('page-a');

    vault.removePage('page-b');

    expect(application.workspace.activePageId).toBe('page-a');
  });

  it('restores the previously-open note instead of the fallback when the active note is externally deleted', async () => {
    const noteA = buildPage('A.md', 'page-a');
    const noteB = buildPage('B.md', 'page-b');
    const { application, vault } = attachWith([noteA, noteB], []);

    await application.pageOperations.open('page-b');
    await application.pageOperations.open('page-a');
    expect(application.workspace.activePageId).toBe('page-a');

    vault.removePage('page-a');

    // Workspace's own openPageIds history restores page-b — the fallback
    // page is never consulted because activeView was never actually empty.
    expect(application.workspace.activePageId).toBe('page-b');
  });

  it('falls back only when genuinely no valid active view remains, not merely on any deletion', async () => {
    const noteA = buildPage('A.md', 'page-a');
    const noteB = buildPage('B.md', 'page-b');
    const { application, vault } = attachWith([noteA, noteB], []);

    await application.pageOperations.open('page-b');
    await application.pageOperations.open('page-a');

    vault.removePage('page-a');

    // A previous view existed, so the fallback page was never opened —
    // the restored view is exactly the previously-open note, not a fresh
    // Daily Note draft.
    expect(application.workspace.activePageId).toBe('page-b');
    expect(application.workspace.openPages).not.toContain('page-a');
  });

  it('active page deleted, and the previous open page was also independently deleted earlier: reconciliation keeps checking until it finds a valid open page', async () => {
    const noteA = buildPage('A.md', 'page-a');
    const noteB = buildPage('B.md', 'page-b');
    const noteC = buildPage('C.md', 'page-c');
    const { application, vault } = attachWith([noteA, noteB, noteC], []);

    // openPageIds ends up [page-a, page-c, page-b] — page-b active.
    await application.pageOperations.open('page-a');
    await application.pageOperations.open('page-c');
    await application.pageOperations.open('page-b');
    expect(application.workspace.activePageId).toBe('page-b');

    // page-c is deleted while it's a background tab — Workspace stays
    // Vault-oblivious, so nothing prunes it from openPageIds yet; it's
    // still sitting there as the next fallback candidate.
    vault.removePage('page-c');
    expect(application.workspace.activePageId).toBe('page-b');

    // Deleting the active page (page-b) makes closePage() fall back to
    // openPageIds' new tail, page-c — which is already gone. A single
    // check-and-fix pass would land there and PageHost would crash on it;
    // the loop must keep going until it reaches the genuinely valid page-a.
    vault.removePage('page-b');

    expect(application.workspace.activePageId).toBe('page-a');
    expect(vault.getPage(application.workspace.activePageId!)).toBeDefined();
  });

  it('multiple open pages deleted together by one folder cascade: no invalid activeView remains, falls back to a still-valid open page', async () => {
    const folder = makeFolder('folder-projects', '/vault/Projects');
    const noteA = buildPage('Projects/A.md', 'page-a', 'folder-projects');
    const noteB = buildPage('Projects/B.md', 'page-b', 'folder-projects');
    const noteSafe = buildPage('Safe.md', 'page-safe');
    const { application, vault } = attachWith([noteA, noteB, noteSafe], [folder]);

    // openPageIds ends up [page-safe, page-a, page-b] — page-b active.
    await application.pageOperations.open('page-safe');
    await application.pageOperations.open('page-a');
    await application.pageOperations.open('page-b');
    expect(application.workspace.activePageId).toBe('page-b');

    // One Vault mutation removes both open tabs (page-a and page-b) in a
    // single notify() — closePage()'s naive fallback would land on
    // page-a, itself also just removed by this same cascade.
    vault.removeFolder('folder-projects');

    expect(application.workspace.activePageId).toBe('page-safe');
    expect(vault.getPage(application.workspace.activePageId!)).toBeDefined();
  });

  it('multiple open pages deleted together with no valid open page left: falls back to today\'s Daily Note', async () => {
    const folder = makeFolder('folder-projects', '/vault/Projects');
    const noteA = buildPage('Projects/A.md', 'page-a', 'folder-projects');
    const noteB = buildPage('Projects/B.md', 'page-b', 'folder-projects');
    const { application, vault } = attachWith([noteA, noteB], [folder]);

    await application.pageOperations.open('page-a');
    await application.pageOperations.open('page-b');
    expect(application.workspace.activePageId).toBe('page-b');

    const openSpy = vi.spyOn(application.pageOperations, 'open');
    const openAtPathSpy = vi.spyOn(application.pageOperations, 'openAtPath');

    vault.removeFolder('folder-projects');

    // No open page survives, so the loop settles on an empty activeView
    // and openFallbackPage() (today's Daily Note) runs exactly once.
    expect(openSpy.mock.calls.length + openAtPathSpy.mock.calls.length).toBe(1);
    expect(application.workspace.activeView).not.toBeNull();
    expect(application.workspace.activePageId).not.toBe('page-a');
    expect(application.workspace.activePageId).not.toBe('page-b');
  });

  // Verifies the new subscription cannot double-fire alongside
  // PageOperations.delete()'s/FolderOperations.delete()'s own existing
  // close()-then-fallback-if-empty sequence. vault.removePage()/
  // removeFolder() (called from inside the Gate operation these methods
  // await) already fires notify() synchronously, before either method
  // reaches its own workspace.closePage()/closeFolder() lines — so the new
  // subscription's own fallback (also fully synchronous: PageOperations.
  // open()/openAtPath() set workspace.activeView with no `await` before
  // doing so) always lands first. By the time delete()'s own post-enqueue
  // check runs, activeView is already non-null, so its own fallback call is
  // a no-op, and its own closePage()/closeFolder() call is a no-op too
  // (Workspace.closePage/closeFolder's own existing "already not open"
  // guard). Spying on PageOperations.open/openAtPath — openFallbackPage's
  // only two possible targets — makes this a count, not an inference.
  it('app-initiated PageOperations.delete() of the sole active page opens the fallback exactly once', async () => {
    const note = buildPage('Note.md', 'page-note');
    const { application, fileSystem } = attachWith([note], []);
    await fileSystem.writeFile('/vault/Note.md', '---\nid: page-note\n---\nBody');

    await application.pageOperations.open('page-note');

    const openSpy = vi.spyOn(application.pageOperations, 'open');
    const openAtPathSpy = vi.spyOn(application.pageOperations, 'openAtPath');

    await application.pageOperations.delete('page-note');

    expect(openSpy.mock.calls.length + openAtPathSpy.mock.calls.length).toBe(1);
    expect(application.workspace.activeView).not.toBeNull();
  });

  it('app-initiated FolderOperations.delete() of the sole active folder opens the fallback exactly once', async () => {
    const folder = makeFolder('folder-projects', '/vault/Projects');
    const { application, fileSystem } = attachWith([], [folder]);
    await fileSystem.createDirectory('/vault/Projects');

    await application.folderOperations.open('folder-projects');

    const openSpy = vi.spyOn(application.pageOperations, 'open');
    const openAtPathSpy = vi.spyOn(application.pageOperations, 'openAtPath');

    await application.folderOperations.delete('folder-projects');

    expect(openSpy.mock.calls.length + openAtPathSpy.mock.calls.length).toBe(1);
    expect(application.workspace.activeView).not.toBeNull();
  });
});
