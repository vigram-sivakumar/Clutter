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

describe('PageOperations.openDraft(): reuse an existing empty draft (Notes)', () => {
  it('a second openDraft() call while the first is still empty returns the same id, not a new one', async () => {
    const { pageOperations, documentRegistry } = setup();

    const firstId = await pageOperations.openDraft({ folderId: null });
    const secondId = await pageOperations.openDraft({ folderId: null });

    expect(secondId).toBe(firstId);
    // Only one live session exists — reuse, not "hide the extra one".
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('reusing an empty draft brings it to the front (becomes the active page) even after focus moved elsewhere', async () => {
    const { pageOperations, workspace } = setup();

    const firstId = await pageOperations.openDraft({ folderId: null });
    // Move focus away — a different type, so it can't itself be reused by
    // the openDraft('note') call below.
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-09.md`,
      {
        type: 'daily-note',
      }
    );
    expect(workspace.activePageId).not.toBe(firstId);

    const secondId = await pageOperations.openDraft({ folderId: null });

    expect(secondId).toBe(firstId);
    expect(workspace.activePageId).toBe(firstId);
  });

  it('does not reuse a draft that already has committed body content — content is never discarded', async () => {
    const { pageOperations, documentRegistry } = setup();

    const firstId = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(firstId, 'Some real content the user typed');

    const secondId = await pageOperations.openDraft({ folderId: null });

    expect(secondId).not.toBe(firstId);
    expect(documentRegistry.get(firstId)?.currentRevision.markdown).toBe(
      'Some real content the user typed'
    );
    expect(documentRegistry.getAll()).toHaveLength(2);
  });

  it('once a draft is empty again — i.e. a fresh one after a non-empty one existed — a third call reuses the newest empty draft', async () => {
    const { pageOperations, documentRegistry } = setup();

    const firstId = await pageOperations.openDraft({ folderId: null });
    pageOperations.commitEdit(firstId, 'Has content');
    const secondId = await pageOperations.openDraft({ folderId: null });
    const thirdId = await pageOperations.openDraft({ folderId: null });

    expect(thirdId).toBe(secondId);
    expect(documentRegistry.getAll()).toHaveLength(2);
  });
});

describe('PageOperations.openAtPath(): each Daily Note date has its own stable draft identity', () => {
  // Superseded deliberately: an earlier design reused a still-empty Daily
  // Note draft across different dates by retargeting its descriptor in
  // place. That collapsed distinct, individually-navigable destinations
  // onto one shared identity, which broke Back/Forward's ability to visit
  // each date on its own (a live draft referenced by navigation history —
  // Workspace.isReferencedInHistory() — must resolve to the exact date it
  // represents). openAtPath() no longer calls findReusableDraftId() at
  // all; the only reuse left is `draftIdByDeterministicPath`'s exact-path
  // lookup, unchanged. openDraft()'s empty-draft reuse for plain Notes
  // (above) is unaffected — Notes have no date identity to preserve.

  it('opening a second, different date while the first is still empty creates a separate draft — no retargeting', async () => {
    const { pageOperations, documentRegistry } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const firstId = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });
    const secondId = await pageOperations.openAtPath(aug15, {
      type: 'daily-note',
    });

    expect(secondId).not.toBe(firstId);
    expect(documentRegistry.getAll()).toHaveLength(2);
  });

  it('each draft keeps its own date in its descriptor — opening a later date does not rewrite an earlier one', async () => {
    const { pageOperations } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const id = await pageOperations.openAtPath(aug9, { type: 'daily-note' });
    await pageOperations.openAtPath(aug15, { type: 'daily-note' });

    expect(pageOperations.getDraft(id)?.title).toBe('2026-08-09');
  });

  it('the getActiveDailyNoteDate helper (breadcrumbs/title/sidebar all key off this) reports each draft\'s own date', async () => {
    const { pageOperations, vault, workspace } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const id9 = await pageOperations.openAtPath(aug9, { type: 'daily-note' });
    expect(
      getActiveDailyNoteDate(vault, workspace.activePageId, pageOperations)
    ).toBe('2026-08-09');

    const id15 = await pageOperations.openAtPath(aug15, { type: 'daily-note' });

    expect(id15).not.toBe(id9);
    expect(id15).toBe(workspace.activePageId);
    expect(
      getActiveDailyNoteDate(vault, workspace.activePageId, pageOperations)
    ).toBe('2026-08-15');
  });

  it('EffectivePageState lists each date as its own child of its own month folder', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const august = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const september = makeFolder(
      'month-september',
      `${ROOT}/Daily Notes/2026/September`,
      'year-2026'
    );
    const { pageOperations, effectivePageState } = setup([
      root,
      year,
      august,
      september,
    ]);

    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const sep1 = `${ROOT}/Daily Notes/2026/September/2026-09-01.md`;

    const augId = await pageOperations.openAtPath(aug9, { type: 'daily-note' });
    expect(
      effectivePageState.getChildPages(august.id).map((p) => p.id)
    ).toContain(augId);

    const sepId = await pageOperations.openAtPath(sep1, { type: 'daily-note' });

    // The August draft is still there, under August — never moved.
    expect(
      effectivePageState.getChildPages(august.id).map((p) => p.id)
    ).toContain(augId);
    expect(
      effectivePageState.getChildPages(september.id).map((p) => p.id)
    ).toContain(sepId);
    expect(effectivePageState.getPage(sepId)?.name).toBe('2026-09-01');
  });

  it('reopening an earlier date resolves back to its own draft, unaffected by later dates opened in between', async () => {
    const { pageOperations, documentRegistry } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const firstId = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });
    await pageOperations.openAtPath(aug15, { type: 'daily-note' });

    const reopenedAug9 = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });

    expect(reopenedAug9).toBe(firstId);
    expect(pageOperations.getDraft(firstId)?.title).toBe('2026-08-09');
    expect(documentRegistry.getAll()).toHaveLength(2);
  });

  it('a draft with committed body content is likewise left alone — the new date opens as its own, separate draft', async () => {
    const { pageOperations, documentRegistry } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const firstId = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });
    pageOperations.commitEdit(firstId, "Aug 9's real entry");

    const secondId = await pageOperations.openAtPath(aug15, {
      type: 'daily-note',
    });

    expect(secondId).not.toBe(firstId);
    expect(pageOperations.getDraft(firstId)?.title).toBe('2026-08-09');
    expect(documentRegistry.get(firstId)?.currentRevision.markdown).toBe(
      "Aug 9's real entry"
    );
    expect(documentRegistry.getAll()).toHaveLength(2);
  });

  it('a real, persisted page at the target path is opened directly, never considered for retargeting', async () => {
    const root = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const { pageOperations, vault, documentRegistry } = setup([root]);
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;

    const draftId = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });
    pageOperations.commitEdit(draftId, 'x');
    await pageOperations.save(draftId, 'x');

    expect(vault.getPage(draftId)).toBeDefined();

    const reopened = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });

    expect(reopened).toBe(draftId);
    expect(documentRegistry.getAll()).toHaveLength(1);
  });
});
