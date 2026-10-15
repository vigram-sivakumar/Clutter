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
  it('moving a folder: includes a root row, first, titled with the vault\'s own physical folder name and labeled "Home"', () => {
    const parent = makeFolder('folder-parent', `${ROOT}/Parent`);
    const membershipSelector = makeMembershipSelector([parent]);

    const items = buildMoveDestinationItems(membershipSelector, 'folder-moving');

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

    expect(buildMoveDestinationItems(membershipSelector, 'folder-moving')[0]).toMatchObject({
      title: 'Vault',
      secondaryLabel: 'Home',
    });
  });

  it('moving a folder: returns only the root row for a vault with no other workspace folders', () => {
    const membershipSelector = makeMembershipSelector([]);

    expect(buildMoveDestinationItems(membershipSelector, 'folder-moving')).toEqual([
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

  it('excludes everything inside the Archive folder — an archived folder and its children — not only the folder itself', () => {
    const archive = makeFolder('folder-archive', `${ROOT}/Archive`);
    const archivedFolder = makeFolder('folder-old', `${ROOT}/Archive/Old`, 'folder-archive', 'archived');
    const nested = makeFolder('folder-old-child', `${ROOT}/Archive/Old/Child`, 'folder-old');
    const live = makeFolder('folder-live', `${ROOT}/Live`);
    const membershipSelector = makeMembershipSelector([archive, archivedFolder, nested, live]);

    const items = buildMoveDestinationItems(membershipSelector);

    expect(items.map((i) => i.id)).toEqual(['folder-live']);
    // The cover picker's flat Folders list is built from the same rule.
    expect(buildCoverFolderItems(membershipSelector).map((i) => i.id)).toEqual(['folder-live']);
  });

  it('excludes the reserved Daily Notes folder and everything nested inside it', () => {
    const dailyNotes = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const nested = makeFolder('folder-nested', `${ROOT}/Daily Notes/2026`, 'folder-daily-notes');
    const membershipSelector = makeMembershipSelector([dailyNotes, nested]);

    expect(buildMoveDestinationItems(membershipSelector)).toEqual([]);
  });

  it('moving a note (no excluded folder): never offers the vault root, but keeps every folder', () => {
    const parent = makeFolder('folder-parent', `${ROOT}/Parent`);
    const child = makeFolder('folder-child', `${ROOT}/Parent/Child`, 'folder-parent');
    const items = buildMoveDestinationItems(makeMembershipSelector([parent, child]));

    expect(items.map((i) => i.id)).not.toContain('__vault-root__');
    expect(items.some((i) => i.isRoot)).toBe(false);
    expect(items.map((i) => i.id)).toEqual(['folder-parent', 'folder-child']);
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
describe('buildMoveDestinationItems — zones (workspace, Templates and Assets roots)', () => {
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

  it('the workspace (default, a note move) offers Templates first (no vault root for a note), then ordinary folders — never Assets', () => {
    const items = buildMoveDestinationItems(makeMembershipSelector(zoneFolders()));

    expect(ids(items)).not.toContain('__vault-root__');
    expect(ids(items).slice(0, 3)).toEqual(['templates', 'templates-meetings', 'templates-reviews']);
    expect(ids(items)).toEqual(expect.arrayContaining(['projects']));
    expect(items[0]).toMatchObject({ icon: 'template', isRoot: true });
    expect(items[1]).toMatchObject({ level: 1, parentId: 'templates' });
    // Assets is its own hierarchy.
    for (const forbidden of ['assets', 'assets-images']) {
      expect(ids(items)).not.toContain(forbidden);
    }
  });

  it('a folder move offers the vault root, then Templates directly below it, then the rest — whatever the alphabetical order', () => {
    const items = buildMoveDestinationItems(makeMembershipSelector(zoneFolders()), 'projects');

    expect(ids(items).slice(0, 2)).toEqual(['__vault-root__', 'templates']);
  });

  it('a Templates folder being moved is not offered itself or its descendants, and without Templates nothing is added', () => {
    const items = buildMoveDestinationItems(makeMembershipSelector(zoneFolders()), 'templates-meetings');
    expect(ids(items)).toContain('templates-reviews');
    expect(ids(items)).not.toContain('templates-meetings');

    const none = buildMoveDestinationItems(makeMembershipSelector(zoneFolders().filter((f) => !f.path.includes('/Templates'))), 'projects');
    expect(ids(none)).not.toContain('templates');
  });

  it('lists folders under Templates at every depth, once each, with their path — alongside the ordinary folders', () => {
    const folders = [
      ...zoneFolders(),
      makeFolder('templates-weekly', `${ROOT}/Templates/Meetings/Weekly`, 'templates-meetings'),
      makeFolder('templates-deep', `${ROOT}/Templates/Meetings/Weekly/Archive 2`, 'templates-weekly'),
      makeFolder('projects-sub', `${ROOT}/Projects/Sub`, 'projects'),
    ];
    const items = buildMoveDestinationItems(makeMembershipSelector(folders));
    const all = ids(items);

    for (const id of ['templates-meetings', 'templates-reviews', 'templates-weekly', 'templates-deep', 'projects', 'projects-sub']) {
      expect(all.filter((candidate) => candidate === id), id).toHaveLength(1);
    }
    expect(new Set(all).size).toBe(all.length);
    expect(items.find((item) => item.id === 'templates-deep')?.ancestors?.map((a) => a.title)).toEqual([
      'Templates',
      'Meetings',
      'Weekly',
    ]);
  });

  it('can leave Templates out for non-Move callers', () => {
    const items = buildMoveDestinationItems(makeMembershipSelector(zoneFolders()), undefined, 'workspace', { includeTemplates: false });
    expect(ids(items)).not.toContain('templates');
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
