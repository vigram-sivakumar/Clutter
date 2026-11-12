import { VaultSyncService } from '../sync/VaultSyncService';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';
import { MoveService } from '../persistence/MoveService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { InMemoryVaultFileSystem } from './InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from './FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from './FakeIdGenerator';
import { InFlightPaths } from '../providers/InFlightPaths';
import type { Folder } from '../models/Folder';
import type { Page } from '../models/Page';
import type { MoveFileOptions, VaultFileSystem, VaultWriteIntent } from '../providers/VaultFileSystem';

/**
 * Two Clutter instances over one disk, for the cross-instance folder tests. Instance A is the one the user acts in:
 * a real Persistence Gate over its own Vault. Instance B only observes: a real VaultSyncService over its own Vault,
 * with open DocumentSessions, fed the watcher events a test chooses (the real watcher's shapes are in ADR-071's
 * folder follow-up). Nothing is shared between them but the filesystem.
 */

export const ROOT = '/vault';

const metadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

/**
 * Records every write, so a test can assert Sync rewrote nothing. With `atomic` it behaves like the packaged
 * provider as far as callers can tell: it declares `writesAreAtomic` so the repair writers run their
 * read-and-compare staleness check.
 */
class RecordingFileSystem implements VaultFileSystem {
  readonly writes: string[] = [];
  readonly writesAreAtomic: boolean;

  constructor(
    readonly inner: InMemoryVaultFileSystem,
    atomic = false
  ) {
    this.writesAreAtomic = atomic;
  }

  exists(path: string) {
    return this.inner.exists(path);
  }
  createDirectory(path: string) {
    return this.inner.createDirectory(path);
  }
  readDirectory(path: string) {
    return this.inner.readDirectory(path);
  }
  readFile(path: string) {
    return this.inner.readFile(path);
  }
  async writeFile(path: string, contents: string, intent?: VaultWriteIntent) {
    // The repair writer re-reads and compares before writing (persistSyncedFolderDocument.stillMatches); this
    // double only needs the `writesAreAtomic` declaration to turn that check on, so `intent` is not enforced here.
    void intent;
    this.writes.push(path);
    return this.inner.writeFile(path, contents);
  }
  deleteFile(path: string, options?: { recursive?: boolean }) {
    return this.inner.deleteFile(path, options);
  }
  copyFile(source: string, destination: string) {
    return this.inner.copyFile(source, destination);
  }
  moveFile(source: string, destination: string, options?: MoveFileOptions) {
    return this.inner.moveFile(source, destination, options);
  }
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export const PAGE_IDS = ['p-top', 'p-sub'] as const;

/** `persisted`: folders carry an `id` in `.folder.md`; otherwise they have none and their id is their path. */
export async function createFolderWorld(persisted: boolean, options: { atomic?: boolean } = {}) {
  const id = (name: string, path: string) => (persisted ? name : `${ROOT}/${path}`);
  const folder = (name: string, path: string, parentId: string | null): Folder => ({
    id: id(name, path),
    name: path.split('/').pop()!,
    path: `${ROOT}/${path}`,
    parentId,
    metadata,
  });
  const folders = () => {
    const archive = folder('folder-archive', 'Archive', null);
    const projects = folder('folder-projects', 'Projects', null);
    const sub = folder('folder-sub', 'Projects/Sub', projects.id);
    const dest = folder('folder-dest', 'Dest', null);
    return { archive, projects, sub, dest, all: [archive, projects, sub, dest] };
  };
  const page = (pageId: string, relativePath: string, parentId: string): Page =>
    new PageBuilder().build({
      parentId,
      page: {
        path: `${ROOT}/${relativePath}`,
        directoryPath: `${ROOT}/${relativePath.slice(0, relativePath.lastIndexOf('/'))}`,
        frontmatter: { id: pageId },
        frontmatterAnalysis: { aliases: [] },
        content: 'body',
        analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
      },
    });
  const pages = () => {
    const f = folders();
    return [page('p-top', 'Projects/N.md', f.projects.id), page('p-sub', 'Projects/Sub/M.md', f.sub.id)];
  };

  const serializer = new FrontmatterSerializer();
  const inner = new InMemoryVaultFileSystem();
  for (const f of folders().all) {
    await inner.createDirectory(f.path);
    if (persisted) inner.seedFile(`${f.path}/.folder.md`, serializer.serializeFolderDocument(f));
  }
  for (const p of pages()) inner.seedFile(p.path, serializer.serializeDocument(p, p.source.markdown));

  const fileSystem = new RecordingFileSystem(inner, options.atomic === true);
  const makeVault = () =>
    new Vault(ROOT, pages(), folders().all, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());

  const vaultA = makeVault();
  const gateA = new PagePersistenceCoordinator(
    fileSystem,
    vaultA,
    serializer,
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vaultA, fileSystem),
    undefined,
    new InFlightPaths()
  );

  const vaultB = makeVault();
  const watcher = new FakeVaultFileSystemWatcher();
  const documentRegistry = new DocumentRegistry();
  new VaultSyncService(vaultB, fileSystem, watcher, documentRegistry, serializer, new FakeIdGenerator());
  const sessions = { 'p-top': documentRegistry.open('p-top', 'body'), 'p-sub': documentRegistry.open('p-sub', 'body') };

  // What Application's workspace depends on: a tab closes when its page id is missing from the Vault at any
  // notification; `folderRemoved` records any folder removal.
  const folderRemoved: string[] = [];
  const pageRemoved: string[] = [];
  const missingAt: string[] = [];
  vaultB.subscribe((event) => {
    if (event.type === 'folder-removed') folderRemoved.push(event.folderId);
    if (event.type === 'page-removed') pageRemoved.push(event.pageId);
    for (const pageId of PAGE_IDS) {
      if (!vaultB.getPage(pageId)) missingAt.push(`${pageId}@${event.type}`);
    }
  });

  const initialIds = {
    folders: folders().all.map((f) => f.id).sort(),
    pages: PAGE_IDS.map((p) => p as string).sort(),
  };
  const initialTexts = {
    top: await inner.readFile(`${ROOT}/Projects/N.md`),
    sub: await inner.readFile(`${ROOT}/Projects/Sub/M.md`),
  };

  return {
    ids: { projects: folders().projects.id, sub: folders().sub.id, dest: folders().dest.id },
    inner,
    fileSystem,
    vaultA,
    vaultB,
    gateA,
    watcher,
    documentRegistry,
    sessions,
    folderRemoved,
    pageRemoved,
    missingAt,
    initialIds,
    initialTexts,
    serializer,
  };
}

export type FolderWorld = Awaited<ReturnType<typeof createFolderWorld>>;
