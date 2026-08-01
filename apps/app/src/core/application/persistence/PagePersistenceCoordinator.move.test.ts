import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from '../move/MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { PageBuilder } from '../../vault/build/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';

function makeFolder(id: string, path: string): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: null,
    metadata: {
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function buildPage(id = 'page-1', path = `${ROOT}/Note.md`): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
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

function makeVault(pages: Page[], folders: Folder[] = []): Vault {
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

function setup(pages: Page[], folders: Folder[] = []) {
  const vault = makeVault(pages, folders);
  const fileSystem = new InMemoryVaultFileSystem();

  for (const page of pages) {
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
  }

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

describe('PagePersistenceCoordinator move kind', () => {
  it('relocates the page, updates path and parentId, preserves the filename', async () => {
    const page = buildPage();
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, coordinator } = setup([page], [folder]);

    const result = await coordinator.enqueue(page.id, {
      kind: 'move',
      destinationFolderId: 'folder-1',
    });

    expect(result.status).toBe('saved');
    expect(fileSystem.hasFileSync(`${ROOT}/Note.md`)).toBe(false);
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/Note.md`)).toBe(true);
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Projects/Note.md`);
    expect(vault.getPage(page.id)!.parentId).toBe('folder-1');
  });

  it('preserves page content across a move (no re-serialization)', async () => {
    const page = buildPage();
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, coordinator } = setup([page], [folder]);

    await coordinator.enqueue(page.id, { kind: 'move', destinationFolderId: 'folder-1' });

    expect(vault.getPage(page.id)!.source.markdown).toBe('Body');
  });

  it('throws for an unknown destination folder and touches no file', async () => {
    const page = buildPage();
    const { fileSystem, coordinator } = setup([page]);

    await expect(
      coordinator.enqueue(page.id, { kind: 'move', destinationFolderId: 'does-not-exist' })
    ).rejects.toThrow(/Folder not found: does-not-exist/);

    expect(fileSystem.hasFileSync(`${ROOT}/Note.md`)).toBe(true);
  });

  it('throws when the destination path is already occupied', async () => {
    const page = buildPage('page-1', `${ROOT}/Note.md`);
    const occupant = buildPage('page-occupant', `${ROOT}/Projects/Note.md`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { fileSystem, coordinator } = setup([page, occupant], [folder]);

    await expect(
      coordinator.enqueue(page.id, { kind: 'move', destinationFolderId: 'folder-1' })
    ).rejects.toThrow(/Path already in use/);

    expect(fileSystem.hasFileSync(`${ROOT}/Note.md`)).toBe(true);
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/Note.md`)).toBe(true);
  });

  it('abandons the operation for an unknown page id', async () => {
    const page = buildPage();
    const { coordinator } = setup([page]);

    await expect(
      coordinator.enqueue('does-not-exist', { kind: 'move', destinationFolderId: 'folder-1' })
    ).resolves.toEqual({
      status: 'abandoned',
      reason: 'Page no longer exists in the vault: does-not-exist',
    });
  });

  it('a move for one page and a save for another do not block each other', async () => {
    const movedPage = buildPage('page-1', `${ROOT}/Note.md`);
    const savedPage = buildPage('page-2', `${ROOT}/Other.md`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, coordinator } = setup([movedPage, savedPage], [folder]);

    const [moveResult, saveResult] = await Promise.all([
      coordinator.enqueue(movedPage.id, { kind: 'move', destinationFolderId: 'folder-1' }),
      coordinator.enqueue(savedPage.id, { kind: 'save', content: 'Edited body' }),
    ]);

    expect(moveResult.status).toBe('saved');
    expect(saveResult.status).toBe('saved');
    expect(vault.getPage(movedPage.id)!.path).toBe(`${ROOT}/Projects/Note.md`);
    expect(vault.getPage(savedPage.id)!.source.markdown).toBe('Edited body');
  });
});
