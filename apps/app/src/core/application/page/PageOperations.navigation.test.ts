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
import { DailyNotePath } from '../../vault/ingest/DailyNotePath';
import { NavigationRouter } from '../navigation/NavigationRouter';
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

  it('retains an empty draft for today\'s Daily Note — the one auto-discard exception', async () => {
    const { workspace, pageOperations } = setup([buildPage('page-a', 'A')]);
    const todayPath = DailyNotePath.absoluteFrom(ROOT, new Date());
    const draftId = await pageOperations.openAtPath(todayPath, { type: 'daily-note' });

    await pageOperations.open('page-a');
    // Give flushActivePage's chained discardAbandonedDraft a turn to run
    // before asserting it did *not* discard — there's no positive signal
    // to wait on for "this stayed the same."
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pageOperations.getDraft(draftId)).toBeDefined();
    expect(workspace.openPages).toContain(draftId);
  });

  it('a past (non-today) empty Daily Note draft is discarded on navigating away, even though history records the stop', async () => {
    // Changed deliberately (ADR-059): opening 'page-a' from the draft is an ordinary recorded navigation, so the draft
    // is pushed onto backStack — but an empty draft is temporary however it was left. History no longer keeps it alive;
    // the entry it leaves behind is stale and Back/Forward skip it (see the history tests below).
    const { workspace, pageOperations } = setup([buildPage('page-a', 'A')]);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayPath = DailyNotePath.absoluteFrom(ROOT, yesterday);
    const draftId = await pageOperations.openAtPath(yesterdayPath, { type: 'daily-note' });

    await pageOperations.open('page-a');

    await vi.waitFor(() => {
      expect(pageOperations.getDraft(draftId)).toBeUndefined();
    });
    expect(workspace.openPages).not.toContain(draftId);
  });

  it('opening a different empty Daily Note retargets the one global draft (today\'s included) — it never adds a second draft', async () => {
    const { pageOperations } = setup([buildPage('page-a', 'A')]);

    const todayPath = DailyNotePath.absoluteFrom(ROOT, new Date());
    const todayDraftId = await pageOperations.openAtPath(todayPath, {
      type: 'daily-note',
    });

    const otherDate = new Date();
    otherDate.setDate(otherDate.getDate() - 3);
    const otherPath = DailyNotePath.absoluteFrom(ROOT, otherDate);
    const otherDraftId = await pageOperations.openAtPath(otherPath, {
      type: 'daily-note',
    });

    expect(otherDraftId).toBe(todayDraftId);
    expect(pageOperations.getDraft(todayDraftId)).toEqual({
      folderId: null,
      type: 'daily-note',
      title: expect.any(String),
      deterministicPath: otherPath,
    });

    // Navigating to a real page: the draft now targets a past date, so it is no longer today's and is an ordinary
    // empty draft — discarded on leaving it, whether or not history records the stop.
    await pageOperations.open('page-a');
    await vi.waitFor(() => {
      expect(pageOperations.getDraft(todayDraftId)).toBeUndefined();
    });
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
    pageOperations.commitEdit('page-a', 'Edited A before New note');

    await pageOperations.openDraft({ folderId: null });

    await vi.waitFor(() => {
      expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
    });
    const persisted = await inner.readFile(`${ROOT}/A.md`);
    expect(persisted).toContain('Edited A before New note');
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

describe('PageOperations.open: reactivates a live draft (ADR-017)', () => {
  it('reopens a live Daily Note draft that has no Vault entry, without throwing', async () => {
    const { vault, workspace, pageOperations } = setup([buildPage('page-a', 'A')]);
    const path = DailyNotePath.absoluteFrom(ROOT, new Date());
    const draftId = await pageOperations.openAtPath(path, { type: 'daily-note' });

    // Navigate away, then reopen the draft directly by id — the exact
    // shape NavigationRouter.commit() uses for a history replay.
    await pageOperations.open('page-a');
    expect(vault.getPage(draftId)).toBeUndefined(); // still unpersisted

    await expect(pageOperations.open(draftId)).resolves.toBeUndefined();

    expect(workspace.activePageId).toBe(draftId);
  });

  it('still throws "Page not found" for an id that is neither a Vault page nor a live draft', async () => {
    const { pageOperations } = setup([buildPage('page-a', 'A')]);

    await expect(pageOperations.open('genuinely-unknown-id')).rejects.toThrow(
      'Page not found: genuinely-unknown-id'
    );
  });
});

describe('Navigation history: plain Note drafts are excluded, Daily Note drafts are not (product rule)', () => {
  function setupWithRouter(pages: Page[]) {
    const rest = setup(pages);
    const navigation = new NavigationRouter(
      rest.folderOperations,
      rest.pageOperations,
      rest.vault,
      rest.workspace
    );
    return { ...rest, navigation };
  }

  it('a plain Note draft is never a history stop — Back skips straight past it and does not consume a Forward step', async () => {
    const { workspace, pageOperations, navigation } = setupWithRouter([
      buildPage('page-a', 'A'),
      buildPage('page-b', 'B'),
    ]);

    await pageOperations.open('page-a');
    const draftId = await pageOperations.openDraft({ folderId: null });
    expect(workspace.activePageId).toBe(draftId);
    await pageOperations.open('page-b');

    navigation.back();

    // Lands directly on 'page-a', not the Note draft — and nothing was
    // ever pushed for the draft, so there's exactly one entry to consume.
    expect(workspace.activePageId).toBe('page-a');
    expect(workspace.canNavigateBack).toBe(false);

    navigation.forward();

    // Forward returns to 'page-b' — the draft was never a stop in either
    // direction, so it never appears and never silently "does nothing".
    expect(workspace.activePageId).toBe('page-b');
  });

  it('Today → contentful Daily Note draft → another Daily Note: the first persists, the second opens as the one draft; Back walks all three, and Forward stops at the persisted note once the empty draft is gone', async () => {
    const { workspace, pageOperations, navigation, vault } = setupWithRouter([
      buildPage('page-today', 'Today'),
    ]);

    await pageOperations.open('page-today');

    const path13 = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13'));
    const draft13 = await pageOperations.openAtPath(path13, { type: 'daily-note' });
    pageOperations.commitEdit(draft13, 'Notes for the 13th');

    const path17 = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-17'));
    const draft17 = await pageOperations.openAtPath(path17, { type: 'daily-note' });

    // The 13th was persisted (same id, now a real page); the 17th is the
    // single remaining draft.
    expect(vault.getPage(draft13)?.path).toBe(path13);
    expect(draft17).not.toBe(draft13);
    expect(pageOperations.getDraft(draft17)?.title).toBe('2024-01-17');
    expect(pageOperations.getDraft(draft13)).toBeUndefined();
    expect(workspace.activePageId).toBe(draft17);

    navigation.back();
    expect(workspace.activePageId).toBe(draft13);
    navigation.back();
    expect(workspace.activePageId).toBe('page-today');
    expect(workspace.canNavigateBack).toBe(false);

    // The 17th was empty and has been discarded since: its entry is stale, so Forward walks to the 13th and then skips
    // past the dead entry instead of reopening the draft.
    await vi.waitFor(() => {
      expect(pageOperations.getDraft(draft17)).toBeUndefined();
    });
    navigation.forward();
    expect(workspace.activePageId).toBe(draft13);
    navigation.forward();
    expect(workspace.activePageId).toBe(draft13);
    expect(workspace.canNavigateForward).toBe(false);
    expect(pageOperations.getDraft(draft17)).toBeUndefined();
  });

  it('a persisted Note continues to participate in Back/Forward normally', async () => {
    const { workspace, pageOperations, navigation } = setupWithRouter([
      buildPage('page-a', 'A'),
      buildPage('page-b', 'B'),
    ]);

    await pageOperations.open('page-a');
    await pageOperations.open('page-b');

    navigation.back();
    expect(workspace.activePageId).toBe('page-a');

    navigation.forward();
    expect(workspace.activePageId).toBe('page-b');
  });

  it('a stale (externally removed) history entry is still skipped — unchanged existing behavior', async () => {
    const { vault, workspace, pageOperations, navigation } = setupWithRouter([
      buildPage('page-a', 'A'),
      buildPage('page-b', 'B'),
      buildPage('page-c', 'C'),
    ]);

    await pageOperations.open('page-a');
    await pageOperations.open('page-b');
    await pageOperations.open('page-c');

    vault.removePage('page-b');

    navigation.back();

    expect(workspace.activePageId).toBe('page-a');
    expect(workspace.canNavigateBack).toBe(false);
  });

  it('12 (persisted) -> 13,14,15,16,17 (empty Daily Note dates): one global draft is retargeted through all of them (history holds that one id), and it is discarded once left', async () => {
    const { workspace, pageOperations, navigation } = setupWithRouter([
      buildPage('page-12', '12'),
    ]);

    await pageOperations.open('page-12');

    const draftIds: string[] = [];
    for (const day of [13, 14, 15, 16, 17]) {
      const path = DailyNotePath.absoluteFrom(ROOT, new Date(`2024-01-${day}`));
      draftIds.push(await pageOperations.openAtPath(path, { type: 'daily-note' }));
    }

    expect(new Set(draftIds).size).toBe(1);
    const draftId = draftIds[0] as string;
    expect(workspace.activePageId).toBe(draftId);
    expect(pageOperations.getDraft(draftId)?.title).toBe('2024-01-17');

    navigation.back();
    expect(workspace.activePageId).toBe('page-12');
    expect(workspace.canNavigateBack).toBe(false);

    // The empty draft was discarded on leaving it; Forward finds only a stale entry and does not bring it back.
    await vi.waitFor(() => {
      expect(pageOperations.getDraft(draftId)).toBeUndefined();
    });
    navigation.forward();
    expect(workspace.activePageId).toBe('page-12');
    expect(workspace.canNavigateForward).toBe(false);
  });

  it('reopening the same Daily Note date reuses its existing draft instead of minting another one', async () => {
    const { workspace, pageOperations } = setupWithRouter([buildPage('page-12', '12')]);
    await pageOperations.open('page-12');

    const path13 = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13'));
    const firstOpen = await pageOperations.openAtPath(path13, { type: 'daily-note' });

    const path14 = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-14'));
    await pageOperations.openAtPath(path14, { type: 'daily-note' });

    const secondOpen = await pageOperations.openAtPath(path13, { type: 'daily-note' });

    expect(secondOpen).toBe(firstOpen);
    expect(workspace.activePageId).toBe(firstOpen);
  });
});

describe('An empty Daily Note draft is discarded on navigating away, even when navigation history references it (ADR-059)', () => {
  function setupWithRouter(pages: Page[]) {
    const rest = setup(pages);
    const navigation = new NavigationRouter(
      rest.folderOperations,
      rest.pageOperations,
      rest.vault,
      rest.workspace
    );
    return { ...rest, navigation };
  }

  it('Today -> empty Daily Note draft -> Back: the draft is discarded, and Forward never reopens or recreates it', async () => {
    const { workspace, documentRegistry, pageOperations, navigation, vault } = setupWithRouter([
      buildPage('page-today', 'Today'),
    ]);

    await pageOperations.open('page-today');
    const path = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13'));
    const draftId = await pageOperations.openAtPath(path, { type: 'daily-note' });

    navigation.back();
    expect(workspace.activePageId).toBe('page-today');
    await vi.waitFor(() => {
      expect(pageOperations.getDraft(draftId)).toBeUndefined();
    });

    navigation.forward();

    expect(workspace.activePageId).toBe('page-today');
    expect(workspace.canNavigateForward).toBe(false);
    expect(pageOperations.getDraft(draftId)).toBeUndefined();
    expect(documentRegistry.get(draftId)).toBeUndefined();
    expect(vault.getPage(draftId)).toBeUndefined();
    expect(workspace.openPages).not.toContain(draftId);
  });

  it('is discarded across several event-loop turns even though a history stack still names it', async () => {
    const { workspace, pageOperations, navigation } = setupWithRouter([buildPage('page-today', 'Today')]);

    await pageOperations.open('page-today');
    const path = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13'));
    const draftId = await pageOperations.openAtPath(path, { type: 'daily-note' });

    navigation.back();

    await vi.waitFor(() => {
      expect(pageOperations.getDraft(draftId)).toBeUndefined();
    });
    // The Forward entry is still there until traversal finds it stale — that is the point: it does not keep the draft.
    expect(workspace.canNavigateForward).toBe(true);
    navigation.forward();
    expect(workspace.canNavigateForward).toBe(false);
  });

  it('leaving it for another saved Daily Note discards it, and that Daily Note is untouched', async () => {
    const dailyPath = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-12'));
    const existing = buildPage('daily-12', '2024-01-12');
    const { workspace, pageOperations, vault, documentRegistry } = setupWithRouter([existing]);
    // A saved Daily Note at its real path.
    const saved = await pageOperations.openAtPath(dailyPath, { type: 'daily-note' });
    await pageOperations.save(saved, 'Saved on the 12th');
    expect(vault.getPage(saved)?.path).toBe(dailyPath);

    const draftId = await pageOperations.openAtPath(
      DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13')),
      { type: 'daily-note' }
    );
    expect(draftId).not.toBe(saved);

    await pageOperations.openAtPath(dailyPath, { type: 'daily-note' });

    await vi.waitFor(() => {
      expect(pageOperations.getDraft(draftId)).toBeUndefined();
    });
    expect(documentRegistry.get(draftId)).toBeUndefined();
    expect(workspace.activePageId).toBe(saved);
    expect(vault.getPage(saved)?.source.markdown).toContain('Saved on the 12th');
  });

  it('a Daily Note draft that has content is kept, promoted to a real note, not discarded', async () => {
    const { workspace, pageOperations, vault, navigation } = setupWithRouter([buildPage('page-today', 'Today')]);
    await pageOperations.open('page-today');
    const path = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13'));
    const draftId = await pageOperations.openAtPath(path, { type: 'daily-note' });
    pageOperations.commitEdit(draftId, 'Notes for the 13th');

    navigation.back();

    await vi.waitFor(() => {
      expect(vault.getPage(draftId)).toBeDefined();
    });
    expect(pageOperations.getDraft(draftId)).toBeUndefined(); // promoted, not discarded
    expect(vault.getPage(draftId)?.source.markdown).toContain('Notes for the 13th');
    expect(vault.getPage(draftId)?.path).toBe(path);
    // It is a real page now, so Forward returns to it.
    navigation.forward();
    expect(workspace.activePageId).toBe(draftId);
  });

  it('a plain Note draft is still auto-discarded on navigate-away — never retained merely for navigation', async () => {
    const { pageOperations } = setupWithRouter([buildPage('page-a', 'A')]);

    await pageOperations.open('page-a');
    const draftId = await pageOperations.openDraft({ folderId: null });

    await pageOperations.open('page-a');

    await vi.waitFor(() => {
      expect(pageOperations.getDraft(draftId)).toBeUndefined();
    });
  });

  it("today's Daily Note draft retention is unchanged by this fix", async () => {
    const { workspace, pageOperations } = setupWithRouter([buildPage('page-a', 'A')]);
    const todayPath = DailyNotePath.absoluteFrom(ROOT, new Date());
    const draftId = await pageOperations.openAtPath(todayPath, { type: 'daily-note' });

    await pageOperations.open('page-a');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pageOperations.getDraft(draftId)).toBeDefined();
    expect(workspace.openPages).toContain(draftId);
  });
});

describe('An abandoned empty Note draft is discarded however it was last activated', () => {
  function setupWithRouter(pages: Page[]) {
    const rest = setup(pages);
    const navigation = new NavigationRouter(rest.folderOperations, rest.pageOperations, rest.vault, rest.workspace);
    return { ...rest, navigation };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** Everything that could let the draft come back: the slot, the open tab, the editor session, history. */
  function expectGone(
    ctx: ReturnType<typeof setupWithRouter>,
    draftId: string
  ) {
    expect(ctx.pageOperations.getDraft(draftId)).toBeUndefined();
    expect(ctx.workspace.openPages).not.toContain(draftId);
    expect(ctx.documentRegistry.get(draftId)).toBeUndefined();
    expect(ctx.vault.getPage(draftId)).toBeUndefined();
  }

  it('re-selecting the draft through the facade (a sidebar row, a collection card) records no history stop, and leaving discards it', async () => {
    const ctx = setupWithRouter([buildPage('page-a', 'A'), buildPage('page-b', 'B')]);
    await ctx.pageOperations.open('page-a');
    const draftId = await ctx.pageOperations.openDraft({ folderId: null });

    await ctx.pageOperations.open(draftId);
    await ctx.pageOperations.open('page-b');
    await settle();

    expectGone(ctx, draftId);
  });

  it('even a bare workspace.openPage(draftId) — which records it as a history stop — cannot keep it alive', async () => {
    const ctx = setupWithRouter([buildPage('page-a', 'A'), buildPage('page-b', 'B')]);
    await ctx.pageOperations.open('page-a');
    const draftId = await ctx.pageOperations.openDraft({ folderId: null });

    ctx.workspace.openPage(draftId); // recordable by default: the old route that pinned the draft
    await ctx.pageOperations.open('page-b');
    await settle();

    expectGone(ctx, draftId);
  });

  it('does not reappear: Back/Forward skip the dead history entry and never reactivate the discarded draft', async () => {
    const ctx = setupWithRouter([buildPage('page-a', 'A'), buildPage('page-b', 'B')]);
    await ctx.pageOperations.open('page-a');
    const draftId = await ctx.pageOperations.openDraft({ folderId: null });
    ctx.workspace.openPage(draftId);
    await ctx.pageOperations.open('page-b');
    await settle();

    ctx.navigation.back();
    await settle();
    expect(ctx.workspace.activePageId).toBe('page-a');
    ctx.navigation.forward();
    await settle();
    expect(ctx.workspace.activePageId).toBe('page-b');

    expectGone(ctx, draftId);
    await expect(ctx.pageOperations.open(draftId)).rejects.toThrow('Page not found');
  });

  it('returning to where it was created gives a fresh draft, not the discarded one', async () => {
    const ctx = setupWithRouter([buildPage('page-a', 'A')]);
    await ctx.pageOperations.open('page-a');
    const first = await ctx.pageOperations.openDraft({ folderId: null });
    await ctx.pageOperations.open('page-a');
    await settle();
    expectGone(ctx, first);

    const second = await ctx.pageOperations.openDraft({ folderId: null });

    expect(second).not.toBe(first);
    expect(ctx.pageOperations.getDraft(first)).toBeUndefined();
    expect(ctx.pageOperations.getDraft(second)).toBeDefined();
  });

  it('a draft with real content is preserved through the existing promotion flow, however it was re-selected', async () => {
    const ctx = setupWithRouter([buildPage('page-a', 'A'), buildPage('page-b', 'B')]);
    await ctx.pageOperations.open('page-a');
    const draftId = await ctx.pageOperations.openDraft({ folderId: null });
    ctx.pageOperations.commitEdit(draftId, 'Something worth keeping');
    ctx.workspace.openPage(draftId);

    await ctx.pageOperations.open('page-b');
    await vi.waitFor(() => {
      expect(ctx.vault.getPage(draftId)).toBeDefined();
    });
    await settle();

    expect(ctx.pageOperations.getDraft(draftId)).toBeUndefined(); // promoted, not discarded
    expect(ctx.vault.getPage(draftId)!.source.markdown).toContain('Something worth keeping');
    expect(ctx.workspace.openPages).toContain(draftId);
  });

  it('rapid navigation: leaving immediately, with no time to settle, still discards it and nothing can resurrect it', async () => {
    const ctx = setupWithRouter([buildPage('page-a', 'A')]);
    await ctx.pageOperations.open('page-a');
    const pagesBefore = Array.from(ctx.vault.pages()).length;
    const draftId = await ctx.pageOperations.openDraft({ folderId: null });

    void ctx.pageOperations.open('page-a'); // not awaited
    ctx.navigation.back();
    ctx.navigation.forward();
    await settle();

    expectGone(ctx, draftId);
    // Late callbacks addressed to the discarded id do nothing: no save, no promotion, no page.
    await ctx.pageOperations.requestSave(draftId);
    await settle();
    expectGone(ctx, draftId);
    expect(Array.from(ctx.vault.pages()).length).toBe(pagesBefore);
  });

  it('opening the draft and leaving it twice over discards each in turn, leaving exactly one live draft slot', async () => {
    const ctx = setupWithRouter([buildPage('page-a', 'A')]);
    await ctx.pageOperations.open('page-a');
    const ids: string[] = [];

    for (let i = 0; i < 3; i++) {
      ids.push(await ctx.pageOperations.openDraft({ folderId: null }));
      await ctx.pageOperations.open('page-a');
      await settle();
    }

    for (const id of ids) expectGone(ctx, id);
    expect(ctx.workspace.openPages).toEqual(['page-a']);
  });
});

describe('PageOperations.ensureAtPath: non-activating resolve-or-create', () => {
  it('persists a missing Daily Note without opening it or changing the active view', async () => {
    const { vault, workspace, pageOperations } = setup([buildPage('page-a', 'A')]);
    await pageOperations.open('page-a');
    const path = DailyNotePath.absoluteFrom(ROOT, new Date());

    const id = await pageOperations.ensureAtPath(path, { type: 'daily-note' });

    expect(vault.getPageByPath(path)?.id).toBe(id);
    expect(workspace.activePageId).toBe('page-a');
    expect(pageOperations.getDraft(id)).toBeUndefined();
  });

  it('returns the existing page for a path that already has one, without opening it', async () => {
    const { workspace, pageOperations } = setup([buildPage('page-a', 'A'), buildPage('page-b', 'B')]);
    await pageOperations.open('page-a');

    const id = await pageOperations.ensureAtPath(`${ROOT}/B.md`, { type: 'note' });

    expect(id).toBe('page-b');
    expect(workspace.activePageId).toBe('page-a');
  });

  it('returns the live draft for its own path, so one page — not two — ends up at that path', async () => {
    const { vault, pageOperations } = setup([buildPage('page-a', 'A')]);
    const path = DailyNotePath.absoluteFrom(ROOT, new Date());
    const draftId = await pageOperations.openAtPath(path, { type: 'daily-note' });
    await pageOperations.open('page-a');

    const id = await pageOperations.ensureAtPath(path, { type: 'daily-note' });

    expect(id).toBe(draftId);
    expect(vault.getPageByPath(path)).toBeUndefined();
  });

  it('a body mutation into the ensured page is durable and visible when the note is opened later', async () => {
    const { vault, workspace, documentRegistry, pageOperations } = setup([buildPage('page-a', 'A')]);
    await pageOperations.open('page-a');
    const path = DailyNotePath.absoluteFrom(ROOT, new Date());

    const id = await pageOperations.ensureAtPath(path, { type: 'daily-note' });
    await pageOperations.mutateBody(id, () => '- [ ] Buy milk');
    await pageOperations.requestSave(id);
    await pageOperations.open(id);

    expect(workspace.activePageId).toBe(id);
    expect(vault.getPage(id)!.source.markdown).toContain('- [ ] Buy milk');
    expect(documentRegistry.get(id)!.currentRevision.markdown).toContain('- [ ] Buy milk');
  });
});
