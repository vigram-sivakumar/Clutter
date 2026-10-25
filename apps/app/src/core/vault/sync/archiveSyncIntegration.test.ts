import { describe, expect, it } from 'vitest';

import { VaultSyncService } from './VaultSyncService';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';
import { MoveService } from '../persistence/MoveService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { InFlightPaths } from '../providers/InFlightPaths';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import type { MoveFileOptions, VaultFileSystem } from '../providers/VaultFileSystem';

const ROOT = '/vault';
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
const archiveFolder: Folder = { id: 'folder-archive', name: 'Archive', path: `${ROOT}/Archive`, parentId: null, metadata };

const page = (id: string, dir: string): Page =>
  new PageBuilder().build({
    parentId: null,
    page: {
      path: `${ROOT}/${dir}/Paragraph.md`,
      directoryPath: `${ROOT}/${dir}`,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: `body ${id}`,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });

/** Lets a test hold every move until it chooses to let them through. */
class HeldMoves implements VaultFileSystem {
  hold: Promise<void> | null = null;
  constructor(private readonly inner: InMemoryVaultFileSystem) {}
  exists(p: string) { return this.inner.exists(p); }
  createDirectory(p: string) { return this.inner.createDirectory(p); }
  readDirectory(p: string) { return this.inner.readDirectory(p); }
  readFile(p: string) { return this.inner.readFile(p); }
  writeFile(p: string, c: string) { return this.inner.writeFile(p, c); }
  deleteFile(p: string, o?: { recursive?: boolean }) { return this.inner.deleteFile(p, o); }
  copyFile(a: string, b: string) { return this.inner.copyFile(a, b); }
  async moveFile(a: string, b: string, options?: MoveFileOptions) {
    await this.hold;
    return this.inner.moveFile(a, b, options);
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('a multi-selection archive with the watcher reporting renames in between', () => {
  it('archives same-titled pages without any failing, and leaves one page per id at one path each', async () => {
    const pages = [page('p1', 'One'), page('p2', 'Two'), page('p3', 'Three')];
    const vault = new Vault(ROOT, pages, [archiveFolder], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
    const inner = new InMemoryVaultFileSystem();
    const serializer = new FrontmatterSerializer();
    for (const p of pages) {
      inner.seedFile(p.path, serializer.serializeDocument(p, p.source.markdown));
    }
    const fileSystem = new HeldMoves(inner);
    const inFlight = new InFlightPaths();
    const gate = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      serializer,
      new FrontmatterParser(),
      new PageRebuilder(),
      new MoveService(vault, fileSystem),
      undefined,
      inFlight
    );
    const watcher = new FakeVaultFileSystemWatcher();
    new VaultSyncService(vault, fileSystem, watcher, new DocumentRegistry(), serializer, new FakeIdGenerator(), undefined, inFlight);

    let release!: () => void;
    fileSystem.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    // All archives start together, as a bulk action starts them.
    const archives = pages.map((p) => gate.enqueue(p.id, { kind: 'archive' }));
    await flush();

    // The watcher's reports — including one paired with the WRONG file — arrive before any commit.
    watcher.emit({ type: 'moved', fromPath: 'One/Paragraph.md', toPath: 'Archive/Paragraph.md' });
    watcher.emit({ type: 'moved', fromPath: 'Two/Paragraph.md', toPath: 'Archive/Paragraph.md' });
    watcher.emit({ type: 'deleted', path: 'Three/Paragraph.md' });
    await flush();
    expect(pages.every((p) => vault.getPage(p.id) !== undefined)).toBe(true);

    release();
    const results = await Promise.allSettled(archives);
    await flush();
    await flush();

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    expect(vault.pageCount).toBe(3);
    const paths = pages.map((p) => vault.getPage(p.id)!.path.toLowerCase());
    expect(new Set(paths).size).toBe(3);
    for (const p of pages) {
      expect(vault.getPageByPath(vault.getPage(p.id)!.path)?.id).toBe(p.id);
      expect(await inner.readFile(vault.getPage(p.id)!.path)).toContain(`id: ${p.id}`);
    }
  });
});
