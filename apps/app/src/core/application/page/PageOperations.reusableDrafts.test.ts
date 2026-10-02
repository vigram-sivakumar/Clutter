import { describe, expect, it } from 'vitest';
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
  };
}

const AUG_9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
const AUG_15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

// Single-global-draft invariant: PageOperations holds at most ONE unsaved
// draft at any time, across Notes and Daily Notes alike — not one per
// folder, per date, or per type. Every entry point goes through
// acquireDraft(), which retargets the draft while it is still empty and
// reopens it unchanged once it holds content.
describe('PageOperations: only one unsaved draft can exist', () => {
  it('starts with no draft', () => {
    const { pageOperations } = setup();

    expect(pageOperations.hasDraft()).toBe(false);
  });

  it('New Note cannot create a second draft — a repeated call returns the same id and session', async () => {
    const { pageOperations, documentRegistry } = setup();

    const first = await pageOperations.openDraft({ folderId: null });
    const second = await pageOperations.openDraft({ folderId: null });

    expect(second).toBe(first);
    expect(pageOperations.hasDraft()).toBe(true);
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

  it('a draft that already holds content is never repurposed or replaced — every entry point just reopens it', async () => {
    const { pageOperations, documentRegistry } = setup();

    const first = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    pageOperations.commitEdit(first, "Aug 9's real entry");

    const viaNote = await pageOperations.openDraft({ folderId: null });
    const viaDate = await pageOperations.openAtPath(AUG_15, { type: 'daily-note' });

    expect(viaNote).toBe(first);
    expect(viaDate).toBe(first);
    expect(pageOperations.getDraft(first)?.title).toBe('2026-08-09');
    expect(documentRegistry.get(first)?.currentRevision.markdown).toBe("Aug 9's real entry");
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
    const { pageOperations } = setup();

    const draftId = await pageOperations.openDraft({ folderId: null });
    const created = await pageOperations.create({ folderId: null, title: 'Eager', activate: false });

    expect(created).not.toBe(draftId);
    expect(pageOperations.getDraft(draftId)).toBeDefined();
    expect(pageOperations.getDraft(created)).toBeUndefined();
    expect(pageOperations.hasDraft()).toBe(true);
  });
});

describe('PageOperations: existing persisted Daily Notes open normally', () => {
  it('opens the real page, creates no draft, and leaves an existing draft untouched', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const { pageOperations, vault, workspace } = setup([root]);

    const id = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    await pageOperations.save(id, 'x');
    expect(vault.getPage(id)?.path).toBe(AUG_9);
    expect(pageOperations.hasDraft()).toBe(false);

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
    const { pageOperations, vault } = setup([projects, areas]);

    const id = await pageOperations.openDraft({ folderId: areas.id });
    await pageOperations.openDraft({ folderId: projects.id });
    await pageOperations.save(id, 'Some real content');

    expect(vault.getPage(id)?.path).toBe(`${ROOT}/Projects/Untitled.md`);
    expect(vault.getPage(id)?.parentId).toBe(projects.id);
    expect(pageOperations.hasDraft()).toBe(false);
    expect(pageOperations.getDraft(id)).toBeUndefined();
  });

  it('a Daily Note draft persists at the last-targeted date\'s deterministic path, and the slot is freed', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const { pageOperations, vault } = setup([root]);

    const id = await pageOperations.openAtPath(AUG_9, { type: 'daily-note' });
    await pageOperations.openAtPath(AUG_15, { type: 'daily-note' });
    await pageOperations.save(id, 'x');

    expect(vault.getPage(id)?.path).toBe(AUG_15);
    expect(vault.getPageByPath(AUG_9)).toBeUndefined();
    expect(pageOperations.hasDraft()).toBe(false);
  });

  it('after persistence a new draft can be created, and it is a different draft', async () => {
    const { pageOperations, vault } = setup();

    const first = await pageOperations.openDraft({ folderId: null });
    await pageOperations.save(first, 'Some real content');
    expect(pageOperations.hasDraft()).toBe(false);

    const second = await pageOperations.openDraft({ folderId: null });

    expect(second).not.toBe(first);
    expect(pageOperations.hasDraft()).toBe(true);
    expect(vault.getPage(first)).toBeDefined();
    expect(vault.getPage(second)).toBeUndefined();
  });

  it('a committed title promotes the one draft just like a body edit does', async () => {
    const { pageOperations, vault } = setup();

    const id = await pageOperations.openDraft({ folderId: null });
    await pageOperations.updateDraftTitle(id, 'Named');

    expect(vault.getPage(id)?.path).toBe(`${ROOT}/Named.md`);
    expect(pageOperations.hasDraft()).toBe(false);
  });

  it('closing the draft frees the slot', async () => {
    const { pageOperations } = setup();

    const id = await pageOperations.openDraft({ folderId: null });
    pageOperations.close(id);

    expect(pageOperations.hasDraft()).toBe(false);
  });
});
