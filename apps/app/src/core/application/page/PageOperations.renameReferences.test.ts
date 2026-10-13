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

const ROOT = '/vault';

interface Doc {
  readonly id: string;
  readonly rel: string; // vault-relative path with extension
  readonly body: string;
  readonly frontmatter?: string; // extra frontmatter lines
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

function setup(docs: readonly Doc[]) {
  const pages = docs.map(buildPage);
  const vault = new Vault(ROOT, pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
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

describe('PageOperations.rename — reference rewriting', () => {
  it('rewrites links and embeds, keeping alias, heading, block reference and unrelated text', async () => {
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

    const summary = await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(bodyOf(vault, 'src')).toBe(
      [
        'Prose about Meeting Notes stays.',
        '[[Team Meeting]] [[Team Meeting|Discussion]]',
        '![[Team Meeting]] ![[Team Meeting#Decisions]] [[Team Meeting#^blk]]',
      ].join('\n')
    );
    expect(summary).toMatchObject({ rewrittenPageIds: ['src'], skipped: [], failed: [], complete: true });
  });

  it('keeps the renamed note’s id, content and path-only change', async () => {
    const { vault, fileSystem, pageOperations } = setup([TARGET]);

    await pageOperations.rename(TARGET.id, 'Team Meeting');

    const renamed = vault.getPage(TARGET.id)!;
    expect(renamed.path).toBe(`${ROOT}/Team Meeting.md`);
    expect(renamed.source.markdown).toBe('Target body');
    expect(await fileSystem.readFile(renamed.path)).toContain('id: target');
  });

  it('leaves code (fenced, indented, inline) untouched', async () => {
    const body = ['```', '[[Meeting Notes]]', '```', '', '    ![[Meeting Notes]]', '', 'x `[[Meeting Notes]]` y', '[[Meeting Notes]]'].join('\n');
    const { vault, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body }]);

    await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(bodyOf(vault, 'src')).toBe(body.replace(/\n\[\[Meeting Notes\]\]$/, '\n[[Team Meeting]]'));
  });

  it('rewrites a self-reference', async () => {
    const { vault, pageOperations } = setup([{ ...TARGET, body: 'See [[Meeting Notes]] itself' }]);

    await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(bodyOf(vault, TARGET.id)).toBe('See [[Team Meeting]] itself');
  });

  it('rewrites archived notes and templates, leaving them where they are', async () => {
    const archived: Doc = { id: 'arch', rel: 'Archive/Old.md', body: 'old [[Meeting Notes]]' };
    const template: Doc = { id: 'tpl', rel: 'Templates/T.md', body: '![[Meeting Notes]]' };
    const { vault, fileSystem, pageOperations } = setup([TARGET, archived, template]);

    const summary = await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(summary.complete).toBe(true);
    expect(vault.getPage('arch')!.path).toBe(`${ROOT}/Archive/Old.md`);
    expect(bodyOf(vault, 'arch')).toBe('old [[Team Meeting]]');
    expect(bodyOf(vault, 'tpl')).toBe('![[Team Meeting]]');
    expect(await fileSystem.readFile(`${ROOT}/Templates/T.md`)).toContain('![[Team Meeting]]');
  });

  it('rewrites only references to this note: same-title note elsewhere, bare name, alias-resolved and look-alikes stay', async () => {
    const aliased: Doc = { ...TARGET, frontmatter: 'aliases: [Alpha]\n' };
    const other: Doc = { id: 'other', rel: 'Other/Meeting Notes.md', body: 'other' };
    const body = '[[Other/Meeting Notes]] [[Alpha]] [[Meeting Notes 2]] [[Meeting Notes]]';
    const { vault, pageOperations } = setup([aliased, other, { id: 'src', rel: 'Source.md', body }]);

    await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(bodyOf(vault, 'src')).toBe('[[Other/Meeting Notes]] [[Alpha]] [[Meeting Notes 2]] [[Team Meeting]]');
  });

  it('writes nothing for notes that do not reference the renamed note', async () => {
    const { coordinator, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body: 'no links' }]);
    const enqueue = vi.spyOn(coordinator, 'enqueue');

    await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(enqueue.mock.calls.map(([id, op]) => `${id}:${op.kind}`)).toEqual(['target:rename']);
  });

  it('rewrites an open editor’s unsaved text, keeping the unsaved edit and persisting both', async () => {
    const source: Doc = { id: 'src', rel: 'Source.md', body: 'saved [[Meeting Notes]]' };
    const { vault, documentRegistry, fileSystem, pageOperations } = setup([TARGET, source]);
    await pageOperations.open('src');
    pageOperations.commitEdit('src', 'saved [[Meeting Notes]] plus unsaved typing');

    const summary = await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(summary.complete).toBe(true);
    expect(documentRegistry.get('src')!.currentRevision.markdown).toBe('saved [[Team Meeting]] plus unsaved typing');
    expect(bodyOf(vault, 'src')).toBe('saved [[Team Meeting]] plus unsaved typing');
    expect(await fileSystem.readFile(`${ROOT}/Source.md`)).toContain('plus unsaved typing');
  });

  it('finds a link that exists only in an open editor’s unsaved text', async () => {
    const { documentRegistry, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body: 'nothing yet' }]);
    await pageOperations.open('src');
    pageOperations.commitEdit('src', 'nothing yet [[Meeting Notes]]');

