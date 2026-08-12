import { describe, expect, it } from 'vitest';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { VaultQuery } from '../queries/VaultQuery';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import {
  reconcileFolderArchiveMetadata,
  reconcileVaultArchiveMetadata,
} from './reconcileArchiveMetadata';

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

// ADR-026's Sync amendment: folders get the same startup repair pages
// already had — a folder left `status: archived` after being moved out of
// Archive/ while Clutter was closed must be corrected on next boot, not
// just live.
function makeArchivedFolder(path: string, id: string, parentId: string | null): Folder {
  return {
    id,
    name: path.split('/').pop()!,
    path: `${ROOT}/${path}`,
    parentId,
    metadata: {
      ...defaultFolderMetadata,
      status: 'archived',
      archivedAt: '2024-01-01T00:00:00.000Z',
      originalPath: `${ROOT}/Projects`,
      originalParentId: null,
    },
  };
}

describe('reconcileFolderArchiveMetadata (ADR-026 Sync amendment)', () => {
  it('clears archive metadata for an archived folder found outside Archive/, and persists the correction', async () => {
    const folder = makeArchivedFolder('Projects', 'folder-archived-1', null);
    const vault = makeVault([], [folder]);
    const fileSystem = new InMemoryVaultFileSystem();

    const reconciled = await reconcileFolderArchiveMetadata(
      { vault, fileSystem, serializer: new FrontmatterSerializer() },
      folder
    );

    expect(reconciled).not.toBeNull();
    expect(reconciled!.metadata.status).toBe('active');
    expect(reconciled!.metadata.archivedAt).toBeNull();
    expect(reconciled!.metadata.originalPath).toBeNull();
    expect(reconciled!.metadata.originalParentId).toBeNull();

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/.folder.md`)!;
    expect(disk).toMatch(/status:\s*active/);
    expect(disk).not.toMatch(/status:\s*archived/);

    const vaultFolder = vault.getFolder('folder-archived-1')!;
    expect(vaultFolder.metadata.status).toBe('active');
  });

  it('leaves an archived folder inside Archive/ untouched (no correction, no write)', async () => {
    const folder = makeArchivedFolder('Archive/Projects', 'folder-archived-2', 'folder-archive');
    const vault = makeVault([], [folder]);
    const fileSystem = new InMemoryVaultFileSystem();

    const reconciled = await reconcileFolderArchiveMetadata(
      { vault, fileSystem, serializer: new FrontmatterSerializer() },
      folder
    );

    expect(reconciled).toBeNull();
    expect(fileSystem.getFileSync(`${ROOT}/Archive/Projects/.folder.md`)).toBeUndefined();
  });

  it('leaves an active folder inside Archive/ untouched — entering Archive/ externally never auto-archives', async () => {
    const folder: Folder = {
      id: 'folder-active-in-archive',
      name: 'Reference',
      path: `${ROOT}/Archive/Reference`,
      parentId: 'folder-archive',
      metadata: defaultFolderMetadata,
    };
    const vault = makeVault([], [folder]);
    const fileSystem = new InMemoryVaultFileSystem();

    const reconciled = await reconcileFolderArchiveMetadata(
      { vault, fileSystem, serializer: new FrontmatterSerializer() },
      folder
    );

    expect(reconciled).toBeNull();
    expect(vault.getFolder('folder-active-in-archive')!.metadata.status).toBe('active');
  });
});

describe('reconcileVaultArchiveMetadata folder startup pass (ADR-026 Sync amendment)', () => {
  it('repairs a folder left status: archived after being moved out of Archive/ while the app was closed', async () => {
    const stalePage = buildPage('Projects/Note.md', 'A note', 'page-1');
    const staleFolder = makeArchivedFolder('Projects', 'folder-archived-3', null);
    const vault = makeVault([stalePage], [staleFolder]);
    const fileSystem = new InMemoryVaultFileSystem();

    await reconcileVaultArchiveMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    const repaired = vault.getFolder('folder-archived-3')!;
    expect(repaired.path).toBe(`${ROOT}/Projects`);
    expect(repaired.metadata.status).toBe('active');
    expect(repaired.metadata.archivedAt).toBeNull();
    expect(repaired.metadata.originalPath).toBeNull();
    expect(repaired.metadata.originalParentId).toBeNull();

    const disk = fileSystem.getFileSync(`${ROOT}/Projects/.folder.md`)!;
    expect(disk).toMatch(/status:\s*active/);

    // The startup pass touches pages and folders independently — an
    // unrelated page in the same vault is untouched.
    expect(vault.getPage('page-1')!.metadata.status).toBe('active');
  });

  it('leaves a correctly-archived folder inside Archive/ untouched on startup', async () => {
    const archivedFolder = makeArchivedFolder('Archive/Projects', 'folder-archived-4', 'folder-archive');
    const vault = makeVault([], [archivedFolder]);
    const fileSystem = new InMemoryVaultFileSystem();

    await reconcileVaultArchiveMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    const folder = vault.getFolder('folder-archived-4')!;
    expect(folder.metadata.status).toBe('archived');
    expect(fileSystem.getFileSync(`${ROOT}/Archive/Projects/.folder.md`)).toBeUndefined();
  });

  it('does not touch descendant folders/pages metadata when repairing the ancestor', async () => {
    const staleFolder = makeArchivedFolder('Projects', 'folder-archived-5', null);
    const nestedFolder: Folder = {
      id: 'folder-nested',
      name: 'Design',
      path: `${ROOT}/Projects/Design`,
      parentId: 'folder-archived-5',
      metadata: defaultFolderMetadata,
    };
    const nestedPage = buildPage('Projects/Design/Notes.md', 'Nested note', 'page-nested');
    const nestedPageWithParent: Page = { ...nestedPage, parentId: 'folder-nested' };
    const vault = makeVault([nestedPageWithParent], [staleFolder, nestedFolder]);
    const fileSystem = new InMemoryVaultFileSystem();

    await reconcileVaultArchiveMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    expect(vault.getFolder('folder-archived-5')!.metadata.status).toBe('active');
    // Descendants were never archived themselves, so nothing to repair —
    // their own metadata is byte-for-byte what it started as.
    expect(vault.getFolder('folder-nested')!.metadata).toEqual(defaultFolderMetadata);
    expect(vault.getPage('page-nested')!.metadata.status).toBe('active');
    expect(vault.getPage('page-nested')!.metadata.archivedAt).toBeNull();
  });
});
