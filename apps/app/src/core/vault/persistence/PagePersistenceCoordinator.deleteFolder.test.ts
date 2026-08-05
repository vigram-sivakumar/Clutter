import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';

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

const defaultPageMetadata: Page['metadata'] = {
  icon: null,
  cover: null,
  description: null,
  favorite: false,
  status: 'active',
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

const defaultAnalysis: Page['analysis'] = {
  headings: [],
  aliases: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
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

function makePage(id: string, path: string, parentId: string | null): Page {
  return {
    id,
    type: 'note',
    name: path.slice(path.lastIndexOf('/') + 1).replace('.md', ''),
    path,
    parentId,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
  };
}

function makeVault(pages: Page[], folders: Folder[]): Vault {
  return new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function setup(pages: Page[] = [], folders: Folder[] = []) {
  const vault = makeVault(pages, folders);
  const fileSystem = new InMemoryVaultFileSystem();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );

  return { vault, fileSystem, coordinator };
}

describe('PagePersistenceCoordinator delete-folder vertical slice (ADR-024)', () => {
  it('deletes an empty folder — directory and .folder.md removed, folder gone from the vault', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, coordinator } = setup([], [folder]);
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(`${folder.path}/.folder.md`, '---\nid: folder-1\n---\n');

    const result = await coordinator.enqueue('folder-1', { kind: 'delete-folder' });

    expect(result.status).toBe('folder-deleted');
    expect(vault.getFolder('folder-1')).toBeUndefined();
    expect(await fileSystem.exists(folder.path)).toBe(false);
    expect(await fileSystem.exists(`${folder.path}/.folder.md`)).toBe(false);
  });

  it('cascades: deletes every descendant page file and nested folder, innermost first', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const design = makeFolder('folder-design', `${ROOT}/Projects/Design`, 'folder-projects');
    const notes = makePage('page-notes', `${ROOT}/Projects/Design/Notes.md`, 'folder-design');
    const { vault, fileSystem, coordinator } = setup([notes], [projects, design]);

    await fileSystem.createDirectory(design.path);
    await fileSystem.writeFile(notes.path, '# Notes');

    const result = await coordinator.enqueue('folder-projects', { kind: 'delete-folder' });

    expect(result.status).toBe('folder-deleted');
    expect(vault.getFolder('folder-projects')).toBeUndefined();
    expect(vault.getFolder('folder-design')).toBeUndefined();
    expect(vault.getPage('page-notes')).toBeUndefined();
    expect(await fileSystem.exists(notes.path)).toBe(false);
    expect(await fileSystem.exists(design.path)).toBe(false);
    expect(await fileSystem.exists(projects.path)).toBe(false);
  });

  it('leaves an unrelated sibling folder and its contents untouched', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const sibling = makeFolder('folder-sibling', `${ROOT}/Sibling`);
    const siblingPage = makePage('page-sibling', `${ROOT}/Sibling/Note.md`, 'folder-sibling');
    const { vault, fileSystem, coordinator } = setup(
      [siblingPage],
      [projects, sibling]
    );
    await fileSystem.createDirectory(projects.path);
    await fileSystem.createDirectory(sibling.path);
    await fileSystem.writeFile(siblingPage.path, '# Note');

    await coordinator.enqueue('folder-projects', { kind: 'delete-folder' });

    expect(vault.getFolder('folder-sibling')).toBeDefined();
    expect(vault.getPage('page-sibling')).toBeDefined();
    expect(await fileSystem.exists(siblingPage.path)).toBe(true);
  });

  it('abandons harmlessly for a folder id that no longer exists, without wedging the queue', async () => {
    const { vault, fileSystem, coordinator } = setup();

    const result = await coordinator.enqueue('does-not-exist', { kind: 'delete-folder' });

    expect(result.status).toBe('abandoned');

    const folder = makeFolder('folder-new', `${ROOT}/New`);
    vault.addFolder(folder);
    await fileSystem.createDirectory(folder.path);
    const followUp = await coordinator.enqueue('folder-new', { kind: 'delete-folder' });
    expect(followUp.status).toBe('folder-deleted');
  });

  it('does not block or get blocked by an operation for a different id', async () => {
    const a = makeFolder('folder-a', `${ROOT}/A`);
    const b = makeFolder('folder-b', `${ROOT}/B`);
    const { vault, fileSystem, coordinator } = setup([], [a, b]);
    await fileSystem.createDirectory(a.path);
    await fileSystem.createDirectory(b.path);

    const [resultA, resultB] = await Promise.all([
      coordinator.enqueue('folder-a', { kind: 'delete-folder' }),
      coordinator.enqueue('folder-b', { kind: 'delete-folder' }),
    ]);

    expect(resultA.status).toBe('folder-deleted');
    expect(resultB.status).toBe('folder-deleted');
    expect(vault.getFolder('folder-a')).toBeUndefined();
    expect(vault.getFolder('folder-b')).toBeUndefined();
  });
});
