import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
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

function buildPage(id = 'page-1', path = `${ROOT}/Note.md`, parentId: string | null = null): Page {
  return new PageBuilder().build({
    parentId,
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

describe('PagePersistenceCoordinator rename kind (completes spec §6 rename())', () => {
  it('renames the page in place — same parentId, new path, new name', async () => {
    const page = buildPage();
    const { vault, fileSystem, coordinator } = setup([page]);

    const result = await coordinator.enqueue(page.id, { kind: 'rename', title: 'Renamed' });

    expect(result.status).toBe('saved');
    const renamed = vault.getPage(page.id)!;
    expect(renamed.path).toBe(`${ROOT}/Renamed.md`);
    expect(renamed.parentId).toBeNull();
    expect(renamed.name).toBe('Renamed');
    expect(fileSystem.hasFileSync(`${ROOT}/Renamed.md`)).toBe(true);
    expect(fileSystem.hasFileSync(`${ROOT}/Note.md`)).toBe(false);
  });

  it('never reparents — stays under the same folder even if the new name matches something elsewhere', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const page = buildPage('page-1', `${ROOT}/Projects/Note.md`, 'folder-1');
    const { vault, coordinator } = setup([page], [folder]);

    await coordinator.enqueue(page.id, { kind: 'rename', title: 'Renamed' });

    expect(vault.getPage(page.id)!.parentId).toBe('folder-1');
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Projects/Renamed.md`);
  });

  it('preserves page content across a rename (no re-serialization)', async () => {
    const page = buildPage();
    const { vault, coordinator } = setup([page]);

    await coordinator.enqueue(page.id, { kind: 'rename', title: 'Renamed' });

    expect(vault.getPage(page.id)!.source.markdown).toBe('Body');
  });

  it('renaming to the current title is a harmless no-op, not a self-collision', async () => {
    const page = buildPage();
    const { vault, coordinator } = setup([page]);

    const result = await coordinator.enqueue(page.id, { kind: 'rename', title: 'Note' });

    expect(result.status).toBe('saved');
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Note.md`);
  });

  it('appends a numeric suffix when the new title collides with a sibling page', async () => {
    const page = buildPage('page-1', `${ROOT}/Note.md`);
    const occupant = buildPage('page-2', `${ROOT}/Other.md`);
    const { vault, coordinator } = setup([page, occupant]);

    const result = await coordinator.enqueue(page.id, { kind: 'rename', title: 'Other' });

    expect(result.status).toBe('saved');
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Other 2.md`);
    expect(vault.getPage('page-2')!.path).toBe(`${ROOT}/Other.md`);
  });

  it('abandons harmlessly for a page id that no longer exists, without wedging the queue', async () => {
    const { vault, fileSystem, coordinator } = setup([]);

    const result = await coordinator.enqueue('does-not-exist', {
      kind: 'rename',
      title: 'Anything',
    });

    expect(result).toEqual({
      status: 'abandoned',
      reason: 'Page no longer exists in the vault: does-not-exist',
    });

    const page = buildPage('page-new', `${ROOT}/New.md`);
    vault.addPage(page);
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
    const followUp = await coordinator.enqueue('page-new', { kind: 'rename', title: 'Renamed' });
    expect(followUp.status).toBe('saved');
  });
});
