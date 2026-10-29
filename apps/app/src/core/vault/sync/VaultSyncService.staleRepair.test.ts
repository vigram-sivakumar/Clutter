import { describe, expect, it, vi } from 'vitest';
import { AtomicWriteFileSystem } from '../atomicWrite/AtomicWriteFileSystem';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { VaultSyncService } from './VaultSyncService';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';

// ADR-041: the Templates folder is the source of truth for `kind: template`.
const ROOT = '/vault';

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

function folder(id: string, name: string): Folder {
  return { id, name, path: `${ROOT}/${name}`, parentId: null, metadata: folderMetadata };
}

const templatesFolder = folder('folder-templates', 'Templates');
const projectsFolder = folder('folder-projects', 'Projects');

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function document(id: string, frontmatterLines: string[], body = 'Body'): string {
  return ['---', `id: ${id}`, ...frontmatterLines, '---', body].join('\n');
}

/** A tracked page whose raw unowned frontmatter is `lines`, in `parentId`. */
function trackedPage(path: string, id: string, lines: string[], parentId: string | null): Page {
  const page = new PageBuilder().build({
    parentId,
    page: {
      path: `${ROOT}/${path}`,
      directoryPath: `${ROOT}/${path.slice(0, path.lastIndexOf('/'))}`,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });

  return { ...page, metadata: { ...page.metadata, unownedFrontmatter: lines } };
}

function setup(pages: Page[]) {
  const vault = new Vault(
    ROOT,
    pages,
    [templatesFolder, projectsFolder],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const disk = new InMemoryVaultFileSystem();
  const writer = new InMemoryAtomicVaultWriter(disk);
  const fileSystem = new AtomicWriteFileSystem(disk, writer);
  const watcher = new FakeVaultFileSystemWatcher();
  new VaultSyncService(
    vault,
    fileSystem,
    watcher,
    new DocumentRegistry(),
    new FrontmatterSerializer(),
    new FakeIdGenerator()
  );

  return { vault, disk, writer, watcher };
}


describe('a Sync repair refused as stale reconciles the path from disk (ADR-063)', () => {
  it('an external edit that lands between the repair’s read and its write is kept, and the vault converges on it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const page = trackedPage('Templates/foo.md', 'p1', ['kind: template'], 'folder-templates');
    const { vault, disk, writer, watcher } = setup([page]);
    disk.seedFile(`${ROOT}/Projects/foo.md`, document('p1', ['kind: template']));
    const write = writer.write.bind(writer);
    let raced = false;
    vi.spyOn(writer, 'write').mockImplementation(async (attempt) => {
      if (!raced) {
        raced = true;
        await disk.writeFile(attempt.path, document('p1', ['kind: template'], 'EDITED BY ANOTHER APP'));
      }

      return write(attempt);
    });

    watcher.emit({ type: 'moved', fromPath: 'Templates/foo.md', toPath: 'Projects/foo.md' });
    for (let turn = 0; turn < 20; turn += 1) await flush();

    // The repair was refused, nothing of the external edit was lost, and Sync re-read the file instead of waiting.
    expect(await disk.readFile(`${ROOT}/Projects/foo.md`)).toContain('EDITED BY ANOTHER APP');
    expect(vault.getPage('p1')!.source.markdown).toBe('EDITED BY ANOTHER APP');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
