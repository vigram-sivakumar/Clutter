import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { EffectivePageState } from './EffectivePageState';
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
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { getActiveDailyNoteDate } from '@features/daily-notes/helpers/getActiveDailyNoteDate';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';

const defaultFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function setup(folders: Folder[] = []) {
  const vault = new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
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
    new FolderOperations(
      vault,
      workspace,
      coordinator,
      new FolderPathResolver(vault),
      new FolderCreator(new UuidGenerator()),
      () => {},
      new DocumentRegistry(),
      new SaveCoordinator(),
      () => {}
    ),
    new DailyNoteService(),
    () => {}
  );
  const effectivePageState = new EffectivePageState(
    vault,
    query,
    pageOperations,
    workspace
  );

  return {
    vault,
    query,
    workspace,
    documentRegistry,
    pageOperations,
    effectivePageState,
    // Sessions with no Vault page are, by definition, the unsaved draft(s)
    // — the single-draft invariant says this is never above 1.
    draftCount: () =>
      documentRegistry.getAll().filter((session) => !vault.getPage(session.id)).length,
  };
}

const AUG_9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
const AUG_15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

// Single-global-draft invariant: PageOperations holds at most ONE unsaved
// draft at any time, across Notes and Daily Notes alike — not one per
// folder, per date, or per type. Every entry point goes through
// acquireDraft(), which retargets the draft while it is still empty and
// persists it first once it holds content.
describe('PageOperations: only one unsaved draft can exist', () => {
  it('starts with no draft', () => {
    const { draftCount } = setup();

    expect(draftCount()).toBe(0);
  });

  it('New Note cannot create a second draft — a repeated call returns the same id and session', async () => {
    const { pageOperations, documentRegistry, draftCount } = setup();

    const first = await pageOperations.openDraft({ folderId: null });
    const second = await pageOperations.openDraft({ folderId: null });

    expect(second).toBe(first);
    expect(draftCount()).toBe(1);
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('a folder "+" cannot create a second draft — the one empty draft is retargeted to that folder', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`, null);
    const areas = makeFolder('areas', `${ROOT}/Areas`, null);
    const { pageOperations, documentRegistry } = setup([projects, areas]);

    const first = await pageOperations.openDraft({ folderId: projects.id });
    expect(pageOperations.getDraft(first)?.folderId).toBe(projects.id);

    const second = await pageOperations.openDraft({ folderId: areas.id });

    expect(second).toBe(first);
    expect(pageOperations.getDraft(first)?.folderId).toBe(areas.id);
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('opening another Daily Note date cannot create a second draft — the one empty draft is retargeted to that date', async () => {
    const { pageOperations, documentRegistry, workspace } = setup();

    const first = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    const second = await pageOperations.openAtPath(AUG_15, { type: 'daily-note' });

    expect(second).toBe(first);
    expect(pageOperations.getDraft(first)?.title).toBe('2026-08-15');
    expect(workspace.activePageId).toBe(first);
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('the active Daily Note date reported to the UI follows the retargeted draft', async () => {
    const { pageOperations, vault, workspace } = setup();

    await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    expect(getActiveDailyNoteDate(vault, workspace.activePageId, pageOperations)).toBe('2026-08-09');

    await pageOperations.openAtPath(AUG_15, { type: 'daily-note' });
    expect(getActiveDailyNoteDate(vault, workspace.activePageId, pageOperations)).toBe('2026-08-15');
  });

  it('the slot is shared across types: a Note draft and a Daily Note draft are never both alive', async () => {
    const { pageOperations, documentRegistry } = setup();

    const noteDraft = await pageOperations.openDraft({ folderId: null });
    const dailyDraft = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });

    expect(dailyDraft).toBe(noteDraft);
    expect(pageOperations.getDraft(noteDraft)?.type).toBe('daily-note');

    const backToNote = await pageOperations.openDraft({ folderId: null });

    expect(backToNote).toBe(noteDraft);
    expect(pageOperations.getDraft(noteDraft)?.type).toBe('note');
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('reopening the draft brings it to the front even after focus moved to a real page', async () => {
    const { pageOperations, workspace } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null });
    const real = await pageOperations.create({ folderId: null, title: 'Real' });
    expect(workspace.activePageId).toBe(real);

    const again = await pageOperations.openDraft({ folderId: null });

    expect(again).toBe(draftId);
    expect(workspace.activePageId).toBe(draftId);
  });

  it('eager create() never occupies or displaces the single draft slot', async () => {
    const { pageOperations, draftCount } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null });
    const created = await pageOperations.create({ folderId: null, title: 'Eager', activate: false });

    expect(created).not.toBe(draftId);
    expect(pageOperations.getDraft(draftId)).toBeDefined();
    expect(pageOperations.getDraft(created)).toBeUndefined();
    expect(draftCount()).toBe(1);
  });
});

describe('PageOperations: a draft opened with tags', () => {
  it('stays an unpersisted draft until it has content, then persists with the tags', async () => {
    const { pageOperations, vault, draftCount } = setup();

    const id = await pageOperations.openDraft({ folderId: null, tags: ['work'] });

    expect(vault.getPage(id)).toBeUndefined();
    expect(draftCount()).toBe(1);

    pageOperations.commitEdit(id, 'Real content');
    await pageOperations.openDraft({ folderId: null });

    expect(vault.getPage(id)?.metadata.tags).toEqual(['work']);
  });
});

describe('PageOperations: navigating away from the single draft', () => {
  it('an empty draft is retargeted — same id, nothing persisted', async () => {
    const { pageOperations, vault, documentRegistry } = setup();

    const first = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    const second = await pageOperations.openAtPath(AUG_15, { type: 'daily-note' });

    expect(second).toBe(first);
    expect(vault.getPageByPath(AUG_9)).toBeUndefined();
    expect(vault.getPageByPath(AUG_15)).toBeUndefined();
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('a contentful draft is persisted, then the requested destination opens as the one draft', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`, null);
    const areas = makeFolder('areas', `${ROOT}/Areas`, null);
    const { pageOperations, vault, workspace, draftCount } = setup([projects, areas]);

    const first = await pageOperations.openDraft({ folderId: projects.id });
    pageOperations.commitEdit(first, 'Real content');

    const second = await pageOperations.openDraft({ folderId: areas.id });

    expect(vault.getPage(first)?.parentId).toBe(projects.id);
    expect(vault.getPage(first)?.source.markdown).toContain('Real content');
    expect(second).not.toBe(first);
    expect(pageOperations.getDraft(second)?.folderId).toBe(areas.id);
    expect(workspace.activePageId).toBe(second);
    expect(draftCount()).toBe(1);
  });

  it('a contentful Daily Note (Oct 3) navigating to Nov 15: Oct 3 persists, Nov 15 opens as the draft', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const { pageOperations, vault, workspace } = setup([root]);
    const oct3 = `${ROOT}/Daily Notes/2026/October/2026-10-03.md`;
    const nov15 = `${ROOT}/Daily Notes/2026/November/2026-11-15.md`;

    const first = await pageOperations.openAtPath(oct3, { type: 'daily-note' });
    pageOperations.commitEdit(first, 'Oct 3 entry');

    const second = await pageOperations.openAtPath(nov15, { type: 'daily-note' });

    expect(vault.getPage(first)?.path).toBe(oct3);
    expect(second).not.toBe(first);
    expect(pageOperations.getDraft(second)?.title).toBe('2026-11-15');
    expect(vault.getPageByPath(nov15)).toBeUndefined();
    expect(workspace.activePageId).toBe(second);
  });

  it('a contentful Note navigating to a Daily Note: the Note persists, the Daily Note opens', async () => {
    const { pageOperations, vault, workspace } = setup();

    const note = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(note, 'A note');

    const daily = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });

    expect(vault.getPage(note)).toBeDefined();
    expect(daily).not.toBe(note);
    expect(pageOperations.getDraft(daily)?.type).toBe('daily-note');
    expect(workspace.activePageId).toBe(daily);
  });

  it('a contentful Daily Note navigating to a new Note: the Daily Note persists, the Note opens', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const { pageOperations, vault, workspace } = setup([root]);

    const daily = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    pageOperations.commitEdit(daily, 'Aug 9');

    const note = await pageOperations.openDraft({ folderId: null });

    expect(vault.getPage(daily)?.path).toBe(AUG_9);
    expect(note).not.toBe(daily);
    expect(pageOperations.getDraft(note)?.type).toBe('note');
    expect(workspace.activePageId).toBe(note);
  });

  it('a contentful draft navigating to an existing persisted page persists the draft and opens the page', async () => {
    const { pageOperations, vault, workspace, draftCount } = setup();
    const realId = await pageOperations.create({ folderId: null, title: 'Real', activate: false });

    const draft = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(draft, 'Draft content');
    await pageOperations.open(realId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(workspace.activePageId).toBe(realId);
    expect(vault.getPage(draft)).toBeDefined();
    expect(draftCount()).toBe(0);
  });

  it('existing persisted pages stay navigable while a draft exists', async () => {
    const { pageOperations, workspace, draftCount } = setup();
    const realId = await pageOperations.create({ folderId: null, title: 'Real', activate: false });

    await pageOperations.openDraft({ folderId: null });
    expect(draftCount()).toBe(1);

    await pageOperations.open(realId);
    expect(workspace.activePageId).toBe(realId);
  });

  it('when persisting the old draft fails, the old draft is reopened rather than lost, and still no second draft exists', async () => {
    const { pageOperations, documentRegistry, workspace } = setup();

    const first = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(first, 'Precious');
    const failing = vi
      .spyOn(pageOperations, 'save')
      .mockRejectedValue(new Error('disk full'));

    const second = await pageOperations.openDraft({ folderId: null });

    failing.mockRestore();
    expect(second).toBe(first);
    expect(workspace.activePageId).toBe(first);
    expect(documentRegistry.get(first)?.currentRevision.markdown).toBe('Precious');
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('the single-draft invariant holds throughout a mixed sequence', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const { pageOperations, documentRegistry, vault, workspace } = setup([root]);

    const draftSessions = () =>
      documentRegistry.getAll().filter((session) => !vault.getPage(session.id));

    await pageOperations.openDraft({ folderId: null });
    expect(draftSessions()).toHaveLength(1);
    await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    expect(draftSessions()).toHaveLength(1);
    pageOperations.commitEdit(workspace.activePageId as string, 'x');
    await pageOperations.openDraft({ folderId: null });
    expect(draftSessions()).toHaveLength(1);
    await pageOperations.openAtPath(AUG_15, { type: 'daily-note' });
    expect(draftSessions()).toHaveLength(1);
  });

});

