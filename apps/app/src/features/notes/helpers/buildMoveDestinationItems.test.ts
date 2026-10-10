import { describe, expect, it } from 'vitest';
import { buildCoverFolderItems } from './buildCoverFolderItems';
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
  defaultTemplateId: null,
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

function makeFolder(
  id: string,
  path: string,
  parentId: string | null = null,
  status: Folder['metadata']['status'] = 'active'
): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: status === 'active' ? defaultFolderMetadata : { ...defaultFolderMetadata, status },
  };
}

function makeMembershipSelector(folders: Folder[], root: string = ROOT): MembershipSelector {
  const vault = new Vault(root, [], folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
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
  it('always includes a root row, first, titled with the vault\'s own physical folder name and labeled "Home"', () => {
    const parent = makeFolder('folder-parent', `${ROOT}/Parent`);
    const membershipSelector = makeMembershipSelector([parent]);

    const items = buildMoveDestinationItems(membershipSelector);

    expect(items[0]).toEqual({
      id: '__vault-root__',
      title: 'vault',
      secondaryLabel: 'Home',
      isRoot: true,
      level: 0,
      parentId: null,
    });
  });

  it('falls back to "Vault" only when the root folder name is genuinely empty', () => {
    const membershipSelector = makeMembershipSelector([], '/');

    expect(buildMoveDestinationItems(membershipSelector)[0]).toMatchObject({
      title: 'Vault',
      secondaryLabel: 'Home',
    });
  });

  it('returns only the root row for a vault with no workspace folders', () => {
    const membershipSelector = makeMembershipSelector([]);

    expect(buildMoveDestinationItems(membershipSelector)).toEqual([
      {
        id: '__vault-root__',
        title: 'vault',
        secondaryLabel: 'Home',
        isRoot: true,
        level: 0,
        parentId: null,
      },
    ]);
  });

  it('includes ordinary workspace folders, nested with increasing level and correct parentId', () => {
    const parent = makeFolder('folder-parent', `${ROOT}/Parent`);
    const child = makeFolder('folder-child', `${ROOT}/Parent/Child`, 'folder-parent');
    const membershipSelector = makeMembershipSelector([parent, child]);

    const items = buildMoveDestinationItems(membershipSelector);
    const ids = items.map((item) => item.id);

    expect(ids).toEqual(['__vault-root__', 'folder-parent', 'folder-child']);
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

  it('excludes everything inside the Archive folder — an archived folder and its children — not only the folder itself', () => {
    const archive = makeFolder('folder-archive', `${ROOT}/Archive`);
    const archivedFolder = makeFolder('folder-old', `${ROOT}/Archive/Old`, 'folder-archive', 'archived');
    const nested = makeFolder('folder-old-child', `${ROOT}/Archive/Old/Child`, 'folder-old');
    const live = makeFolder('folder-live', `${ROOT}/Live`);
    const membershipSelector = makeMembershipSelector([archive, archivedFolder, nested, live]);

    const items = buildMoveDestinationItems(membershipSelector);

    expect(items.map((i) => i.id)).toEqual(['__vault-root__', 'folder-live']);
    // The cover picker's flat Folders list is built from the same rule.
    expect(buildCoverFolderItems(membershipSelector).map((i) => i.id)).toEqual(['folder-live']);
  });

  it('excludes the reserved Daily Notes folder and everything nested inside it', () => {
    const dailyNotes = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const nested = makeFolder('folder-nested', `${ROOT}/Daily Notes/2026`, 'folder-daily-notes');
    const membershipSelector = makeMembershipSelector([dailyNotes, nested]);

    const items = buildMoveDestinationItems(membershipSelector);

    expect(items).toEqual([
      {
        id: '__vault-root__',
        title: 'vault',
        secondaryLabel: 'Home',
        isRoot: true,
        level: 0,
        parentId: null,
      },
    ]);
  });

  it('excludes an excluded folder id and every one of its descendants, but keeps the root row', () => {
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const child = makeFolder('folder-2', `${ROOT}/Projects/Sub`, 'folder-1');
    const sibling = makeFolder('folder-3', `${ROOT}/Other`);
    const membershipSelector = makeMembershipSelector([source, child, sibling]);

    const items = buildMoveDestinationItems(membershipSelector, 'folder-1');
    const ids = items.map((item) => item.id);

    expect(ids).toContain('__vault-root__');
    expect(ids).not.toContain('folder-1');
    expect(ids).not.toContain('folder-2');
    expect(ids).toContain('folder-3');
  });
});

// ADR-049: the same builder (and so the same picker) serves each resource's own root.
describe('buildMoveDestinationItems — zones (workspace and Assets roots; Templates are flat and never move)', () => {
  const zoneFolders = () => [
    makeFolder('templates', `${ROOT}/Templates`),
    makeFolder('templates-meetings', `${ROOT}/Templates/Meetings`, 'templates'),
    makeFolder('templates-reviews', `${ROOT}/Templates/Reviews`, 'templates'),
    makeFolder('assets', `${ROOT}/Assets`),
    makeFolder('assets-images', `${ROOT}/Assets/Images`, 'assets'),
    makeFolder('assets-pdfs', `${ROOT}/Assets/PDFs`, 'assets'),
    makeFolder('inbox', `${ROOT}/Inbox`),
    makeFolder('projects', `${ROOT}/Projects`),
    makeFolder('daily', `${ROOT}/Daily Notes`),
  ];
  const ids = (items: { id: string }[]) => items.map((item) => item.id);

  it('the workspace (default) offers the vault root and ordinary folders — never Templates or Assets', () => {
    const items = buildMoveDestinationItems(makeMembershipSelector(zoneFolders()));

    expect(items[0]).toMatchObject({ id: '__vault-root__', isRoot: true });
    expect(ids(items)).toEqual(expect.arrayContaining(['projects']));
    // Templates are flat and a note never moves into one; Assets is its own hierarchy.
    for (const forbidden of ['templates', 'templates-meetings', 'assets', 'assets-images']) {
      expect(ids(items)).not.toContain(forbidden);
    }
  });

  it('an Asset is offered the Assets root first, then only folders inside Assets', () => {
    const items = buildMoveDestinationItems(makeMembershipSelector(zoneFolders()), undefined, 'assets');

    expect(items[0]).toMatchObject({ id: 'assets', title: 'Assets', isRoot: true, level: 0 });
    expect(ids(items)).toEqual(['assets', 'assets-images', 'assets-pdfs']);
    for (const forbidden of ['__vault-root__', 'projects', 'inbox', 'daily', 'templates', 'templates-meetings']) {
      expect(ids(items)).not.toContain(forbidden);
    }
  });

  it("the Assets zone's subfolders carry the root in their path so the picker shows where they live", () => {
    const items = buildMoveDestinationItems(makeMembershipSelector(zoneFolders()), undefined, 'assets');

    expect(items[1]?.ancestors).toEqual([{ id: 'assets', title: 'Assets', emoji: null }]);
  });

  it('a zone whose root does not exist yet offers nothing (it is never created speculatively)', () => {
    expect(buildMoveDestinationItems(makeMembershipSelector([makeFolder('projects', `${ROOT}/Projects`)]), undefined, 'assets')).toEqual([]);
  });

  it('a moved folder is excluded from its own zone list, with its descendants', () => {
    const items = buildMoveDestinationItems(makeMembershipSelector(zoneFolders()), 'assets-images', 'assets');

    expect(ids(items)).toEqual(['assets', 'assets-pdfs']);
  });
});
