import { describe, expect, it } from 'vitest';
import { VaultSyncService } from './VaultSyncService';
import { reconcileVaultTemplateMetadata } from './reconcileTemplateMetadata';
import { Vault } from '../models/Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { PageBuilder } from '../ingest/PageBuilder';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../testing/FakeIdGenerator';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';

// ADR-041: the Templates folder is the source of truth for `kind: template`.
const ROOT = '/vault';

const folderMetadata = {
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
  const fileSystem = new InMemoryVaultFileSystem();
  const watcher = new FakeVaultFileSystemWatcher();
  new VaultSyncService(
    vault,
    fileSystem,
    watcher,
    new DocumentRegistry(),
    new FrontmatterSerializer(),
    new FakeIdGenerator()
  );

  return { vault, fileSystem, watcher };
}

const unowned = (vault: Vault, id: string) => vault.getPage(id)!.metadata.unownedFrontmatter ?? [];

describe('Sync reconciles the template marker after an external move (ADR-041)', () => {
  it('Templates/ → a normal folder removes `kind: template`, keeping other frontmatter', async () => {
    const page = trackedPage('Templates/foo.md', 'p1', ['Priority: high', 'kind: template'], 'folder-templates');
    const { vault, fileSystem, watcher } = setup([page]);
    fileSystem.seedFile(
      `${ROOT}/Projects/foo.md`,
      document('p1', ['Priority: high', 'kind: template'])
    );

    watcher.emit({ type: 'moved', fromPath: 'Templates/foo.md', toPath: 'Projects/foo.md' });
    await flush();

    expect(vault.getPage('p1')!.path).toBe(`${ROOT}/Projects/foo.md`);
    expect(unowned(vault, 'p1')).toEqual(['Priority: high']);
    const onDisk = fileSystem.getFileSync(`${ROOT}/Projects/foo.md`)!;
    expect(onDisk).not.toContain('kind:');
    expect(onDisk).toContain('Priority: high');
  });

  it('a normal folder → Templates/ adds `kind: template`, keeping other frontmatter', async () => {
    const page = trackedPage('Projects/foo.md', 'p2', ['Priority: high'], 'folder-projects');
    const { vault, fileSystem, watcher } = setup([page]);
    fileSystem.seedFile(`${ROOT}/Templates/foo.md`, document('p2', ['Priority: high']));

    watcher.emit({ type: 'moved', fromPath: 'Projects/foo.md', toPath: 'Templates/foo.md' });
    await flush();

    expect(vault.getPage('p2')!.path).toBe(`${ROOT}/Templates/foo.md`);
    expect(unowned(vault, 'p2')).toEqual(['Priority: high', 'kind: template']);
    const onDisk = fileSystem.getFileSync(`${ROOT}/Templates/foo.md`)!;
    expect(onDisk).toContain('kind: template');
    expect(onDisk).toContain('Priority: high');
  });

  it('into Templates/ updates an existing `kind` instead of adding a second one', async () => {
    const page = trackedPage('Projects/foo.md', 'p3', ['kind: book'], 'folder-projects');
    const { vault, fileSystem, watcher } = setup([page]);
    fileSystem.seedFile(`${ROOT}/Templates/foo.md`, document('p3', ['kind: book']));

    watcher.emit({ type: 'moved', fromPath: 'Projects/foo.md', toPath: 'Templates/foo.md' });
    await flush();

    expect(unowned(vault, 'p3')).toEqual(['kind: template']);
  });

  it('a normal note with no marker is left unchanged — nothing is rewritten', async () => {
    const page = trackedPage('Projects/a.md', 'p4', ['Priority: high'], 'folder-projects');
    const { vault, fileSystem, watcher } = setup([page]);
    const content = document('p4', ['Priority: high']);
    fileSystem.seedFile(`${ROOT}/Projects/b.md`, content);

    watcher.emit({ type: 'moved', fromPath: 'Projects/a.md', toPath: 'Projects/b.md' });
    await flush();

    expect(vault.getPage('p4')!.path).toBe(`${ROOT}/Projects/b.md`);
    expect(fileSystem.getFileSync(`${ROOT}/Projects/b.md`)).toBe(content);
  });

  it("moving out of Templates/ leaves a user's own `kind` value alone", async () => {
    const page = trackedPage('Templates/foo.md', 'p5', ['kind: book'], 'folder-templates');
    const { vault, fileSystem, watcher } = setup([page]);
    const content = document('p5', ['kind: book']);
    fileSystem.seedFile(`${ROOT}/Projects/foo.md`, content);

    watcher.emit({ type: 'moved', fromPath: 'Templates/foo.md', toPath: 'Projects/foo.md' });
    await flush();

    expect(unowned(vault, 'p5')).toEqual(['kind: book']);
    expect(fileSystem.getFileSync(`${ROOT}/Projects/foo.md`)).toBe(content);
  });
});

describe('Sync reconciles the template marker after a rebuild (ADR-041)', () => {
  it('a template that stays in Templates/ and is already marked is not rewritten', async () => {
    const page = trackedPage('Templates/foo.md', 'p6', ['kind: template'], 'folder-templates');
    const { fileSystem, watcher } = setup([page]);
    const content = document('p6', ['kind: template'], 'Edited externally');
    fileSystem.seedFile(`${ROOT}/Templates/foo.md`, content);

    watcher.emit({ type: 'changed', path: 'Templates/foo.md' });
    await flush();

    expect(fileSystem.getFileSync(`${ROOT}/Templates/foo.md`)).toBe(content);
  });

  it('a note edited in place inside Templates/ without the marker gets it', async () => {
    const page = trackedPage('Templates/foo.md', 'p7', [], 'folder-templates');
    const { vault, fileSystem, watcher } = setup([page]);
    fileSystem.seedFile(`${ROOT}/Templates/foo.md`, document('p7', ['Priority: high'], 'Edited'));

    watcher.emit({ type: 'changed', path: 'Templates/foo.md' });
    await flush();

    expect(unowned(vault, 'p7')).toEqual(['Priority: high', 'kind: template']);
    expect(fileSystem.getFileSync(`${ROOT}/Templates/foo.md`)).toContain('kind: template');
    expect(fileSystem.getFileSync(`${ROOT}/Templates/foo.md`)).toContain('Edited');
  });

  it('a new file created straight into Templates/ is marked', async () => {
    const { vault, fileSystem, watcher } = setup([]);
    fileSystem.seedFile(`${ROOT}/Templates/new.md`, document('p8', []));

    watcher.emit({ type: 'created', path: 'Templates/new.md', isDirectory: false });
    await flush();

    expect(unowned(vault, 'p8')).toEqual(['kind: template']);
  });
});

describe('startup pass reconcileVaultTemplateMetadata (ADR-041)', () => {
  it('repairs moves made while the app was closed, in both directions', async () => {
    const stale = trackedPage('Projects/stale.md', 's1', ['kind: template'], 'folder-projects');
    const missing = trackedPage('Templates/missing.md', 's2', [], 'folder-templates');
    const { vault, fileSystem } = setup([stale, missing]);
    fileSystem.seedFile(`${ROOT}/Projects/stale.md`, document('s1', ['kind: template']));
    fileSystem.seedFile(`${ROOT}/Templates/missing.md`, document('s2', []));

    await reconcileVaultTemplateMetadata({
      vault,
      fileSystem,
      serializer: new FrontmatterSerializer(),
      parser: new FrontmatterParser(),
      rebuilder: new PageRebuilder(),
    });

    expect(unowned(vault, 's1')).toEqual([]);
    expect(unowned(vault, 's2')).toEqual(['kind: template']);
  });
});
