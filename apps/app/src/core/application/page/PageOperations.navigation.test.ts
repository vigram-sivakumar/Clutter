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
import { ResourceOperations } from '../resource/ResourceOperations';
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

  const resourceOperations = new ResourceOperations(vault, workspace, coordinator);

  return {
    vault,
    inner,
    workspace,
    documentRegistry,
    coordinator,
    pageOperations,
    folderOperations,
    resourceOperations,
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

  it('a past Daily Note draft is retained, not discarded, once leaving it makes it a Back-target', async () => {
    // Superseded expectation, updated deliberately: opening 'page-a' from
    // the draft is an ordinary recorded navigation (ADR-027) — it pushes
    // the draft onto backStack exactly like leaving any other recordable
    // view does. Once that happens the draft is referenced by navigation
    // history, so PageOperations.discardAbandonedDraft()'s new
    // isReferencedInHistory() guard must keep it alive for Back/Forward,
    // the same way today's-date retention already does for a different
    // reason. This is no longer "normal discard policy applies" — a past
    // Daily Note draft is discarded only once it stops being referenced by
    // either history stack.
    const { workspace, pageOperations } = setup([buildPage('page-a', 'A')]);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayPath = DailyNotePath.absoluteFrom(ROOT, yesterday);
    const draftId = await pageOperations.openAtPath(yesterdayPath, { type: 'daily-note' });

    await pageOperations.open('page-a');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(workspace.isReferencedInHistory(draftId)).toBe(true);
    expect(pageOperations.getDraft(draftId)).toBeDefined();
  });

  it('never repurposes today\'s empty Daily Note draft when opening a different empty Daily Note — the full product scenario', async () => {
    const { pageOperations } = setup([buildPage('page-a', 'A')]);

    // 1. Today's Daily Note exists as an empty draft.
    const todayPath = DailyNotePath.absoluteFrom(ROOT, new Date());
    const todayDraftId = await pageOperations.openAtPath(todayPath, {
      type: 'daily-note',
    });

    // 2. User opens another Daily Note that doesn't yet exist.
    const otherDate = new Date();
    otherDate.setDate(otherDate.getDate() - 3);
    const otherPath = DailyNotePath.absoluteFrom(ROOT, otherDate);
    const otherDraftId = await pageOperations.openAtPath(otherPath, {
      type: 'daily-note',
    });

    // 3. Today's Daily Note draft remains — not silently retargeted onto
    //    the new date's descriptor.
    expect(pageOperations.getDraft(todayDraftId)).toEqual({
      folderId: null,
      type: 'daily-note',
      title: expect.any(String),
      deterministicPath: todayPath,
    });

    // 4. The new date received its own, separate draft.
    expect(otherDraftId).not.toBe(todayDraftId);
    expect(pageOperations.getDraft(otherDraftId)).toBeDefined();

    // 5. Navigating away from the new draft (to a real, unrelated page —
    //    not another Daily Note, which would exercise reuse rather than
    //    discard) is itself a recorded navigation, so `otherDraftId` is now
    //    a Back-target and must be retained — updated deliberately, same
    //    reasoning as the "past Daily Note draft is retained" test above.
    await pageOperations.open('page-a');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pageOperations.getDraft(otherDraftId)).toBeDefined();

    // 6. Today's Daily Note draft is still present throughout.
    expect(pageOperations.getDraft(todayDraftId)).toBeDefined();
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
      rest.resourceOperations,
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

  it('Today → draft Daily Note → draft Daily Note: Back/Forward travel through both drafts via the real PageOperations.open(), not a fake', async () => {
    const { workspace, pageOperations, navigation } = setupWithRouter([
      buildPage('page-today', 'Today'),
    ]);

    await pageOperations.open('page-today');

    const path13 = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13'));
    const draft13 = await pageOperations.openAtPath(path13, { type: 'daily-note' });
    // Non-empty, so opening the next Daily Note draft doesn't silently
    // retarget this one onto the new date (findReusableDraftId only
    // reuses an *empty* draft — real product behavior, unrelated to this
    // test's concern) — two genuinely distinct drafts is the point here.
    pageOperations.commitEdit(draft13, 'Notes for the 13th');

    const path17 = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-17'));
    const draft17 = await pageOperations.openAtPath(path17, { type: 'daily-note' });
    pageOperations.commitEdit(draft17, 'Notes for the 17th');

    expect(workspace.activePageId).toBe(draft17);

    // 17 -> 13
    navigation.back();
    expect(workspace.activePageId).toBe(draft13);

    // 13 -> Today
    navigation.back();
    expect(workspace.activePageId).toBe('page-today');
    expect(workspace.canNavigateBack).toBe(false);

    // Today -> 13
    navigation.forward();
    expect(workspace.activePageId).toBe(draft13);

    // 13 -> 17
    navigation.forward();
    expect(workspace.activePageId).toBe(draft17);
    expect(workspace.canNavigateForward).toBe(false);
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

  it('12 (persisted) -> 13,14,15,16,17 (empty Daily Note drafts): each date keeps its own stable identity, so Back/Forward visits every one individually', async () => {
    const { workspace, pageOperations, navigation } = setupWithRouter([
      buildPage('page-12', '12'),
    ]);

    await pageOperations.open('page-12');

    const dates = [13, 14, 15, 16, 17];
    const draftIds: string[] = [];
    for (const day of dates) {
      const path = DailyNotePath.absoluteFrom(ROOT, new Date(`2024-01-${day}`));
      draftIds.push(await pageOperations.openAtPath(path, { type: 'daily-note' }));
    }

    // Each date minted its own draft — none of them collapsed onto a
    // shared identity via the empty-draft reuse path.
    expect(new Set(draftIds).size).toBe(5);
    expect(workspace.activePageId).toBe(draftIds[4]); // 17

    // Back: 17 -> 16 -> 15 -> 14 -> 13 -> 12 (5 hops off the current '17')
    for (let i = dates.length - 2; i >= 0; i--) {
      navigation.back();
      expect(workspace.activePageId).toBe(draftIds[i]);
    }
    navigation.back();
    expect(workspace.activePageId).toBe('page-12');
    expect(workspace.canNavigateBack).toBe(false);

    // Forward: 12 -> 13 -> 14 -> 15 -> 16 -> 17
    for (let i = 0; i < dates.length; i++) {
      navigation.forward();
      expect(workspace.activePageId).toBe(draftIds[i]);
    }
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

describe('An empty Daily Note draft referenced by navigation history is not auto-discarded', () => {
  function setupWithRouter(pages: Page[]) {
    const rest = setup(pages);
    const navigation = new NavigationRouter(
      rest.folderOperations,
      rest.pageOperations,
      rest.resourceOperations,
      rest.vault,
      rest.workspace
    );
    return { ...rest, navigation };
  }

  it('Today -> empty Daily Note draft -> Back -> Forward returns to the same draft/session', async () => {
    const { workspace, documentRegistry, pageOperations, navigation } = setupWithRouter([
      buildPage('page-today', 'Today'),
    ]);

    await pageOperations.open('page-today');
    const path = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13'));
    const draftId = await pageOperations.openAtPath(path, { type: 'daily-note' });
    const sessionBeforeBack = documentRegistry.get(draftId);

    navigation.back();
    expect(workspace.activePageId).toBe('page-today');

    // Give flushActivePage's chained discardAbandonedDraft a turn to run —
    // this is the exact async window the bug used to lose the draft in.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pageOperations.getDraft(draftId)).toBeDefined();

    navigation.forward();

    expect(workspace.activePageId).toBe(draftId);
    expect(documentRegistry.get(draftId)).toBe(sessionBeforeBack); // same instance, not recreated
  });

  it('the draft survives the async abandonment check while referenced by history', async () => {
    const { workspace, pageOperations, navigation } = setupWithRouter([
      buildPage('page-today', 'Today'),
    ]);

    await pageOperations.open('page-today');
    const path = DailyNotePath.absoluteFrom(ROOT, new Date('2024-01-13'));
    const draftId = await pageOperations.openAtPath(path, { type: 'daily-note' });

    navigation.back();
    await vi.waitFor(() => {
      // A no-op wait: asserts this stays true across several event-loop
      // turns rather than only checking once, immediately after back().
      expect(pageOperations.getDraft(draftId)).toBeDefined();
    });
    expect(workspace.isReferencedInHistory(draftId)).toBe(true);
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
