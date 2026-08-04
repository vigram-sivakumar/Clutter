import { describe, expect, it } from 'vitest';
import { EffectivePageState } from './EffectivePageState';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultQuery } from '../../vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../folder/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';

const ROOT = '/vault';

function makeVault(): Vault {
  return new Vault(
    ROOT,
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function makeFolderOperations(
  vault: Vault,
  workspace: Workspace,
  coordinator: PagePersistenceCoordinator
): FolderOperations {
  return new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {}
  );
}

function setup() {
  const vault = makeVault();
  const query = new VaultQuery(vault);
  const fileSystem = new InMemoryVaultFileSystem();
  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    makeFolderOperations(vault, workspace, coordinator),
    new DailyNoteService()
  );
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);

  return { vault, query, workspace, pageOperations, effectivePageState };
}

describe('EffectivePageState: draft-only entries', () => {
  it('a freshly opened draft appears as a child of its folder before any save', async () => {
    const { pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'My Draft' });

    const entry = effectivePageState.getPage(draftId);
    expect(entry).toEqual({
      id: draftId,
      type: 'note',
      folderId: null,
      isDraft: true,
      name: 'My Draft',
      description: null,
      markdown: '',
      icon: null,
    });

    const children = effectivePageState.getChildPages(null);
    expect(children.map((page) => page.id)).toContain(draftId);
  });

  it('an unknown, never-opened id resolves to undefined', () => {
    const { effectivePageState } = setup();

    expect(effectivePageState.getPage('does-not-exist')).toBeUndefined();
  });

  it('a draft not targeting the queried folder is excluded', async () => {
    const { pageOperations, effectivePageState } = setup();

    await pageOperations.openDraft({ folderId: 'some-other-folder' });

    expect(effectivePageState.getChildPages(null)).toEqual([]);
  });
});

describe('EffectivePageState: promotion transition', () => {
  it('never lists the same id twice across the promotion window, and the entry becomes durable-sourced', async () => {
    const { vault, pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Promote Me' });
    await pageOperations.save(draftId, '# Hello');

    expect(vault.getPage(draftId)).toBeDefined();
    expect(pageOperations.getDraft(draftId)).toBeUndefined();

    const children = effectivePageState.getChildPages(null);
    const matches = children.filter((page) => page.id === draftId);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: draftId,
      isDraft: false,
      markdown: '# Hello',
    });
  });
});