    await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(documentRegistry.get('src')!.currentRevision.markdown).toBe('nothing yet [[Team Meeting]]');
  });

  it('does not overwrite a note that changed on disk; other notes are still updated', async () => {
    const a: Doc = { id: 'a', rel: 'A.md', body: '[[Meeting Notes]]' };
    const b: Doc = { id: 'b', rel: 'B.md', body: '[[Meeting Notes]]' };
    const { vault, fileSystem, pageOperations } = setup([TARGET, a, b]);
    const external = document({ ...a, body: '[[Meeting Notes]] edited elsewhere' });
    await fileSystem.writeFile(`${ROOT}/A.md`, external);

    const summary = await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(await fileSystem.readFile(`${ROOT}/A.md`)).toBe(external);
    expect(bodyOf(vault, 'b')).toBe('[[Team Meeting]]');
    expect(summary.rewrittenPageIds).toEqual(['b']);
    expect(summary.skipped).toEqual([{ pageId: 'a', path: `${ROOT}/A.md`, reason: 'changed-on-disk' }]);
    expect(summary.complete).toBe(false);
  });

  it('uses the final path when the Gate auto-suffixes the destination', async () => {
    const { vault, coordinator, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body: '[[Meeting Notes]]' }]);
    const original = coordinator.enqueue.bind(coordinator);
    vi.spyOn(coordinator, 'enqueue').mockImplementation((id, operation) => {
      if (operation.kind === 'rename') {
        // A note takes the requested name between the pre-check and the Gate running the rename.
        vault.addPage(buildPage({ id: 'squatter', rel: 'Team Meeting.md', body: 'x' }));
      }
      return original(id, operation);
    });

    await pageOperations.rename(TARGET.id, 'Team Meeting');

    const finalPath = vault.getPage(TARGET.id)!.path;
    expect(finalPath).not.toBe(`${ROOT}/Team Meeting.md`);
    expect(bodyOf(vault, 'src')).toBe(`[[${VaultPath.withoutExtension(VaultPath.relativeTo(finalPath, ROOT))}]]`);
  });

  it('leaves references alone when another note has taken the old path, and says so', async () => {
    const { vault, coordinator, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body: '[[Meeting Notes]]' }]);
    const original = coordinator.enqueue.bind(coordinator);
    vi.spyOn(coordinator, 'enqueue').mockImplementation(async (id, operation) => {
      const result = await original(id, operation);
      if (operation.kind === 'rename') {
        vault.addPage(buildPage({ id: 'newcomer', rel: 'Meeting Notes.md', body: 'new' }));
      }
      return result;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const summary = await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(bodyOf(vault, 'src')).toBe('[[Meeting Notes]]');
    expect(summary.skipped.map((s) => s.reason)).toEqual(['old-path-reoccupied']);
  });

  it('keeps going when one source fails, reports it, and still completes the rename', async () => {
    const a: Doc = { id: 'a', rel: 'A.md', body: '[[Meeting Notes]]' };
    const b: Doc = { id: 'b', rel: 'B.md', body: '[[Meeting Notes]]' };
    const { vault, pageOperations } = setup([TARGET, a, b]);
    const mutateBody = pageOperations.mutateBody.bind(pageOperations);
    vi.spyOn(pageOperations, 'mutateBody').mockImplementation((id, transform, options) =>
      id === 'a' ? Promise.reject(new Error('disk full')) : mutateBody(id, transform, options)
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const summary = await pageOperations.rename(TARGET.id, 'Team Meeting');

    expect(vault.getPage(TARGET.id)!.path).toBe(`${ROOT}/Team Meeting.md`);
    expect(bodyOf(vault, 'b')).toBe('[[Team Meeting]]');
    expect(bodyOf(vault, 'a')).toBe('[[Meeting Notes]]');
    expect(summary.failed).toEqual([{ pageId: 'a', path: `${ROOT}/A.md`, message: 'disk full' }]);
    expect(summary.complete).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it.each(['C# Notes', 'A|B', 'A]B'])('skips and reports references when the new title %j cannot be written as a link', async (title) => {
    const { vault, pageOperations } = setup([TARGET, { id: 'src', rel: 'Source.md', body: '[[Meeting Notes]]' }]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const summary = await pageOperations.rename(TARGET.id, title);

    expect(vault.getPage(TARGET.id)!.path).toBe(`${ROOT}/${title}.md`);
    expect(bodyOf(vault, 'src')).toBe('[[Meeting Notes]]');
    expect(summary.skipped.map((s) => s.reason)).toEqual(['unsupported-title']);
  });

  it('keeps the index and References consistent: the rewritten links resolve to the renamed note, links and embeds alike', async () => {
    const link: Doc = { id: 'l', rel: 'L.md', body: 'see [[Meeting Notes]]' };
    const embed: Doc = { id: 'e', rel: 'E.md', body: '![[Meeting Notes]]' };
    const { vault, pageOperations } = setup([TARGET, link, embed]);

    await pageOperations.rename(TARGET.id, 'Team Meeting');

    const edges = vault.knowledgeGraph().incomingEdges(TARGET.id);
    expect(edges.map((edge) => `${edge.sourcePageId}:${edge.kind}`).sort()).toEqual(['e:embed', 'l:link']);
    const linkEdge = edges.find((edge) => edge.sourcePageId === 'l')!;
    expect(bodyOf(vault, 'l').slice(linkEdge.startOffset, linkEdge.endOffset)).toBe('[[Team Meeting]]');
  });
});
