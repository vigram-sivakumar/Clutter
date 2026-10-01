import { describe, expect, it, vi } from 'vitest';

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { CollectionViewConfigStore } from './collection/CollectionViewConfigStore';
import { FoldStateStore } from './editor/FoldStateStore';
import { TasksViewConfigStore } from './task/TasksViewConfigStore';
import { TagExpansionStore } from './tags/TagExpansionStore';
import { WorkspaceSessionStore } from './workspace/WorkspaceSessionStore';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../vault/ingest/PageBuilder';
import { browserCoverImageUrlResolver } from '../vault/providers/BrowserCoverImageUrlResolver';
import type { Page } from '../vault/models/Page';

// Same Platform boundary mock as Application.test.ts: open()/close() reach
// Tauri-only APIs that have no runtime under vitest.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

function buildPage(path: string, id: string): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: `${ROOT}/${path}`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

/**
 * Mirrors bootstrap()'s ADR-035 wiring (load → construct → attachVault →
 * seed) over an in-memory vault — bootstrap() itself builds Tauri-backed
 * Platform pieces and can't run here (see Application.test.ts).
 */
async function boot(pages: Page[], workspaceSession?: unknown) {
  const fileSystem = new InMemoryVaultFileSystem(
    workspaceSession === undefined
      ? {}
      : { [WORKSPACE_PATH]: JSON.stringify({ workspaceSession, tagExpansion: ['kept'] }) }
  );
  const vault = new Vault(ROOT, pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const workspaceSessionStore = await WorkspaceSessionStore.load(fileSystem, ROOT);
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    browserCoverImageUrlResolver,
    FoldStateStore.empty(fileSystem, ROOT),
    CollectionViewConfigStore.empty(fileSystem, ROOT),
    TasksViewConfigStore.empty(fileSystem, ROOT),
    TagExpansionStore.empty(fileSystem, ROOT),
    workspaceSessionStore
  );
  application.attachVault(
    vault,
    new PageCreator(new UuidGenerator(), new PageFactory()),
    new DailyNoteService()
  );
  workspaceSessionStore.seed(
    application.workspace,
    application.dailyNotesSidebarState,
    (folderId) => vault.getFolder(folderId) !== undefined
  );

  return { application, fileSystem };
}

async function persistedSession(fileSystem: InMemoryVaultFileSystem) {
  const file = JSON.parse(await fileSystem.readFile(WORKSPACE_PATH)) as Record<string, unknown>;
  return file as {
    tagExpansion?: unknown;
    workspaceSession: {
      navigation: { activeSidebarTab: string; activeView: unknown };
      sidebar: { dailyNotes: { earlierExpanded: boolean } };
    };
  };
}

function session(activeView: unknown, activeSidebarTab = 'notes') {
  return {
    version: 1,
    navigation: { activeSidebarTab, activeView },
    sidebar: { visible: false, dailyNotes: { earlierExpanded: true } },
  };
}

describe('Application.open — restore last session (ADR-035)', () => {
  it('restores the saved active page instead of today\'s Daily Note, without a history entry', async () => {
    const { application } = await boot(
      [buildPage('Note.md', 'page-note')],
      session({ type: 'page', id: 'page-note' })
    );

    await application.open();

    expect(application.workspace.activeView).toEqual({ type: 'page', id: 'page-note' });
    expect(application.workspace.canNavigateBack).toBe(false);
    await application.close();
  });

  it('seeds the sidebar chrome before open()', async () => {
    const { application } = await boot([], session(null, 'tags'));

    expect(application.workspace.activeSidebarTab).toBe('tags');
    expect(application.workspace.isSidebarVisible).toBe(false);
    expect(application.dailyNotesSidebarState.earlierExpanded).toBe(true);
  });

  it('restores a filtered view', async () => {
    const { application } = await boot(
      [],
      session({ type: 'filtered-view', view: { kind: 'favorites' } })
    );

    await application.open();

    expect(application.workspace.activeView).toEqual({
      type: 'filtered-view',
      view: { kind: 'favorites' },
    });
    await application.close();
  });

  it('falls back to today\'s Daily Note when the saved page no longer exists', async () => {
    const { application } = await boot([], session({ type: 'page', id: 'deleted-page' }));

    await application.open();

    const activePageId = application.workspace.activePageId;
    expect(activePageId).not.toBeNull();
    expect(activePageId).not.toBe('deleted-page');
    expect(application.pageOperations.getDraft(activePageId!)?.type).toBe('daily-note');
    await application.close();
  });

  it('falls back to today\'s Daily Note when nothing was saved', async () => {
    const { application } = await boot([]);

    await application.open();

    expect(application.workspace.activePageId).not.toBeNull();
    await application.close();
  });

  it('does not persist anything before open() finishes restoring', async () => {
    const { application, fileSystem } = await boot(
      [buildPage('Note.md', 'page-note')],
      session({ type: 'page', id: 'page-note' })
    );
    const writeFile = vi.spyOn(fileSystem, 'writeFile');

    // A change during boot, before open(): must not be written yet.
    application.workspace.setActiveSidebarTab('tasks');
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('close() flushes the latest session, keeping other stores\' keys', async () => {
    const { application, fileSystem } = await boot(
      [buildPage('Note.md', 'page-note')],
      session({ type: 'page', id: 'page-note' })
    );
    await application.open();

    application.workspace.setActiveSidebarTab('tasks');
    application.dailyNotesSidebarState.setEarlierExpanded(false);
    await application.close();

    const file = await persistedSession(fileSystem);
    expect(file.tagExpansion).toEqual(['kept']);
    expect(file.workspaceSession.navigation).toEqual({
      activeSidebarTab: 'tasks',
      activeView: { type: 'page', id: 'page-note' },
    });
    expect(file.workspaceSession.sidebar.dailyNotes.earlierExpanded).toBe(false);
  });

  it('never persists the fallback draft as the restorable active view', async () => {
    const { application, fileSystem } = await boot([]);
    await application.open();

    await application.close();

    expect((await persistedSession(fileSystem)).workspaceSession.navigation.activeView).toBeNull();
  });
});