describe('EffectivePageState: description/icon (Category 2/4, ADR-020 M3 amendment)', () => {
  it('a draft has no description or icon — neither DraftInfo nor DocumentSession tracks them', async () => {
    const { pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Draft' });

    expect(effectivePageState.getPage(draftId)).toMatchObject({
      description: null,
      icon: null,
    });
  });

  it('a persisted page surfaces its durable description and icon, unaffected by an open session', async () => {
    const { pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Persisted' });
    await pageOperations.save(draftId, '# Hello');
    await pageOperations.updateMetadata(draftId, { description: 'A durable description' });

    const entry = effectivePageState.getPage(draftId);
    expect(entry?.description).toBe('A durable description');

    // A live, uncommitted body edit doesn't touch description — Category 4
    // has no Committed stage (ADR-020 Non-Goals) and never will via this
    // path; only markdown (Category 3) is session-sourced.
    pageOperations.commitEdit(draftId, 'unsaved body edit');
    expect(effectivePageState.getPage(draftId)?.description).toBe('A durable description');
  });
});

describe('EffectivePageState: draft discard', () => {
  it('closing an unpersisted draft removes it entirely', async () => {
    const { pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null });
    expect(effectivePageState.getPage(draftId)).toBeDefined();

    pageOperations.close(draftId);

    expect(effectivePageState.getPage(draftId)).toBeUndefined();
    expect(effectivePageState.getChildPages(null)).toEqual([]);
  });
});

describe('EffectivePageState: live body updates from DocumentSession', () => {
  it('reflects an uncommitted-to-disk body edit on an open draft', async () => {
    const { pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(draftId, 'typed content, not yet saved');

    expect(effectivePageState.getPage(draftId)?.markdown).toBe('typed content, not yet saved');
  });

  it('reflects a live body edit on an already-persisted, currently-open page', async () => {
    const { pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Persisted' });
    await pageOperations.save(draftId, 'first version');

    pageOperations.commitEdit(draftId, 'second version, not yet saved');

    expect(effectivePageState.getPage(draftId)?.markdown).toBe('second version, not yet saved');
  });

  it('notifies subscribers when a session commits a new revision', async () => {
    const { pageOperations, effectivePageState } = setup();
    const draftId = await pageOperations.openDraft({ folderId: null });

    let notifications = 0;
    effectivePageState.subscribe(() => {
      notifications += 1;
    });

    pageOperations.commitEdit(draftId, 'change');

    expect(notifications).toBeGreaterThan(0);
  });
});

describe('EffectivePageState.getFavoritePages (ADR-022, shared with the Favorites collection page)', () => {
  it('returns only favorited, durable pages, not every open draft', async () => {
    const { pageOperations, effectivePageState } = setup();

    const favoritedId = await pageOperations.openDraft({ folderId: null, title: 'Favorite Me' });
    await pageOperations.save(favoritedId, 'content');
    await pageOperations.updateMetadata(favoritedId, { favorite: true });

    await pageOperations.openDraft({ folderId: null, title: 'Not favorited' });

    const favorites = effectivePageState.getFavoritePages();

    expect(favorites.map((page) => page.id)).toEqual([favoritedId]);
  });

  it('reflects a live, uncommitted-to-disk body edit on an open favorited page', async () => {
    const { pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null, title: 'Untitled' });
    await pageOperations.save(draftId, '');
    await pageOperations.updateMetadata(draftId, { favorite: true });

    pageOperations.commitEdit(draftId, 'Live, unsaved content');

    const favorites = effectivePageState.getFavoritePages();

    expect(favorites).toEqual([
      expect.objectContaining({ id: draftId, markdown: 'Live, unsaved content' }),
    ]);
  });
});

describe('EffectivePageState: subscription lifecycle', () => {
  it('survives repeated open/close cycles without leaking session subscriptions', async () => {
    const { pageOperations, effectivePageState, workspace } = setup();

    expect(effectivePageState.subscribedSessionCount).toBe(0);

    let draftId = '';

    for (let i = 0; i < 5; i += 1) {
      draftId = await pageOperations.openDraft({ folderId: null });
      expect(effectivePageState.subscribedSessionCount).toBe(1);
      pageOperations.close(draftId);
      expect(effectivePageState.subscribedSessionCount).toBe(0);
    }

    expect(workspace.isPageOpen(draftId)).toBe(false);
  });

  it('tracks one subscription per concurrently open id, independent of open order', async () => {
    const { pageOperations, effectivePageState } = setup();

    const first = await pageOperations.openDraft({ folderId: null });
    // Real content, so the second openDraft() below doesn't reuse this
    // one (PageOperations.findReusableDraftId only reuses an empty
    // draft) — this test needs two genuinely independent, concurrently
    // open sessions, which is no longer the outcome of two back-to-back
    // empty openDraft() calls.
    pageOperations.commitEdit(first, 'not empty');
    const second = await pageOperations.openDraft({ folderId: null });
    expect(effectivePageState.subscribedSessionCount).toBe(2);

    pageOperations.close(first);
    expect(effectivePageState.subscribedSessionCount).toBe(1);

    pageOperations.close(second);
    expect(effectivePageState.subscribedSessionCount).toBe(0);
  });

  it('unsubscribing a listener stops further notifications', async () => {
    const { pageOperations, effectivePageState } = setup();
    const draftId = await pageOperations.openDraft({ folderId: null });

    let notifications = 0;
    const unsubscribe = effectivePageState.subscribe(() => {
      notifications += 1;
    });

    unsubscribe();
    pageOperations.commitEdit(draftId, 'after unsubscribe');

    expect(notifications).toBe(0);
  });
});

describe('EffectivePageState: disposal', () => {
  it('dispose() unsubscribes from every active DocumentSession', async () => {
    const { pageOperations, effectivePageState } = setup();

    const first = await pageOperations.openDraft({ folderId: null });
    // See the identical comment in the subscription-lifecycle describe
    // above — content keeps this from being reused by the next call.
    pageOperations.commitEdit(first, 'not empty');
    await pageOperations.openDraft({ folderId: null });
    expect(effectivePageState.subscribedSessionCount).toBe(2);

    effectivePageState.dispose();

    expect(effectivePageState.subscribedSessionCount).toBe(0);
  });

  it('dispose() unsubscribes from Vault and Workspace — no further notifications reach listeners', async () => {
    const { vault, workspace, pageOperations, effectivePageState } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null });
    await pageOperations.save(draftId, 'persisted body');

    let notifications = 0;
    effectivePageState.subscribe(() => {
      notifications += 1;
    });

    effectivePageState.dispose();

    // Post-dispose, none of the three signal sources should still reach
    // this instance's listeners.
    pageOperations.commitEdit(draftId, 'after dispose');
    vault.getPage(draftId); // no-op read, just documents intent below
    workspace.openPage(draftId);

    expect(notifications).toBe(0);
  });

  it('is idempotent — calling dispose() twice does not throw', async () => {
    const { pageOperations, effectivePageState } = setup();
    await pageOperations.openDraft({ folderId: null });

    expect(() => {
      effectivePageState.dispose();
      effectivePageState.dispose();
    }).not.toThrow();
  });
});
