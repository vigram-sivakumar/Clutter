import { describe, expect, it } from 'vitest';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../build/PageBuilder';
import { PageRebuilder } from '../build/PageRebuilder';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FrontmatterSerializer } from '../understand/FrontmatterSerializer';
import { FrontmatterParser } from '../understand/FrontmatterParser';
import { VaultQuery } from '../queries/VaultQuery';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import { reconcileVaultArchiveMetadata } from './reconcileArchiveMetadata';

const ROOT = '/vault';

const defaultFolderMetadata = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeVault(pages: Page[] = [], folders: Folder[] = []): Vault {
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

function buildPage(path: string, content: string, pageId: string): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${path}`,
      directoryPath: ROOT,
      frontmatter: { id: pageId },
      frontmatterAnalysis: { aliases: [] },
      content,
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

function buildArchivedPage(path: string, content: string, pageId: string): Page {
  const page = buildPage(path, content, pageId);

  return {
    ...page,
    parentId: 'folder-projects',
    metadata: {
      ...page.metadata,
      status: 'archived',
      archivedAt: '2024-01-01T00:00:00.000Z',
      originalPath: `${ROOT}/Inbox/Note.md`,
      originalParentId: 'folder-inbox',
    },
  };
}

function makeProjectsFolder(): Folder {
  return {
    id: 'folder-projects',
    name: 'Projects',
    path: `${ROOT}/Projects`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function archivedDiskDocument(pageId: string, body: string): string {
  return [
    '---',
    `id: ${pageId}`,
    'status: archived',
    'archivedAt: 2024-01-01T00:00:00.000Z',
    `originalPath: ${ROOT}/Inbox/Note.md`,
    'originalParentId: folder-inbox',
    '---',
    body,
  ].join('\n');
}

describe('reconcileVaultArchiveMetadata', () => {
  it('repairs stale archive metadata on startup after app-closed external move out of Archive', async () => {
    const stalePage = buildArchivedPage(
      'Projects/Clutter.md',
      'Moved while app was closed',
      'page-archived-1'
    );
    const vault = makeVault([stalePage], [makeProjectsFolder()]);
    const fileSystem = new InMemoryVaultFileSystem();

    fileSystem.seedFile(
      `${ROOT}/Projects/Clutter.md`,
      archivedDiskDocument('page-archived-1', 'Moved while app was closed')
    );

    await reconcileVaultArchiveMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    const restored = vault.getPage('page-archived-1')!;
    expect(restored.path).toBe(`${ROOT}/Projects/Clutter.md`);
    expect(restored.metadata.status).toBe('active');
    expect(restored.metadata.archivedAt).toBeNull();
    expect(restored.metadata.originalPath).toBeNull();
    expect(restored.metadata.originalParentId).toBeNull();

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/Clutter.md`)!;
    expect(disk).toMatch(/status:\s*active/);
    expect(disk).not.toMatch(/status:\s*archived/);

    const query = new VaultQuery(vault);
    expect(query.getChildPages('folder-projects').map((page) => page.id)).toContain(
      'page-archived-1'
    );
    expect(query.getArchivedPages().map((page) => page.id)).not.toContain(
      'page-archived-1'
    );
  });

  it('leaves active page inside Archive untouched on startup', async () => {
    const activeInArchive: Page = {
      ...buildPage('Archive/Reference/API.md', 'Reference doc', 'page-ref-1'),
      parentId: 'folder-archive',
      metadata: {
        ...buildPage('Archive/Reference/API.md', 'Reference doc', 'page-ref-1')
          .metadata,
        status: 'active',
      },
    };
    const archiveFolder: Folder = {
      id: 'folder-archive',
      name: 'Archive',
      path: `${ROOT}/Archive`,
      parentId: null,
      metadata: defaultFolderMetadata,
    };
    const vault = makeVault([activeInArchive], [archiveFolder]);
    const fileSystem = new InMemoryVaultFileSystem();

    fileSystem.seedFile(
      `${ROOT}/Archive/Reference/API.md`,
      '---\nid: page-ref-1\nstatus: active\n---\nReference doc'
    );

    await reconcileVaultArchiveMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    const page = vault.getPage('page-ref-1')!;
    expect(page.metadata.status).toBe('active');
    expect(page.path).toBe(`${ROOT}/Archive/Reference/API.md`);
    expect(fileSystem.getFileSync(`${ROOT}/Archive/Reference/API.md`)).toBe(
      '---\nid: page-ref-1\nstatus: active\n---\nReference doc'
    );
  });

  it('leaves correctly archived pages inside Archive untouched on startup', async () => {
    const archivedPage = buildArchivedPage(
      'Archive/Note.md',
      'Still archived',
      'page-archived-2'
    );
    const archiveFolder: Folder = {
      id: 'folder-archive',
      name: 'Archive',
      path: `${ROOT}/Archive`,
      parentId: null,
      metadata: defaultFolderMetadata,
    };
    const archivedInArchive: Page = {
      ...archivedPage,
      parentId: 'folder-archive',
    };
    const vault = makeVault([archivedInArchive], [archiveFolder]);
    const fileSystem = new InMemoryVaultFileSystem();

    fileSystem.seedFile(
      `${ROOT}/Archive/Note.md`,
      archivedDiskDocument('page-archived-2', 'Still archived')
    );

    await reconcileVaultArchiveMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    const page = vault.getPage('page-archived-2')!;
    expect(page.metadata.status).toBe('archived');
    expect(fileSystem.getFileSync(`${ROOT}/Archive/Note.md`)).toBe(
      archivedDiskDocument('page-archived-2', 'Still archived')
    );
  });
});
