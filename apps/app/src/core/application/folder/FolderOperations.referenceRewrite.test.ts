import { describe, expect, it, vi } from 'vitest';
import { FolderOperations } from './FolderOperations';
import { PageOperations } from '../page/PageOperations';
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
import { PagePathResolver } from '../page/PagePathResolver';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from './FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';

/**
 * FolderOperations.move()/.rename()'s WikiLink reference rewriting — the folder-subtree, multi-target
 * extension of PageOperations.rename()'s single-target rewriteReferencesAfterRename() (see
 * PageOperations.moveReferences.test.ts for that single-note case). Both facades are wired together here
 * exactly as the Composition Root wires them (FolderOperations' rewriteReferences hook forwards to the
 * real PageOperations.rewriteReferences()), so these are integration tests of the real write path, not of
 * a mock.
 */

const ROOT = '/vault';

interface Doc {
  readonly id: string;
  readonly rel: string;
  readonly body: string;
  readonly parentId?: string | null;
}

function document({ id, body }: Doc): string {
  return `---\nid: ${id}\n---\n${body}`;
}

function buildPage(doc: Doc): Page {
  const parsed = new FrontmatterParser().parse(document(doc));
  const path = `${ROOT}/${doc.rel}`;

  return new PageBuilder().build({
    parentId: doc.parentId ?? null,
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

async function setup(folders: readonly Folder[], docs: readonly Doc[]) {
  const pages = docs.map(buildPage);
  const vault = new Vault(ROOT, pages, folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const fileSystem = new InMemoryVaultFileSystem();

  // The fake filesystem's moveFile (unlike MoveService.movePage's auto-created destination) requires the
  // source directory entry to already exist — mirrors FolderOperations.test.ts's own existing fixtures.
  for (const folder of folders) {
    await fileSystem.createDirectory(folder.path);
  }

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

  // Deferred binding, mirroring Application.ts's own construction-order workaround (FolderOperations is
  // built before PageOperations exists) — the closure resolves `pageOperations` lazily, by the time it's
  // actually called, never by the time it's constructed.
  let pageOperations!: PageOperations;

  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    documentRegistry,
    new SaveCoordinator(),
    () => {},
    undefined,
    undefined,
    (referencingPageIds, mapping) => pageOperations.rewriteReferences(referencingPageIds, mapping)
  );

  pageOperations = new PageOperations(
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

  return { vault, fileSystem, documentRegistry, coordinator, folderOperations, pageOperations };
}

function bodyOf(vault: Vault, id: string): string {
  return vault.getPage(id)!.source.markdown;
}

describe('FolderOperations.move() — reference rewriting', () => {
  it('moves a folder and rewrites every descendant page’s references, including a folder-link to the moved folder itself and multiple affected links in one referencing page', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`);
    const sub = makeFolder('sub', `${ROOT}/Projects/Sub`, 'projects');
    const work = makeFolder('work', `${ROOT}/Work`);
    const plan: Doc = { id: 'plan', rel: 'Projects/Plan.md', body: 'The plan', parentId: 'projects' };
    const detail: Doc = { id: 'detail', rel: 'Projects/Sub/Detail.md', body: 'Detail', parentId: 'sub' };
    const unrelated: Doc = { id: 'unrelated', rel: 'Elsewhere.md', body: 'Nothing to do with Projects' };
    const source: Doc = {
      id: 'src',
      rel: 'Source.md',
      body: [
        'See [[Projects/Plan]] and [[Projects/Sub/Detail]].',
        'Folders: [[Projects/]] and [[Projects/Sub/]].',
        'Also [[Elsewhere]] stays as is.',
      ].join('\n'),
    };
    const { vault, folderOperations, pageOperations } = await setup(
      [projects, sub, work],
      [plan, detail, unrelated, source]
    );

    const summary = await folderOperations.move('projects', 'work');

    expect(vault.getFolder('projects')!.path).toBe(`${ROOT}/Work/Projects`);
    expect(vault.getFolder('sub')!.path).toBe(`${ROOT}/Work/Projects/Sub`);
    expect(vault.getPage('plan')!.path).toBe(`${ROOT}/Work/Projects/Plan.md`);
    expect(vault.getPage('detail')!.path).toBe(`${ROOT}/Work/Projects/Sub/Detail.md`);

    // One rewrite, one save, covering every affected target in this one referencing page.
    expect(bodyOf(vault, 'src')).toBe(
      [
        'See [[Work/Projects/Plan]] and [[Work/Projects/Sub/Detail]].',
        'Folders: [[Work/Projects/]] and [[Work/Projects/Sub/]].',
        'Also [[Elsewhere]] stays as is.',
      ].join('\n')
    );
    // The unrelated page is never touched.
    expect(vault.getPage('unrelated')!.path).toBe(`${ROOT}/Elsewhere.md`);
    expect(bodyOf(vault, 'unrelated')).toBe('Nothing to do with Projects');

    // Backlinks/graph: the rewritten links resolve to the moved pages at their new locations.
    const planEdges = vault.knowledgeGraph().incomingEdges('plan');
    expect(planEdges).toMatchObject([{ sourcePageId: 'src', kind: 'link' }]);
    const detailEdges = vault.knowledgeGraph().incomingEdges('detail');
    expect(detailEdges).toMatchObject([{ sourcePageId: 'src', kind: 'link' }]);

    // move()'s own return value is still the asset-reference contract, untouched by this feature — this
    // move never crossed the Assets boundary, so it stays `undefined`, exactly as before.
    expect(summary).toBeUndefined();
    expect(pageOperations).toBeDefined();
  });

  it('renaming a folder in place rewrites descendant references the same way', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`);
    const plan: Doc = { id: 'plan', rel: 'Projects/Plan.md', body: 'The plan', parentId: 'projects' };
    const source: Doc = { id: 'src', rel: 'Source.md', body: 'See [[Projects/Plan]] and [[Projects/]]' };
    const { vault, folderOperations } = await setup([projects], [plan, source]);

    await folderOperations.rename('projects', 'Initiatives');

    expect(vault.getFolder('projects')!.path).toBe(`${ROOT}/Initiatives`);
    expect(vault.getPage('plan')!.path).toBe(`${ROOT}/Initiatives/Plan.md`);
    expect(bodyOf(vault, 'src')).toBe('See [[Initiatives/Plan]] and [[Initiatives/]]');
  });

  it('rewrites an open editor’s unsaved text for a page referencing a moved subtree, keeping the unsaved edit and persisting both', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`);
    const work = makeFolder('work', `${ROOT}/Work`);
    const plan: Doc = { id: 'plan', rel: 'Projects/Plan.md', body: 'The plan', parentId: 'projects' };
    const source: Doc = { id: 'src', rel: 'Source.md', body: 'saved [[Projects/Plan]]' };
    const { vault, documentRegistry, fileSystem, folderOperations, pageOperations } = await setup(
      [projects, work],
      [plan, source]
    );
    await pageOperations.open('src');
    pageOperations.commitEdit('src', 'saved [[Projects/Plan]] plus unsaved typing');

    // move()'s own return value stays the asset-reference contract (undefined here, no asset crossing) —
    // the page-reference outcome is reported through pageReferenceFeedback, asserted separately below.
    const feedback = vi.fn();
    folderOperations.pageReferenceFeedback = feedback;

    await folderOperations.move('projects', 'work');

    expect(feedback).not.toHaveBeenCalled(); // nothing incomplete to report
    expect(documentRegistry.get('src')!.currentRevision.markdown).toBe('saved [[Work/Projects/Plan]] plus unsaved typing');
    expect(bodyOf(vault, 'src')).toBe('saved [[Work/Projects/Plan]] plus unsaved typing');
    expect(await fileSystem.readFile(`${ROOT}/Source.md`)).toContain('plus unsaved typing');
    expect(vault.getPage('plan')!.path).toBe(`${ROOT}/Work/Projects/Plan.md`);
  });

  it('nested folders move together: every descendant at every depth is rewritten in one pass', async () => {
    const a = makeFolder('a', `${ROOT}/A`);
    const b = makeFolder('b', `${ROOT}/A/B`, 'a');
    const c = makeFolder('c', `${ROOT}/A/B/C`, 'b');
    const dest = makeFolder('dest', `${ROOT}/Dest`);
    const deep: Doc = { id: 'deep', rel: 'A/B/C/Deep.md', body: 'deep', parentId: 'c' };
    const mid: Doc = { id: 'mid', rel: 'A/B/Mid.md', body: 'mid', parentId: 'b' };
    const source: Doc = { id: 'src', rel: 'Source.md', body: '[[A/B/C/Deep]] and [[A/B/Mid]] and [[A/B/C/]]' };
    const { vault, folderOperations } = await setup([a, b, c, dest], [deep, mid, source]);

    await folderOperations.move('a', 'dest');

    expect(vault.getFolder('c')!.path).toBe(`${ROOT}/Dest/A/B/C`);
    expect(vault.getPage('deep')!.path).toBe(`${ROOT}/Dest/A/B/C/Deep.md`);
    expect(vault.getPage('mid')!.path).toBe(`${ROOT}/Dest/A/B/Mid.md`);
    expect(bodyOf(vault, 'src')).toBe('[[Dest/A/B/C/Deep]] and [[Dest/A/B/Mid]] and [[Dest/A/B/C/]]');
  });

  it('a folder with no referencing pages moves without any extra page write — existing move()/rename() behavior otherwise unchanged', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`);
    const work = makeFolder('work', `${ROOT}/Work`);
    const plan: Doc = { id: 'plan', rel: 'Projects/Plan.md', body: 'The plan', parentId: 'projects' };
    const unrelated: Doc = { id: 'unrelated', rel: 'Unrelated.md', body: 'no links at all' };
    const { vault, coordinator, folderOperations } = await setup([projects, work], [plan, unrelated]);
    const enqueue = vi.spyOn(coordinator, 'enqueue');

    await folderOperations.move('projects', 'work');

    expect(enqueue.mock.calls.map(([id, op]) => `${id}:${op.kind}`)).toEqual(['projects:move-folder']);
    expect(vault.getFolder('projects')!.path).toBe(`${ROOT}/Work/Projects`);
  });

  it('does not report the move as rolled back when a referencing page’s rewrite fails', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`);
    const work = makeFolder('work', `${ROOT}/Work`);
    const plan: Doc = { id: 'plan', rel: 'Projects/Plan.md', body: 'The plan', parentId: 'projects' };
    const a: Doc = { id: 'a', rel: 'A.md', body: '[[Projects/Plan]]' };
    const b: Doc = { id: 'b', rel: 'B.md', body: '[[Projects/Plan]]' };
    const { vault, folderOperations, pageOperations } = await setup([projects, work], [plan, a, b]);
    const mutateBody = pageOperations.mutateBody.bind(pageOperations);
    vi.spyOn(pageOperations, 'mutateBody').mockImplementation((id, transform, options) =>
      id === 'a' ? Promise.reject(new Error('disk full')) : mutateBody(id, transform, options)
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await folderOperations.move('projects', 'work');

    // The move itself fully succeeded regardless of the one failed reference rewrite.
    expect(vault.getFolder('projects')!.path).toBe(`${ROOT}/Work/Projects`);
    expect(vault.getPage('plan')!.path).toBe(`${ROOT}/Work/Projects/Plan.md`);
    expect(bodyOf(vault, 'b')).toBe('[[Work/Projects/Plan]]');
    expect(bodyOf(vault, 'a')).toBe('[[Projects/Plan]]');
  });

  it('reports an incomplete reference rewrite through pageReferenceFeedback without failing the move', async () => {
    const projects = makeFolder('projects', `${ROOT}/Projects`);
    const work = makeFolder('work', `${ROOT}/Work`);
    const plan: Doc = { id: 'plan', rel: 'Projects/Plan.md', body: 'The plan', parentId: 'projects' };
    const a: Doc = { id: 'a', rel: 'A.md', body: '[[Projects/Plan]]' };
    const { fileSystem, folderOperations } = await setup([projects, work], [plan, a]);
    await fileSystem.writeFile(`${ROOT}/A.md`, document({ ...a, body: '[[Projects/Plan]] edited elsewhere' }));
    const feedback = vi.fn();
    folderOperations.pageReferenceFeedback = feedback;

    await folderOperations.move('projects', 'work');

    expect(feedback).toHaveBeenCalledWith(
      expect.objectContaining({ skipped: [{ pageId: 'a', path: `${ROOT}/A.md`, reason: 'changed-on-disk' }], complete: false })
    );
  });

  it('rename() reports undefined for an unknown folder, like before', async () => {
    const { folderOperations } = await setup([], []);

    await expect(folderOperations.rename('does-not-exist', 'Anything')).resolves.toBeUndefined();
  });

  it('move() reports undefined for an unknown folder, like before', async () => {
    const { folderOperations } = await setup([], []);

    await expect(folderOperations.move('does-not-exist', null)).resolves.toBeUndefined();
  });
});
