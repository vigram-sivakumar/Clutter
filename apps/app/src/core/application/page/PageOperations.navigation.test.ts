import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { DocumentState } from '../../engine/DocumentState';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

function buildPage(id: string, name: string): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${name}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: `${name} original body`,
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

function setup(pages: Page[]) {
  const vault = new Vault(
    ROOT,
    pages,
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const inner = new InMemoryVaultFileSystem();
  for (const page of pages) {
    inner.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
  }

  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, inner);
  const coordinator = new PagePersistenceCoordinator(
    inner,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => pageOperations.flushActivePage(),
    new DocumentRegistry(),
    new SaveCoordinator(),
    () => {}
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );

  return {
    vault,
    inner,
    workspace,
    documentRegistry,
    coordinator,
    pageOperations,
    folderOperations,
  };
}

describe('PageOperations.flushActivePage', () => {
  it('is a no-op when no page is active', () => {
    const { inner, pageOperations } = setup([buildPage('page-a', 'A')]);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.flushActivePage();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when the active page is clean', async () => {
    const { inner, pageOperations } = setup([buildPage('page-a', 'A')]);
    await pageOperations.open('page-a');
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.flushActivePage();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('flushes the active page when it is dirty', async () => {
    const { inner, documentRegistry, pageOperations } = setup([
      buildPage('page-a', 'A'),
    ]);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Edited A');

    pageOperations.flushActivePage();
    await vi.waitFor(() => {
      expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
    });

    const persisted = await inner.readFile(`${ROOT}/A.md`);
    expect(persisted).toContain('Edited A');
  });
});

describe('PageOperations.flushActivePage: discards an abandoned draft', () => {
  it('discards an empty draft once navigation away from it settles', async () => {
    const { workspace, pageOperations } = setup([buildPage('page-a', 'A')]);
    const draftId = await pageOperations.openDraft({ folderId: null });

    await pageOperations.open('page-a');
    await vi.waitFor(() => {
      expect(pageOperations.getDraft(draftId)).toBeUndefined();
    });

    expect(workspace.openPages).not.toContain(draftId);
  });

  it('promotes, rather than discards, a draft with real unsaved content', async () => {
    const { vault, workspace, pageOperations } = setup([buildPage('page-a', 'A')]);
    const draftId = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(draftId, 'Real draft content');

    await pageOperations.open('page-a');
    await vi.waitFor(() => {
      expect(vault.getPage(draftId)).toBeDefined();
    });

    // Promoted, not discarded: still a real, open page under its own id.
    expect(pageOperations.getDraft(draftId)).toBeUndefined();
    expect(workspace.openPages).toContain(draftId);
  });

  it('does not discard a draft whose save attempt failed — its content would be lost', async () => {
    const { inner, documentRegistry, pageOperations } = setup([
      buildPage('page-a', 'A'),
    ]);
    const draftId = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(draftId, 'Content that fails to persist');
    vi.spyOn(inner, 'writeFile').mockRejectedValue(new Error('disk full'));

    await pageOperations.open('page-a');
    await vi.waitFor(() => {
      expect(documentRegistry.get(draftId)!.state).toBe(DocumentState.SaveError);
    });

    // Still a draft, still holding its unsaved content — not silently wiped.
    expect(pageOperations.getDraft(draftId)).toBeDefined();
    expect(documentRegistry.get(draftId)!.currentRevision.markdown).toBe(
      'Content that fails to persist'
    );
  });
});

describe('PageOperations.open: flushes the outgoing page before switching', () => {
  it('flushes a dirty previously-active page when switching to a different one', async () => {
    const { inner, documentRegistry, pageOperations } = setup([
      buildPage('page-a', 'A'),
      buildPage('page-b', 'B'),
    ]);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Edited A, unsaved');

    await pageOperations.open('page-b');

    await vi.waitFor(() => {
      expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
    });
    const persisted = await inner.readFile(`${ROOT}/A.md`);
    expect(persisted).toContain('Edited A, unsaved');
  });

  it('does not attempt a flush when nothing was previously active', async () => {
    const { inner, pageOperations } = setup([buildPage('page-a', 'A')]);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    await pageOperations.open('page-a');

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('does not flush when open() fails (unknown id) — no navigation actually happened', async () => {
    const { inner, pageOperations } = setup([buildPage('page-a', 'A')]);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Dirty content');
    const writeSpy = vi.spyOn(inner, 'writeFile');

    await expect(pageOperations.open('does-not-exist')).rejects.toThrow();

    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe('PageOperations.openDraft: flushes the outgoing page before opening a new draft', () => {
  it('flushes a dirty previously-active page', async () => {
    const { inner, documentRegistry, pageOperations } = setup([
      buildPage('page-a', 'A'),
    ]);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Edited A before New Note');

    await pageOperations.openDraft({ folderId: null });

    await vi.waitFor(() => {
      expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
    });
    const persisted = await inner.readFile(`${ROOT}/A.md`);
    expect(persisted).toContain('Edited A before New Note');
  });
});

describe('PageOperations.create: flushes the outgoing page before opening the newly created one', () => {
  it('flushes a dirty previously-active page', async () => {
    const { inner, documentRegistry, pageOperations } = setup([
      buildPage('page-a', 'A'),
    ]);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Edited A before eager create');

    await pageOperations.create({ folderId: null, title: 'Programmatic' });

    await vi.waitFor(() => {
      expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
    });
    const persisted = await inner.readFile(`${ROOT}/A.md`);
    expect(persisted).toContain('Edited A before eager create');
  });
});

describe('PageOperations.open: recordHistory pass-through (ADR-027)', () => {
  it('defaults to recording — a second open() records the first as history', async () => {
    const { workspace, pageOperations } = setup([
      buildPage('page-a', 'A'),
      buildPage('page-b', 'B'),
    ]);

    await pageOperations.open('page-a');
    await pageOperations.open('page-b');

    expect(workspace.canNavigateBack).toBe(true);
    expect(workspace.peekBack()).toEqual({ type: 'page', id: 'page-a' });
  });

  it('recordHistory: false suppresses recording, matching a history replay', async () => {
    const { workspace, pageOperations } = setup([
      buildPage('page-a', 'A'),
      buildPage('page-b', 'B'),
    ]);

    await pageOperations.open('page-a');
    await pageOperations.open('page-b', { recordHistory: false });

    expect(workspace.canNavigateBack).toBe(false);
    expect(workspace.activePageId).toBe('page-b');
  });
});

describe('FolderOperations.open (via prepareNavigation): flushes the active page when switching to a folder', () => {
  it('flushes a dirty previously-active page before the folder becomes active', async () => {
    const { vault, inner, documentRegistry, pageOperations, folderOperations } =
      setup([buildPage('page-a', 'A')]);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Edited A before opening a folder');
    // A folder must exist in the vault for open() to succeed — create one
    // directly via the Gate rather than pulling in the full FolderOperations
    // .create() path, which isn't this test's concern.
    const result = await folderOperations.create('Projects', null);
    void result;

    await folderOperations.open(vault.getFolderByPath(`${ROOT}/Projects`)!.id);

    await vi.waitFor(() => {
      expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
    });
    const persisted = await inner.readFile(`${ROOT}/A.md`);
    expect(persisted).toContain('Edited A before opening a folder');
  });
});

describe('FolderOperations.open: recordHistory pass-through (ADR-027)', () => {
  it('recordHistory: false suppresses recording, matching a history replay', async () => {
    const { vault, workspace, pageOperations, folderOperations } = setup([
      buildPage('page-a', 'A'),
    ]);
    await pageOperations.open('page-a');
    await folderOperations.create('Projects', null);

    await folderOperations.open(vault.getFolderByPath(`${ROOT}/Projects`)!.id, {
      recordHistory: false,
    });

    expect(workspace.canNavigateBack).toBe(false);
    expect(workspace.activeFolderId).toBe(vault.getFolderByPath(`${ROOT}/Projects`)!.id);
  });
});
