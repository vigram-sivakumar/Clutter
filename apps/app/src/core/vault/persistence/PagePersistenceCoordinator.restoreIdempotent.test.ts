import { describe, expect, it } from 'vitest';

import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { PageBuilder } from '../ingest/PageBuilder';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { AtomicExternalChangeError, AtomicNotCommittedError } from '../atomicWrite/atomicWriteErrors';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import type { MoveFileOptions, VaultFileSystem, VaultWriteIntent } from '../providers/VaultFileSystem';

/**
 * Restore moves the file (unguarded) and then rewrites its metadata through the guarded replace. Another
 * reconciliation (Sync's archive-metadata repair, in this or another instance) can apply that very rewrite in
 * between. The guarded write must then count as already done — and still refuse any other change on disk.
 */

const ROOT = '/vault';
const ARCHIVE = `${ROOT}/Archive`;

const folderMetadata = {
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

const folders: Folder[] = [
  { id: 'folder-archive', name: 'Archive', path: ARCHIVE, parentId: null, metadata: folderMetadata },
  { id: 'folder-One', name: 'One', path: `${ROOT}/One`, parentId: null, metadata: folderMetadata },
];

function notePage(): Page {
  return new PageBuilder().build({
    parentId: 'folder-One',
    page: {
      path: `${ROOT}/One/Note.md`,
      directoryPath: `${ROOT}/One`,
      frontmatter: { id: 'p1' },
      frontmatterAnalysis: { aliases: [] },
      content: 'body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

/** An atomic-style provider over the in-memory one: honours `replaceIf`, and lets a test act right after a move. */
class GuardedFileSystem implements VaultFileSystem {
  readonly writesAreAtomic = true;
  readonly replaceWrites: string[] = [];
  afterNextMove: ((destination: string) => Promise<void>) | null = null;

  constructor(readonly inner: InMemoryVaultFileSystem) {}

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
    if (typeof intent === 'object') {
      if ((await this.inner.readFile(path)) !== intent.replaceIf) {
        throw new AtomicNotCommittedError('staleExpected', path);
      }
      this.replaceWrites.push(path);
    }
    return this.inner.writeFile(path, contents);
  }
  deleteFile(path: string, options?: { recursive?: boolean }) {
    return this.inner.deleteFile(path, options);
  }
  copyFile(source: string, destination: string) {
    return this.inner.copyFile(source, destination);
  }
  async moveFile(source: string, destination: string, options?: MoveFileOptions) {
    const result = await this.inner.moveFile(source, destination, options);
    const hook = this.afterNextMove;
    this.afterNextMove = null;
    await hook?.(destination);
    return result;
  }
}

function setup() {
  const original = notePage();
  const vault = new Vault(ROOT, [original], folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const inner = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  inner.seedFile(original.path, serializer.serializeDocument(original, original.source.markdown));
  const fileSystem = new GuardedFileSystem(inner);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    serializer,
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );

  return { vault, inner, fileSystem, coordinator, original };
}

/** What a restore leaves on disk when nothing interferes: the document the guarded write intends. */
async function intendedRestoredDocument(): Promise<string> {
  const { coordinator, inner, original } = setup();
  await coordinator.enqueue('p1', { kind: 'archive' });
  await coordinator.enqueue('p1', { kind: 'restore' });
  return inner.readFile(original.path);
}

describe('restore: the guarded metadata write is idempotent', () => {
  it('normal restore without an intervening write still writes and succeeds', async () => {
    const { coordinator, vault, inner, fileSystem, original } = setup();
    await coordinator.enqueue('p1', { kind: 'archive' });
    fileSystem.replaceWrites.length = 0;

    const result = await coordinator.enqueue('p1', { kind: 'restore' });

    expect(result.status).toBe('saved');
    expect(vault.getPage('p1')!.path).toBe(original.path);
    expect(fileSystem.replaceWrites).toEqual([original.path]);
    expect(await inner.readFile(original.path)).not.toContain('archived');
  });

  it('another reconciliation wrote the exact intended document first: restore succeeds without another write', async () => {
    const intended = await intendedRestoredDocument();
    const { coordinator, vault, inner, fileSystem, original } = setup();
    await coordinator.enqueue('p1', { kind: 'archive' });
    fileSystem.replaceWrites.length = 0;
    fileSystem.afterNextMove = (destination) => inner.writeFile(destination, intended);

    const result = await coordinator.enqueue('p1', { kind: 'restore' });

    expect(result.status).toBe('saved');
    expect(fileSystem.replaceWrites).toEqual([]);
    expect(await inner.readFile(original.path)).toBe(intended);
    expect(vault.getPage('p1')!.path).toBe(original.path);
    expect(vault.getPage('p1')!.source.markdown).toBe('body');
  });

  it('an external body edit changes the document: restore still throws AtomicExternalChangeError and writes nothing', async () => {
    const intended = await intendedRestoredDocument();
    const edited = intended.replace('body', 'edited elsewhere');
    expect(edited).not.toBe(intended);
    const { coordinator, inner, fileSystem, original } = setup();
    await coordinator.enqueue('p1', { kind: 'archive' });
    fileSystem.replaceWrites.length = 0;
    fileSystem.afterNextMove = (destination) => inner.writeFile(destination, edited);

    await expect(coordinator.enqueue('p1', { kind: 'restore' })).rejects.toBeInstanceOf(AtomicExternalChangeError);

    expect(fileSystem.replaceWrites).toEqual([]);
    expect(await inner.readFile(original.path)).toBe(edited);
  });
});
