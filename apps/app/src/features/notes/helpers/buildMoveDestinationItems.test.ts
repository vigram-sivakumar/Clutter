import { describe, expect, it } from 'vitest';
import { buildMoveDestinationItems } from './buildMoveDestinationItems';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { PageOperations } from '@core/application/page/PageOperations';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { MoveService } from '@core/vault/persistence/MoveService';
import { PagePathResolver } from '@core/application/page/PagePathResolver';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { Workspace } from '@core/workspace/Workspace';
import type { Folder } from '@core/vault/models/Folder';

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

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function makeMembershipSelector(folders: Folder[]): MembershipSelector {
  const vault = new Vault(ROOT, [], folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const query = new VaultQuery(vault);
  const workspace = new Workspace();
  const fileSystem = new InMemoryVaultFileSystem();
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
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    documentRegistry,
    saveCoordinator,
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
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);

  return new MembershipSelector(vault, query, effectivePageState);
}

describe('buildMoveDestinationItems', () => {
  it('never includes a row for the vault root — it is the implicit container, not an item', () => {
    const parent = makeFolder('folder-parent', `${ROOT}/Parent`);
    const membershipSelector = makeMembershipSelector([parent]);

    const items = buildMoveDestinationItems(membershipSelector);

    expect(items.map((i) => i.id)).not.toContain('__vault-root__');
    expect(items.every((i) => i.id !== '')).toBe(true);
  });

  it('returns an empty list for a vault with no workspace folders', () => {
    const membershipSelector = makeMembershipSelector([]);

    expect(buildMoveDestinationItems(membershipSelector)).toEqual([]);
  });

  it('includes ordinary workspace folders, nested with increasing level and correct parentId', () => {
    const parent = makeFolder('folder-parent', `${ROOT}/Parent`);
    const child = makeFolder('folder-child', `${ROOT}/Parent/Child`, 'folder-parent');
    const membershipSelector = makeMembershipSelector([parent, child]);

    const items = buildMoveDestinationItems(membershipSelector);
    const ids = items.map((item) => item.id);

    expect(ids).toEqual(['folder-parent', 'folder-child']);
    expect(items.find((i) => i.id === 'folder-parent')).toMatchObject({ level: 0, parentId: null });
    expect(items.find((i) => i.id === 'folder-child')).toMatchObject({
      level: 1,
      parentId: 'folder-parent',
    });
  });

  it('excludes the reserved Archive folder', () => {
    const archive = makeFolder('folder-archive', `${ROOT}/Archive`);
    const membershipSelector = makeMembershipSelector([archive]);

    const items = buildMoveDestinationItems(membershipSelector);

    expect(items.map((i) => i.id)).not.toContain('folder-archive');
  });

  it('excludes the reserved Daily Notes folder and everything nested inside it', () => {
    const dailyNotes = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const nested = makeFolder('folder-nested', `${ROOT}/Daily Notes/2026`, 'folder-daily-notes');
    const membershipSelector = makeMembershipSelector([dailyNotes, nested]);

    const items = buildMoveDestinationItems(membershipSelector);

    expect(items).toEqual([]);
  });

  it('excludes an excluded folder id and every one of its descendants', () => {
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const child = makeFolder('folder-2', `${ROOT}/Projects/Sub`, 'folder-1');
    const sibling = makeFolder('folder-3', `${ROOT}/Other`);
    const membershipSelector = makeMembershipSelector([source, child, sibling]);

    const items = buildMoveDestinationItems(membershipSelector, 'folder-1');
    const ids = items.map((item) => item.id);

    expect(ids).not.toContain('folder-1');
    expect(ids).not.toContain('folder-2');
    expect(ids).toContain('folder-3');
  });
});