describe('PageOperations: existing persisted Daily Notes open normally', () => {
  it('opens the real page, creates no draft, and leaves an existing draft untouched', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const { pageOperations, vault, workspace, draftCount } = setup([root]);

    const id = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    await pageOperations.save(id, 'x');
    expect(vault.getPage(id)?.path).toBe(AUG_9);
    expect(draftCount()).toBe(0);

    const otherDraft = await pageOperations.openAtPath(AUG_15, { type: 'daily-note' });
    expect(otherDraft).not.toBe(id);

    const reopened = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });

    expect(reopened).toBe(id);
    expect(workspace.activePageId).toBe(id);
    // The pending Aug 15 draft is still the one and only draft.
    expect(pageOperations.getDraft(otherDraft)?.title).toBe('2026-08-15');
  });
});

describe('PageOperations: persisting the single draft', () => {
  it('a Note draft persists into the folder it was last targeted at, and the slot is freed', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`, null);
    const areas = makeFolder('areas', `${ROOT}/Areas`, null);
    const { pageOperations, vault, draftCount } = setup([projects, areas]);

    const id = await pageOperations.openDraft({ folderId: areas.id });
    await pageOperations.openDraft({ folderId: projects.id });
    await pageOperations.save(id, 'Some real content');

    expect(vault.getPage(id)?.path).toBe(`${ROOT}/Projects/Untitled.md`);
    expect(vault.getPage(id)?.parentId).toBe(projects.id);
    expect(draftCount()).toBe(0);
    expect(pageOperations.getDraft(id)).toBeUndefined();
  });

  it('a Daily Note draft persists at the last-targeted date\'s deterministic path, and the slot is freed', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const { pageOperations, vault, draftCount } = setup([root]);

    const id = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    await pageOperations.openAtPath(AUG_15, { type: 'daily-note' });
    await pageOperations.save(id, 'x');

    expect(vault.getPage(id)?.path).toBe(AUG_15);
    expect(vault.getPageByPath(AUG_9)).toBeUndefined();
    expect(draftCount()).toBe(0);
  });

  it('after persistence a new draft can be created, and it is a different draft', async () => {
    const { pageOperations, vault, draftCount } = setup();

    const first = await pageOperations.openDraft({ folderId: null });
    await pageOperations.save(first, 'Some real content');
    expect(draftCount()).toBe(0);

    const second = await pageOperations.openDraft({ folderId: null });

    expect(second).not.toBe(first);
    expect(draftCount()).toBe(1);
    expect(vault.getPage(first)).toBeDefined();
    expect(vault.getPage(second)).toBeUndefined();
  });

  it('a committed title promotes the one draft just like a body edit does', async () => {
    const { pageOperations, vault, draftCount } = setup();

    const id = await pageOperations.openDraft({ folderId: null });
    await pageOperations.updateDraftTitle(id, 'Named');

    expect(vault.getPage(id)?.path).toBe(`${ROOT}/Named.md`);
    expect(draftCount()).toBe(0);
  });

  it('closing the draft frees the slot', async () => {
    const { pageOperations, draftCount } = setup();

    const id = await pageOperations.openDraft({ folderId: null });
    pageOperations.close(id);

    expect(draftCount()).toBe(0);
  });
});
