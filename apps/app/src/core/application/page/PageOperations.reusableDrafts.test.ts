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

describe('PageOperations.openAtPath(): retarget an existing empty draft (Daily Notes)', () => {
  it('clicking a second date while the first is still empty retargets the same draft (same id, same session) instead of creating a new one', async () => {
    const { pageOperations, documentRegistry } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const firstId = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });
    const secondId = await pageOperations.openAtPath(aug15, {
      type: 'daily-note',
    });

    expect(secondId).toBe(firstId);
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('the retargeted draft descriptor reflects the new date, not the old one', async () => {
    const { pageOperations } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const id = await pageOperations.openAtPath(aug9, { type: 'daily-note' });
    await pageOperations.openAtPath(aug15, { type: 'daily-note' });

    expect(pageOperations.getDraft(id)?.title).toBe('2026-08-15');
  });

  it('after retargeting, the getActiveDailyNoteDate helper (breadcrumbs/title/sidebar all key off this) reports the new date, not the old one', async () => {
    const { pageOperations, vault, workspace } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const id = await pageOperations.openAtPath(aug9, { type: 'daily-note' });
    expect(
      getActiveDailyNoteDate(vault, workspace.activePageId, pageOperations)
    ).toBe('2026-08-09');

    await pageOperations.openAtPath(aug15, { type: 'daily-note' });

    expect(id).toBe(workspace.activePageId);
    expect(
      getActiveDailyNoteDate(vault, workspace.activePageId, pageOperations)
    ).toBe('2026-08-15');
  });

  it('after retargeting, EffectivePageState reflects the new date under the new month folder, and the draft is gone from the old one', async () => {
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

    const id = await pageOperations.openAtPath(aug9, { type: 'daily-note' });
    expect(
      effectivePageState.getChildPages(august.id).map((p) => p.id)
    ).toContain(id);

    await pageOperations.openAtPath(sep1, { type: 'daily-note' });

    expect(
      effectivePageState.getChildPages(august.id).map((p) => p.id)
    ).not.toContain(id);
    expect(
      effectivePageState.getChildPages(september.id).map((p) => p.id)
    ).toContain(id);
    expect(effectivePageState.getPage(id)?.name).toBe('2026-09-01');
  });

  it('retargeting cleans up the old path mapping — reopening the abandoned date creates a fresh draft, not a stale reference to the retargeted one', async () => {
    const { pageOperations, documentRegistry } = setup();
    const aug9 = `${ROOT}/Daily Notes/2026/August/2026-08-09.md`;
    const aug15 = `${ROOT}/Daily Notes/2026/August/2026-08-15.md`;

    const firstId = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });
    await pageOperations.openAtPath(aug15, { type: 'daily-note' });

    // firstId now represents Aug 15. Reopening Aug 9 must not resolve
    // back to it (that would silently reinterpret Aug 15's session as
    // Aug 9 again) — it retargets the same still-empty draft once more.
    const reopenedAug9 = await pageOperations.openAtPath(aug9, {
      type: 'daily-note',
    });

    expect(reopenedAug9).toBe(firstId);
    expect(pageOperations.getDraft(firstId)?.title).toBe('2026-08-09');
    expect(documentRegistry.getAll()).toHaveLength(1);
  });

  it('does not retarget a draft that already has committed body content — keeps it, opens the new date as its own draft', async () => {
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
