import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { VaultPath } from '../../vault/ingest/VaultPath';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';

/**
 * PageOperations.move()'s reference rewriting reuses rename()'s exact workflow
 * (findReferencingPageIds() + rewriteReferencesAfterRename()) — this file mirrors
 * PageOperations.renameReferences.test.ts's fixtures and assertion shapes, swapping rename() for move()
 * into a destination folder, so the two suites stay easy to compare side by side.
 */

const ROOT = '/vault';

interface Doc {
  readonly id: string;
  readonly rel: string;
  readonly body: string;
  readonly frontmatter?: string;
}

function document({ id, body, frontmatter = '' }: Doc): string {
  return `---\nid: ${id}\n${frontmatter}---\n${body}`;
}

function buildPage(doc: Doc): Page {
  const parsed = new FrontmatterParser().parse(document(doc));
  const path = `${ROOT}/${doc.rel}`;

  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: VaultPath.parentDirectory(path),
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: parsed.frontmatterAnalysis,
      content: parsed.body,
      analysis: parsed.analysis,
    },
  });
}

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: {
      defaultTemplateId: null,
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      coverHidden: false,
      coverLayout: 'side' as const,
      coverPositionAbove: 50,
      coverPositionSide: 50,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function setup(docs: readonly Doc[], folders: readonly Folder[] = [makeFolder('folder-1', `${ROOT}/Destination`)]) {
  const pages = docs.map(buildPage);
  const vault = new Vault(ROOT, pages, folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const fileSystem = new InMemoryVaultFileSystem();

  for (const doc of docs) {
    fileSystem.seedFile(`${ROOT}/${doc.rel}`, document(doc));
  }

  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator(),
    () => {}
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    new SaveCoordinator(),
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {},
    undefined,
    undefined,
    (path) => fileSystem.readFile(path)
  );

  return { vault, fileSystem, documentRegistry, coordinator, pageOperations };
}

const TARGET: Doc = { id: 'target', rel: 'Meeting Notes.md', body: 'Target body' };

function bodyOf(vault: Vault, id: string): string {
  return vault.getPage(id)!.source.markdown;
}

describe('PageOperations.move — reference rewriting', () => {
  it('rewrites links and embeds to the moved note’s new path, keeping alias, heading, block reference and unrelated text', async () => {
    const source: Doc = {
      id: 'src',
      rel: 'Source.md',
      body: [
        'Prose about Meeting Notes stays.',
        '[[Meeting Notes]] [[Meeting Notes|Discussion]]',
        '![[Meeting Notes]] ![[Meeting Notes#Decisions]] [[Meeting Notes#^blk]]',
      ].join('\n'),
    };
    const { vault, pageOperations } = setup([TARGET, source]);

    const summary = await pageOperations.move(TARGET.id, 'folder-1');

    expect(vault.getPage(TARGET.id)!.path).toBe(`${ROOT}/Destination/Meeting Notes.md`);
    expect(bodyOf(vault, 'src')).toBe(
      [
        'Prose about Meeting Notes stays.',
        '[[Destination/Meeting Notes]] [[Destination/Meeting Notes|Discussion]]',
        '![[Destination/Meeting Notes]] ![[Destination/Meeting Notes#Decisions]] [[Destination/Meeting Notes#^blk]]',
      ].join('\n')
    );
    expect(summary).toMatchObject({ rewrittenPageIds: ['src'], skipped: [], failed: [], complete: true });
  });

  it('keeps the moved note’s id and content, changing only its path', async () => {
    const { vault, fileSystem, pageOperations } = setup([TARGET]);

    await pageOperations.move(TARGET.id, 'folder-1');

    const moved = vault.getPage(TARGET.id)!;
    expect(moved.path).toBe(`${ROOT}/Destination/Meeting Notes.md`);
    expect(moved.source.markdown).toBe('Target body');
    expect(await fileSystem.readFile(moved.path)).toContain('id: target');
  });

  it('leaves an unrelated reference to a different note untouched', async () => {
    const other: Doc = { id: 'other', rel: 'Other.md', body: 'Other body' };
    const source: Doc = { id: 'src', rel: 'Source.md', body: '[[Meeting Notes]] and [[Other]] stay distinct' };
    const { vault, pageOperations } = setup([TARGET, other, source]);

    await pageOperations.move(TARGET.id, 'folder-1');

    expect(bodyOf(vault, 'src')).toBe('[[Destination/Meeting Notes]] and [[Other]] stay distinct');
    // The untouched note is never even read/written by the move.
    expect(vault.getPage('other')!.path).toBe(`${ROOT}/Other.md`);
  });

  it('writes nothing for notes that do not reference the moved note', async () => {
    const { coordinator, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body: 'no links' }]);
    const enqueue = vi.spyOn(coordinator, 'enqueue');

    await pageOperations.move(TARGET.id, 'folder-1');

    expect(enqueue.mock.calls.map(([id, op]) => `${id}:${op.kind}`)).toEqual(['target:move']);
  });

  it('rewrites an open editor’s unsaved text, keeping the unsaved edit and persisting both', async () => {
    const source: Doc = { id: 'src', rel: 'Source.md', body: 'saved [[Meeting Notes]]' };
    const { vault, documentRegistry, fileSystem, pageOperations } = setup([TARGET, source]);
    await pageOperations.open('src');
    pageOperations.commitEdit('src', 'saved [[Meeting Notes]] plus unsaved typing');

    const summary = await pageOperations.move(TARGET.id, 'folder-1');

    expect(summary.complete).toBe(true);
    expect(documentRegistry.get('src')!.currentRevision.markdown).toBe('saved [[Destination/Meeting Notes]] plus unsaved typing');
    expect(bodyOf(vault, 'src')).toBe('saved [[Destination/Meeting Notes]] plus unsaved typing');
    expect(await fileSystem.readFile(`${ROOT}/Source.md`)).toContain('plus unsaved typing');
  });

  it('finds a link that exists only in an open editor’s unsaved text', async () => {
    const { documentRegistry, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body: 'nothing yet' }]);
    await pageOperations.open('src');
    pageOperations.commitEdit('src', 'nothing yet [[Meeting Notes]]');

    await pageOperations.move(TARGET.id, 'folder-1');

    expect(documentRegistry.get('src')!.currentRevision.markdown).toBe('nothing yet [[Destination/Meeting Notes]]');
  });

  it('does not overwrite a note that changed on disk; other notes are still updated', async () => {
    const a: Doc = { id: 'a', rel: 'A.md', body: '[[Meeting Notes]]' };
    const b: Doc = { id: 'b', rel: 'B.md', body: '[[Meeting Notes]]' };
    const { vault, fileSystem, pageOperations } = setup([TARGET, a, b]);
    const external = document({ ...a, body: '[[Meeting Notes]] edited elsewhere' });
    await fileSystem.writeFile(`${ROOT}/A.md`, external);

    const summary = await pageOperations.move(TARGET.id, 'folder-1');

    expect(await fileSystem.readFile(`${ROOT}/A.md`)).toBe(external);
    expect(bodyOf(vault, 'b')).toBe('[[Destination/Meeting Notes]]');
    expect(summary.rewrittenPageIds).toEqual(['b']);
    expect(summary.skipped).toEqual([{ pageId: 'a', path: `${ROOT}/A.md`, reason: 'changed-on-disk' }]);
    expect(summary.complete).toBe(false);
  });

  it('leaves references alone when another note has taken the old path, and says so', async () => {
    const { vault, coordinator, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body: '[[Meeting Notes]]' }]);
    const original = coordinator.enqueue.bind(coordinator);
    vi.spyOn(coordinator, 'enqueue').mockImplementation(async (id, operation) => {
      const result = await original(id, operation);
      if (operation.kind === 'move') {
        vault.addPage(buildPage({ id: 'newcomer', rel: 'Meeting Notes.md', body: 'new' }));
      }
      return result;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const summary = await pageOperations.move(TARGET.id, 'folder-1');

    expect(bodyOf(vault, 'src')).toBe('[[Meeting Notes]]');
    expect(summary.skipped.map((s) => s.reason)).toEqual(['old-path-reoccupied']);
  });

  it('keeps the index and References consistent: the rewritten link resolves to the moved note', async () => {
    const link: Doc = { id: 'l', rel: 'L.md', body: 'see [[Meeting Notes]]' };
    const { vault, pageOperations } = setup([TARGET, link]);

    await pageOperations.move(TARGET.id, 'folder-1');

    const edges = vault.knowledgeGraph().incomingEdges(TARGET.id);
    expect(edges).toMatchObject([{ sourcePageId: 'l', kind: 'link' }]);
    expect(bodyOf(vault, 'l').slice(edges[0]!.startOffset, edges[0]!.endOffset)).toBe('[[Destination/Meeting Notes]]');
  });

  it('a move with no referencing pages is reported as a no-op rewrite — existing move() behavior otherwise unchanged', async () => {
    const { vault, pageOperations } = setup([TARGET, { id: 'other', rel: 'Other.md', body: 'no links at all' }]);

    const summary = await pageOperations.move(TARGET.id, 'folder-1');

    expect(summary).toEqual({ rewrittenPageIds: [], skipped: [], failed: [], complete: true });
    expect(vault.getPage(TARGET.id)!.path).toBe(`${ROOT}/Destination/Meeting Notes.md`);
  });

  it('still rejects moving into an archived folder (existing collision/validation behavior preserved)', async () => {
    // Archived is physical location (ADR-026) — a folder path under Archive/, not a metadata.status flag.
    const archivedFolder = makeFolder('folder-archived', `${ROOT}/Archive/Old`);
    const { pageOperations } = setup([TARGET], [makeFolder('folder-1', `${ROOT}/Destination`), archivedFolder]);

    await expect(pageOperations.move(TARGET.id, 'folder-archived')).rejects.toThrow(/archived/);
  });
});
