import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TagOperations } from './TagOperations';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '../../vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { PageOperations } from '../page/PageOperations';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { PagePathResolver } from '../page/PagePathResolver';
import { MoveService } from '../../vault/persistence/MoveService';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { TagMetadataStore } from '../../vault/persistence/TagMetadataStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { VaultQuery } from '../../vault/queries/VaultQuery';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

/** A page built the way a real scan builds it: from the exact text of its file. */
function pageFromDocument(id: string, document: string): { page: Page; document: string } {
  const full = document.startsWith('---\n') ? document : `---\nid: ${id}\n---\n${document}`;
  const parsed = new FrontmatterParser().parse(full);
  const page = new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${id}.md`,
      directoryPath: ROOT,
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: parsed.frontmatterAnalysis,
      content: parsed.body,
      analysis: parsed.analysis,
    },
  });

  return { page, document: full };
}

function setup(documents: Record<string, string>, definitions: Record<string, unknown> = {}) {
  const built = Object.entries(documents).map(([id, doc]) => pageFromDocument(id, doc));
  const pages = built.map((entry) => entry.page);
  const fileSystem = new InMemoryVaultFileSystem();

  for (const { page, document } of built) {
    fileSystem.seedFile(page.path, document);
  }

  if (Object.keys(definitions).length > 0) {
    fileSystem.seedFile(`${ROOT}/.clutter/tags.json`, JSON.stringify({ version: 2, tags: definitions }));
  }

  const store = new TagMetadataStore(fileSystem, ROOT);
  const definitionMap = new Map(Object.entries(definitions)) as unknown as ReadonlyMap<string, never>;
  const vault = new Vault(
    ROOT,
    pages,
    [],
    new TagBuilder().build(pages, definitionMap),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    definitionMap
  );
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );
  const workspace = new Workspace();
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
  const registry = new DocumentRegistry();
  const pageOperations = new PageOperations(
    vault,
    workspace,
    registry,
    new SaveCoordinator(),
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );
  const tagOperations = new TagOperations(vault, store, fileSystem, pageOperations);

  const body = (id: string) => vault.getPage(id)!.source.markdown;
  const frontmatterTags = (id: string) => vault.getPage(id)!.metadata.tags ?? [];
  const onDisk = async (id: string) => fileSystem.readFile(`${ROOT}/${id}.md`);
  const definitionsOnDisk = () =>
    JSON.parse(fileSystem.getFileSync(`${ROOT}/.clutter/tags.json`) ?? '{"tags":{}}').tags;

  return { vault, fileSystem, store, registry, pageOperations, tagOperations, body, frontmatterTags, onDisk, definitionsOnDisk };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('TagOperations.rename — semantic rewrite', () => {
  it('renames an inline tag', async () => {
    const t = setup({ a: 'Working on #design today.' });

    await t.tagOperations.rename('design', 'product-design');

    expect(t.body('a')).toBe('Working on #product-design today.');
  });

  it('renames a frontmatter tag', async () => {
    const t = setup({ a: '---\nid: a\ntags:\n  - design\n  - research\n---\nBody' });

    await t.tagOperations.rename('design', 'product-design');

    expect(t.frontmatterTags('a')).toEqual(['product-design', 'research']);
    expect(await t.onDisk('a')).toContain('  - product-design\n  - research');
    expect(await t.onDisk('a')).not.toContain('- design');
  });

  it('renames a tag used both inline and in frontmatter, in the same note', async () => {
    const t = setup({ a: '---\nid: a\ntags:\n  - design\n---\nSee #design here' });

    await t.tagOperations.rename('design', 'product-design');

    expect(t.body('a')).toBe('See #product-design here');
    expect(t.frontmatterTags('a')).toEqual(['product-design']);
    expect([...t.vault.tags()].map((tag) => [tag.name, tag.usageCount])).toEqual([['product-design', 1]]);
  });

  it('renames a note whose only use is frontmatter (previously skipped entirely)', async () => {
    const t = setup({ a: '---\nid: a\ntags:\n  - design\n---\nNo inline tags.' });

    const result = await t.tagOperations.rename('design', 'ux');

    expect(result.updatedPageIds).toEqual(['a']);
    expect(t.frontmatterTags('a')).toEqual(['ux']);
  });

  it('renames across multiple notes, leaving unrelated notes untouched', async () => {
    const t = setup({
      a: 'one #design',
      b: '---\nid: b\ntags:\n  - Design\n---\ntwo',
      c: 'three #research',
    });

    const result = await t.tagOperations.rename('design', 'ux');

    expect([...result.updatedPageIds].sort()).toEqual(['a', 'b']);
    expect(result.complete).toBe(true);
    expect(t.body('a')).toBe('one #ux');
    expect(t.frontmatterTags('b')).toEqual(['ux']);
    expect(t.body('c')).toBe('three #research');
  });

  it('does not touch code spans, code blocks, escapes, URLs, headings or look-alike text', async () => {
    const markdown = [
      'real #design',
      '`#design` span',
      '```text',
      '#design',
      '```',
      'foo#design https://x.com/#design \\#design',
      '# design',
      '#designer #design-system',
    ].join('\n');
    const t = setup({ a: markdown });

    await t.tagOperations.rename('design', 'ux');

    expect(t.body('a')).toBe(markdown.replace('real #design', 'real #ux'));
  });

  it('renames spelling variants of the same logical tag', async () => {
    const t = setup({ a: '#Product-Design and #product_design' });

    await t.tagOperations.rename('product design', 'ux');

    expect(t.body('a')).toBe('#ux and #ux');
  });

  it('keeps Unicode tags whole', async () => {
    const t = setup({ a: '#café and #cafés' });

    await t.tagOperations.rename('café', 'coffee');

    expect(t.body('a')).toBe('#coffee and #cafés');
  });

  it('refuses a name the grammar would read back differently', async () => {
    const t = setup({ a: '#design' });

    await expect(t.tagOperations.rename('design', '123')).rejects.toThrow(/aren't allowed/);
    await expect(t.tagOperations.rename('design', 'a/b')).rejects.toThrow(/aren't allowed/);
    expect(t.body('a')).toBe('#design');
  });

  it('refuses to collide with a declared-but-unused tag', async () => {
    const t = setup({ a: '#design' }, { research: {} });

    await expect(t.tagOperations.rename('design', 'research')).rejects.toThrow(/already exists/);
  });
});

describe('TagOperations.rename — metadata moves with the tag', () => {
  it('moves icon and favorite to the new name', async () => {
    const t = setup({ a: '#design' }, { design: { name: 'design', icon: '🎨', favorite: true } });

    await t.tagOperations.rename('design', 'product-design');

    expect(t.definitionsOnDisk()).toEqual({
      'product design': { name: 'product-design', icon: '🎨', favorite: true },
    });
    expect([...t.vault.tags()]).toEqual([
      { name: 'product-design', icon: '🎨', favorite: true, declared: true, usageCount: 1 },
    ]);
  });

  it('renames a declared tag that no note uses', async () => {
    const t = setup({ a: 'nothing' }, { design: { icon: '🎨' } });

    await t.tagOperations.rename('design', 'ux');

    expect(t.definitionsOnDisk()).toEqual({ ux: { name: 'ux', icon: '🎨' } });
  });

  it('a same-identity respelling keeps the definition under the same key', async () => {
    const t = setup({ a: '#project' }, { project: { icon: '📦' } });

    await t.tagOperations.rename('project', 'Project');

    expect(t.definitionsOnDisk()).toEqual({ project: { name: 'Project', icon: '📦' } });
    expect(t.body('a')).toBe('#Project');
  });

  it('creates no definition for a tag that never had one', async () => {
    const t = setup({ a: '#design' });

    await t.tagOperations.rename('design', 'ux');

    expect(t.definitionsOnDisk()).toEqual({});
  });
});

describe('TagOperations.rename — planned batch resilience', () => {
  it('an external edit not yet reconciled is never overwritten: that note is skipped and the definition stays put', async () => {
    const t = setup(
      { a: 'one #design', b: 'two #design' },
      { design: { name: 'design', icon: '🎨' } }
    );
    // Someone edits b outside Clutter; Sync hasn't caught up yet.
    await t.fileSystem.writeFile(`${ROOT}/b.md`, '---\nid: b\n---\ntwo #design plus an external edit');

    const result = await t.tagOperations.rename('design', 'ux');

    expect(result.complete).toBe(false);
    expect(result.updatedPageIds).toEqual(['a']);
    expect(result.skipped).toEqual([{ pageId: 'b', path: `${ROOT}/b.md`, reason: 'changed-on-disk' }]);
    expect(await t.onDisk('b')).toContain('plus an external edit');
    expect(await t.onDisk('b')).toContain('#design');
    // Definition untouched while the batch is incomplete.
    expect(t.definitionsOnDisk()).toEqual({ design: { name: 'design', icon: '🎨' } });
  });

  it('re-running after the gap closes finishes the job, touching only what is left', async () => {
    const t = setup(
      { a: 'one #design', b: 'two #design' },
      { design: { name: 'design', icon: '🎨' } }
    );
    await t.fileSystem.writeFile(`${ROOT}/b.md`, '---\nid: b\n---\ntwo #design plus an external edit');
    await t.tagOperations.rename('design', 'ux');

    // Sync catches up: the Vault now holds what is on disk.
    const rebuilt = pageFromDocument('b', '---\nid: b\n---\ntwo #design plus an external edit').page;
    t.vault.replacePage(rebuilt);
    // `ux` already exists (note a carries it), so finishing is a merge-style rename.
    await expect(t.tagOperations.rename('design', 'ux')).rejects.toThrow(/already exists/);
    const second = await t.tagOperations.rename('design', 'ux', { merge: true });

    expect(second.complete).toBe(true);
    expect(second.updatedPageIds).toEqual(['b']);
    expect(await t.onDisk('b')).toContain('two #ux plus an external edit');
    expect(t.body('a')).toBe('one #ux');
    expect(t.definitionsOnDisk()).toEqual({ ux: { name: 'ux', icon: '🎨' } });
  });

  it('a failing note is reported, the rest continue, and the definition is kept for the re-run', async () => {
    const t = setup({ a: '#design', b: '#design', c: '#design' }, { design: { name: 'design', icon: '🎨' } });
    const original = t.pageOperations.mutateBody.bind(t.pageOperations);
    vi.spyOn(t.pageOperations, 'mutateBody').mockImplementation((pageId, transform) =>
      pageId === 'b' ? Promise.reject(new Error('disk full')) : original(pageId, transform)
    );

    const result = await t.tagOperations.rename('design', 'ux');

    expect(result.complete).toBe(false);
    expect(result.failed).toEqual([{ pageId: 'b', path: `${ROOT}/b.md`, message: 'disk full' }]);
    expect(result.updatedPageIds).toEqual(['a', 'c']);
    expect(t.body('a')).toBe('#ux');
    expect(t.body('b')).toBe('#design');
    expect(t.body('c')).toBe('#ux');
    expect(t.definitionsOnDisk()).toEqual({ design: { name: 'design', icon: '🎨' } });

    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rerun = await t.tagOperations.rename('design', 'ux', { merge: true });
    expect(rerun.complete).toBe(true);
    expect(rerun.updatedPageIds).toEqual(['b']);
    expect(t.definitionsOnDisk()).toEqual({ ux: { name: 'ux', icon: '🎨' } });
  });

  it('is idempotent: a completed rename run again changes nothing', async () => {
    const t = setup({ a: '#design' });
    await t.tagOperations.rename('design', 'ux');
    const before = await t.onDisk('a');

    const again = await t.tagOperations.rename('ux', 'ux');

    expect(again.updatedPageIds).toEqual([]);
    expect(await t.onDisk('a')).toBe(before);
  });

  it('merging two tags rewrites the source everywhere and the target definition wins field by field', async () => {
    const t = setup(
      { a: '#old and #new', b: '---\nid: b\ntags:\n  - old\n  - new\n---\nx' },
      {
        old: { name: 'old', icon: '🅾️', favorite: true },
        new: { name: 'new', icon: '🆕' },
      }
    );

    const result = await t.tagOperations.rename('old', 'new', { merge: true });

    expect(result.complete).toBe(true);
    expect(t.body('a')).toBe('#new and #new');
    expect(t.frontmatterTags('b')).toEqual(['new']);
    expect(t.definitionsOnDisk()).toEqual({ new: { name: 'new', icon: '🆕', favorite: true } });
    expect([...t.vault.tags()].map((tag) => [tag.name, tag.usageCount])).toEqual([['new', 2]]);
  });

  it('renames archived notes too — no old usage is left behind — and they stay archived', async () => {
    const t = setup({
      a: '#design',
      b: '---\nid: b\nstatus: archived\ntags:\n  - design\n---\nOld #design',
    });

    const result = await t.tagOperations.rename('design', 'ux');

    expect(result).toMatchObject({ complete: true, attemptedPageCount: 2, skipped: [], failed: [] });
    expect(result.updatedPageIds).toEqual(['a', 'b']);
    expect(t.body('a')).toBe('#ux');
    expect(t.body('b')).toBe('Old #ux');
    expect(t.frontmatterTags('b')).toEqual(['ux']);
    expect(t.vault.getPage('b')!.metadata.status).toBe('archived');
    expect(await t.onDisk('b')).toContain('status: archived');
    expect([...t.vault.tags()].map((tag) => tag.name)).toEqual(['ux']);
  });

  it('rewrites each note after re-reading it, in path order', async () => {
    const t = setup({ c: '#design', a: '#design', b: '#design' });
    const order: string[] = [];
    const original = t.pageOperations.mutateBody.bind(t.pageOperations);
    vi.spyOn(t.pageOperations, 'mutateBody').mockImplementation((pageId, transform) => {
      order.push(pageId);
      return original(pageId, transform);
    });

    await t.tagOperations.rename('design', 'ux');

    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('frontmatter fidelity', () => {
  const DOCUMENT = [
    '---',
    'id: a',
    'title: My note',
    'author: Vik',
    'tags:',
    '  - design',
    '  - research',
    'cover: hero.png',
    'priority: high',
    '---',
    'Body #design',
  ].join('\n');

  it('changing one tag leaves unrelated frontmatter keys intact', async () => {
    const t = setup({ a: DOCUMENT });

    await t.tagOperations.rename('design', 'product-design');
    const saved = await t.onDisk('a');

    expect(saved).toContain('title: My note');
    expect(saved).toContain('author: Vik');
    expect(saved).toContain('priority: high');
    expect(saved).toContain('cover: hero.png');
    expect(saved).toContain('  - product-design\n  - research');
    expect(saved.endsWith('Body #product-design')).toBe(true);
    expect(new FrontmatterParser().parse(saved).frontmatter.tags).toEqual(['product-design', 'research']);
  });

  it('quoted, flow-array and scalar tag forms are renamed (and no longer silently emptied)', async () => {
    const quoted = setup({ a: '---\nid: a\ntags:\n  - "design"\n  - research\n---\nx' });
    await quoted.tagOperations.rename('design', 'ux');
    expect(quoted.frontmatterTags('a')).toEqual(['ux', 'research']);

    const flow = setup({ a: '---\nid: a\ntags: [design, "research"]\n---\nx' });
    await flow.tagOperations.rename('design', 'ux');
    expect(flow.frontmatterTags('a')).toEqual(['ux', 'research']);

    const scalar = setup({ a: '---\nid: a\ntags: design\n---\nx' });
    await scalar.tagOperations.rename('design', 'ux');
    expect(scalar.frontmatterTags('a')).toEqual(['ux']);
  });

  it('an empty tags key is left alone and costs no write', async () => {
    const t = setup({ a: '---\nid: a\ntags:\n---\nplain' });
    const before = await t.onDisk('a');

    const result = await t.tagOperations.rename('design', 'ux');

    expect(result.updatedPageIds).toEqual([]);
    expect(await t.onDisk('a')).toBe(before);
  });

  it('duplicate tags in one note collapse to one on rename', async () => {
    const t = setup({ a: '---\nid: a\ntags:\n  - design\n  - Design\n  - research\n---\nx' });

    await t.tagOperations.rename('design', 'ux');

    expect(t.frontmatterTags('a')).toEqual(['ux', 'research']);
  });

  it('a note with no frontmatter tags is not rewritten for frontmatter', async () => {
    const t = setup({ a: '---\nid: a\ntitle: Keep me\n---\n#design' });

    await t.tagOperations.rename('design', 'ux');

    expect(await t.onDisk('a')).toContain('title: Keep me');
    expect(t.frontmatterTags('a')).toEqual([]);
  });
});

describe('TagOperations.removeFromNotes / deleteDefinition / deleteTag', () => {
  it('removeFromNotes removes usage everywhere and keeps the definition', async () => {
    const t = setup(
      { a: 'see #design here', b: '---\nid: b\ntags:\n  - design\n  - research\n---\nx `#design`' },
      { design: { name: 'design', icon: '🎨', favorite: true } }
    );

    const result = await t.tagOperations.removeFromNotes('design');

    expect(result.complete).toBe(true);
    expect(t.body('a')).toBe('see here');
    expect(t.frontmatterTags('b')).toEqual(['research']);
    expect(t.body('b')).toBe('x `#design`');
    // Zero usage, still a first-class tag with its configuration.
    expect([...t.vault.tags()].find((tag) => tag.name === 'design')).toEqual({
      name: 'design',
      icon: '🎨',
      favorite: true,
      declared: true,
      usageCount: 0,
    });
    expect(t.definitionsOnDisk()).toEqual({ design: { name: 'design', icon: '🎨', favorite: true } });
  });

  it('removeFromNotes on a tag with no definition makes it disappear (nothing declares it)', async () => {
    const t = setup({ a: '#design' });

    await t.tagOperations.removeFromNotes('design');

    expect([...t.vault.tags()]).toEqual([]);
  });

  it('removing the last usage never deletes metadata', async () => {
    const t = setup({ a: '#design' }, { design: { icon: '🎨' } });

    await t.tagOperations.removeFromNotes('design');

    expect(t.definitionsOnDisk()).toEqual({ design: { icon: '🎨' } });
  });

  it('deleteDefinition forgets the configuration but leaves notes alone: a used tag becomes implicit', async () => {
    const t = setup({ a: '#design' }, { design: { icon: '🎨' } });

    await t.tagOperations.deleteDefinition('design');

    expect(t.body('a')).toBe('#design');
    expect(t.definitionsOnDisk()).toEqual({});
    expect([...t.vault.tags()]).toEqual([
      { name: 'design', icon: undefined, favorite: false, declared: false, usageCount: 1 },
    ]);
  });

  it('deleteDefinition on an unused declared tag removes it entirely', async () => {
    const t = setup({ a: 'x' }, { research: {} });

    await t.tagOperations.deleteDefinition('research');

    expect([...t.vault.tags()]).toEqual([]);
  });

  it('deleteTag removes usage and the definition', async () => {
    const t = setup({ a: '#design and #keep' }, { design: { icon: '🎨' } });

    const result = await t.tagOperations.deleteTag('design');

    expect(result.complete).toBe(true);
    expect(t.body('a')).toBe('and #keep');
    expect(t.definitionsOnDisk()).toEqual({});
    expect([...t.vault.tags()].map((tag) => tag.name)).toEqual(['keep']);
  });

  it('deleteTag keeps the definition when the removal did not complete', async () => {
    const t = setup({ a: '#design', b: '#design' }, { design: { icon: '🎨' } });
    await t.fileSystem.writeFile(`${ROOT}/b.md`, '---\nid: b\n---\n#design edited');

    const result = await t.tagOperations.deleteTag('design');

    expect(result.complete).toBe(false);
    expect(t.definitionsOnDisk()).toEqual({ design: { icon: '🎨' } });
  });
});

describe('TagOperations.declare', () => {
  it('creates a tag with zero usage and writes nothing to Markdown', async () => {
    const t = setup({ a: 'unrelated' });
    const before = await t.onDisk('a');

    await t.tagOperations.declare('research');

    expect([...t.vault.tags()]).toEqual([
      { name: 'research', icon: undefined, favorite: false, declared: true, usageCount: 0 },
    ]);
    expect(t.definitionsOnDisk()).toEqual({ research: { name: 'research' } });
    expect(await t.onDisk('a')).toBe(before);
  });

  it('is idempotent and spelling-insensitive', async () => {
    const t = setup({}, { 'product design': { name: 'product-design', icon: '🎨' } });

    await t.tagOperations.declare('Product_Design');

    expect(t.definitionsOnDisk()).toEqual({ 'product design': { name: 'product-design', icon: '🎨' } });
  });

  it('rejects names the grammar would not read back as one tag', async () => {
    const t = setup({});

    await expect(t.tagOperations.declare('')).rejects.toThrow();
    await expect(t.tagOperations.declare('1984')).rejects.toThrow();
    await expect(t.tagOperations.declare('a:b')).rejects.toThrow();
    expect(t.definitionsOnDisk()).toEqual({});
  });

  it('a declared tag is picked up by the used-tag projection once a note uses it', async () => {
    const t = setup({ a: 'x' });
    await t.tagOperations.declare('research');

    await t.pageOperations.mutateBody('a', () => 'now #research');

    expect([...t.vault.tags()].map((tag) => [tag.name, tag.usageCount])).toEqual([['research', 1]]);
  });
});

describe('persistence resilience through TagOperations', () => {
  it('a corrupt tags.json does not break operations: backed up, then replaced by the next write', async () => {
    const t = setup({ a: '#design' });
    await t.fileSystem.createDirectory(`${ROOT}/.clutter`);
    await t.fileSystem.writeFile(`${ROOT}/.clutter/tags.json`, '{ not json');

    await t.tagOperations.updateMetadata('design', { icon: '🎨' });

    expect(t.definitionsOnDisk()).toEqual({ design: { name: 'design', icon: '🎨' } });
    const files = (await t.fileSystem.readDirectory(`${ROOT}/.clutter`)).map((e) => e.name);
    expect(files.some((name) => name.startsWith('tags.json.corrupt-'))).toBe(true);
  });

  it('a write failure surfaces and leaves definitions in the Vault unchanged', async () => {
    const t = setup({ a: '#design' }, { design: { icon: '🎨' } });
    const move = t.fileSystem.moveFile.bind(t.fileSystem);
    t.fileSystem.moveFile = async () => {
      throw new Error('EACCES');
    };

    await expect(t.tagOperations.updateMetadata('design', { icon: '🚀' })).rejects.toThrow('EACCES');
    expect([...t.vault.tags()][0]!.icon).toBe('🎨');

    t.fileSystem.moveFile = move;
  });

  it('concurrent metadata updates are serialized: none is lost', async () => {
    const t = setup({});

    await Promise.all([
      t.tagOperations.updateMetadata('a', { icon: '1' }),
      t.tagOperations.updateMetadata('b', { icon: '2' }),
      t.tagOperations.updateMetadata('c', { favorite: true }),
    ]);

    expect(Object.keys(t.definitionsOnDisk()).sort()).toEqual(['a', 'b', 'c']);
    expect([...t.vault.tags()].map((tag) => tag.name).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('unsaved editor content', () => {
  it('unsaved text in an open editor is renamed too, and a later autosave cannot resurrect the old name', async () => {
    const t = setup({ a: 'saved #design' });
    t.registry.open('a', 'saved #design');
    // The user types more; nothing has been saved yet.
    t.pageOperations.commitEdit('a', 'saved #design and unsaved #design here');

    const result = await t.tagOperations.rename('design', 'ux');

    expect(result.complete).toBe(true);
    expect(t.registry.get('a')!.currentRevision.markdown).toBe('saved #ux and unsaved #ux here');
    expect(t.body('a')).toBe('saved #ux and unsaved #ux here');

    // A pending/late autosave writes the session — which already holds the renamed text.
    await t.pageOperations.requestSave('a');
    expect(await t.onDisk('a')).toContain('saved #ux and unsaved #ux here');
    expect(await t.onDisk('a')).not.toContain('#design');
  });

  it('a tag that exists only in unsaved editor text is found and renamed', async () => {
    const t = setup({ a: 'saved text', b: 'other #design' });
    t.registry.open('a', 'saved text');
    t.pageOperations.commitEdit('a', 'saved text, now #design');

    const result = await t.tagOperations.rename('design', 'ux');

    expect(result.updatedPageIds).toEqual(['a', 'b']);
    expect(t.registry.get('a')!.currentRevision.markdown).toBe('saved text, now #ux');
    await t.pageOperations.requestSave('a');
    expect(await t.onDisk('a')).toContain('saved text, now #ux');
  });

  it('frontmatter and unsaved body of the same open note both end up renamed on disk', async () => {
    const t = setup({ a: '---\nid: a\ntags:\n  - design\n---\nsaved' });
    t.registry.open('a', 'saved');
    t.pageOperations.commitEdit('a', 'saved #design');

    await t.tagOperations.rename('design', 'ux');
    await t.pageOperations.requestSave('a');

    const saved = await t.onDisk('a');
    expect(saved).toContain('  - ux');
    expect(saved).toContain('saved #ux');
    expect(saved).not.toContain('design');
  });

  it('removeFromNotes also clears unsaved editor text', async () => {
    const t = setup({ a: 'saved' });
    t.registry.open('a', 'saved');
    t.pageOperations.commitEdit('a', 'saved #design');

    await t.tagOperations.removeFromNotes('design');

    expect(t.registry.get('a')!.currentRevision.markdown).toBe('saved');
  });
});

describe('normalized identity', () => {
  it('#Design, #design and #DESIGN are one tag; #design_system and #design-system are one tag shown with hyphens', async () => {
    const t = setup({ a: '#Design #design_system', b: '#DESIGN #design-system', c: '#Design_System' });

    expect([...t.vault.tags()].map((tag) => [tag.name, tag.usageCount])).toEqual([
      ['Design', 2],
      ['design-system', 3],
    ].sort());
  });

  it('every lookup resolves any spelling to the same tag', () => {
    const t = setup({ a: '#design_system', b: '---\nid: b\ntags:\n  - Design System\n---\nx' });

    expect(t.vault.getTagByName('design-system')?.usageCount).toBe(2);
    expect(t.vault.getTagByName('DESIGN_SYSTEM')?.usageCount).toBe(2);
    const query = new VaultQuery(t.vault);
    // One query, any spelling: the inline note and the frontmatter note, exactly the tag's usage.
    expect(query.getPagesByTag('design-system').map((p) => p.id)).toEqual(['a', 'b']);
    expect(query.getPagesByTag('DESIGN_SYSTEM').map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('declaring or renaming to an underscore spelling writes hyphens', async () => {
    const t = setup({ a: '#design' });

    await t.tagOperations.declare('Design_System');
    await t.tagOperations.rename('design', 'user_research');

    expect(t.definitionsOnDisk()).toEqual({ 'design system': { name: 'design-system' } });
    expect(t.body('a')).toBe('#user-research');
  });

  it('rename leaves an equivalent spelling alone only if it is already canonical, and rewrites every variant otherwise', async () => {
    const t = setup({ a: '#design_system #Design-System #design-system' });

    await t.tagOperations.rename('design system', 'design-system');

    expect(t.body('a')).toBe('#design-system #design-system #design-system');
  });
});

describe('TagOperations.checkNewTagName / declare with an icon', () => {
  it('normalizes with the shared rules: trimmed, lower-case, hyphens', () => {
    const t = setup({});

    expect(t.tagOperations.checkNewTagName('  Design_System ')).toEqual({ ok: true, name: 'design-system' });
    expect(t.tagOperations.checkNewTagName('Café')).toEqual({ ok: true, name: 'café' });
  });

  it('rejects empty, ungrammatical and duplicate names with a reason code', () => {
    const t = setup({ a: '#design' }, { research: {} });

    expect(t.tagOperations.checkNewTagName('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(t.tagOperations.checkNewTagName('1984')).toEqual({ ok: false, reason: 'invalid' });
    expect(t.tagOperations.checkNewTagName('a/b')).toEqual({ ok: false, reason: 'invalid' });
    expect(t.tagOperations.checkNewTagName('DESIGN')).toEqual({ ok: false, reason: 'duplicate', existingName: 'design' });
    expect(t.tagOperations.checkNewTagName('Research_')).toEqual({ ok: false, reason: 'duplicate', existingName: 'research' });
  });

  it('declare stores the emoji, never overwrites an existing definition\'s, and writes no note', async () => {
    const t = setup({ a: 'text' }, { old: { name: 'old', icon: '🅾️' } });
    const before = await t.onDisk('a');

    await t.tagOperations.declare('Ideas', { icon: '💡' });
    await t.tagOperations.declare('old', { icon: '❌' });

    expect(t.definitionsOnDisk()).toEqual({
      ideas: { name: 'ideas', icon: '💡' },
      old: { name: 'old', icon: '🅾️' },
    });
    expect(await t.onDisk('a')).toBe(before);
  });
});

describe('TagOperations.countUnusedTags / deleteUnusedTags', () => {
  it('counts and removes only declared tags with zero usage, returning how many', async () => {
    const t = setup(
      { a: 'uses #design and #implicit', b: '---\nid: b\ntags:\n  - fm\n---\nx' },
      {
        design: { name: 'design', icon: '🎨' },
        fm: { name: 'fm' },
        research: { name: 'research' },
        ideas: { name: 'ideas', icon: '💡' },
      }
    );

    expect(t.tagOperations.countUnusedTags()).toBe(2);
    expect(await t.tagOperations.deleteUnusedTags()).toBe(2);

    expect(t.definitionsOnDisk()).toEqual({ design: { name: 'design', icon: '🎨' }, fm: { name: 'fm' } });
    expect([...t.vault.tags()].map((tag) => tag.name)).toEqual(['design', 'fm', 'implicit']);
    expect(t.tagOperations.countUnusedTags()).toBe(0);
  });

  it('never touches a note', async () => {
    const t = setup({ a: 'text #design' }, { research: {} });
    const before = await t.onDisk('a');

    await t.tagOperations.deleteUnusedTags();

    expect(await t.onDisk('a')).toBe(before);
    expect(t.body('a')).toBe('text #design');
  });

  it('with nothing unused it removes nothing and writes nothing', async () => {
    const t = setup({ a: '#design' }, { design: { icon: '🎨' } });
    const writes: string[] = [];
    const write = t.fileSystem.writeFile.bind(t.fileSystem);
    t.fileSystem.writeFile = async (path, contents) => {
      writes.push(path);
      return write(path, contents);
    };

    expect(await t.tagOperations.deleteUnusedTags()).toBe(0);
    expect(writes).toEqual([]);
  });

  it('a tag used only by archived notes (inside Archive/) counts as unused: its declaration is removed; a tag an active note uses is kept', async () => {
    const t = setup(
      { 'Archive/old': 'retired #retired and #shared', live: 'active #shared' },
      { retired: { name: 'retired', icon: '🗃' }, shared: { name: 'shared' }, never: { name: 'never' } }
    );

    expect(t.tagOperations.countUnusedTags()).toBe(2);
    expect(await t.tagOperations.deleteUnusedTags()).toBe(2);

    expect(t.definitionsOnDisk()).toEqual({ shared: { name: 'shared' } });
  });

  it('reads usage when it writes: a tag that gained a usage since the caller looked is kept', async () => {
    const t = setup({ a: 'plain' }, { research: { name: 'research' } });
    expect(t.tagOperations.countUnusedTags()).toBe(1);

    await t.pageOperations.mutateBody('a', () => 'now #research');
    expect(await t.tagOperations.deleteUnusedTags()).toBe(0);

    expect(t.definitionsOnDisk()).toEqual({ research: { name: 'research' } });
  });
});

describe('TagOperations.restyle', () => {
  it('re-cases inline and frontmatter tags in one pass, in every style', async () => {
    const lower = setup({ a: '---\nid: a\ntags:\n  - Research-Notes\n---\nOn #Design-System and #UX' });
    await lower.tagOperations.restyle('lowercase');
    expect(lower.body('a')).toBe('On #design-system and #ux');
    expect(lower.frontmatterTags('a')).toEqual(['research-notes']);

    const sentence = setup({ a: '---\nid: a\ntags:\n  - research-notes\n---\nOn #design-system' });
    await sentence.tagOperations.restyle('sentence');
    expect(sentence.body('a')).toBe('On #Design-system');
    expect(sentence.frontmatterTags('a')).toEqual(['Research-notes']);

    const title = setup({ a: '---\nid: a\ntags:\n  - research-notes\n---\nOn #design-system' });
    await title.tagOperations.restyle('title');
    expect(title.body('a')).toBe('On #Design-System');
    expect(title.frontmatterTags('a')).toEqual(['Research-Notes']);
  });

  it('writes to disk and leaves tag identity untouched (still one tag, same usage)', async () => {
    const t = setup({ a: '#design-system', b: '#design_system', c: 'none' });

    const result = await t.tagOperations.restyle('title');

    expect(result.complete).toBe(true);
    expect(result.updatedPageIds).toEqual(['a', 'b']);
    expect(await t.onDisk('a')).toContain('#Design-System');
    expect(await t.onDisk('b')).toContain('#Design_System'); // casing only: separator kept
    expect([...t.vault.tags()].map((tag) => [tag.name, tag.usageCount])).toEqual([['Design-System', 2]]);
  });

  it('is idempotent — a second run finds and writes nothing', async () => {
    const t = setup({ a: '#design-system', b: '---\nid: b\ntags:\n  - ux\n---\nx' });
    await t.tagOperations.restyle('title');
    const writes = vi.spyOn(t.fileSystem, 'writeFile');

    const second = await t.tagOperations.restyle('title');

    expect(second.attemptedPageCount).toBe(0);
    expect(second.updatedPageIds).toEqual([]);
    expect(writes).not.toHaveBeenCalled();
  });

  it('includes archived notes, which stay archived', async () => {
    const t = setup({
      a: '#design',
      b: '---\nid: b\nstatus: archived\ntags:\n  - design\n---\nOld #design',
    });

    await t.tagOperations.restyle('title');

    expect(t.body('b')).toBe('Old #Design');
    expect(t.frontmatterTags('b')).toEqual(['Design']);
    expect(t.vault.getPage('b')!.metadata.status).toBe('archived');
  });

  it('includes unsaved editor text through the document session', async () => {
    const t = setup({ a: 'saved #design' });
    t.registry.open('a', 'saved #design');
    t.pageOperations.commitEdit('a', 'saved #design and unsaved #design-system');

    const result = await t.tagOperations.restyle('title');

    expect(result.complete).toBe(true);
    expect(t.registry.get('a')!.currentRevision.markdown).toBe('saved #Design and unsaved #Design-System');
    await t.pageOperations.requestSave('a');
    expect(await t.onDisk('a')).toContain('saved #Design and unsaved #Design-System');
  });

  it('skips a note changed on disk, reports it, and a re-run finishes the job', async () => {
    const t = setup({ a: '#design', b: '#design' });
    await t.fileSystem.writeFile(`${ROOT}/b.md`, '---\nid: b\n---\n#design edited');

    const partial = await t.tagOperations.restyle('title');

    expect(partial.complete).toBe(false);
    expect(partial.skipped.map((entry) => entry.pageId)).toEqual(['b']);
    expect(t.body('a')).toBe('#Design');

    // Sync catches up; the second run only has the leftover note to do.
    t.vault.replacePage(
      pageFromDocument('b', '---\nid: b\n---\n#design edited').page
    );
    const finished = await t.tagOperations.restyle('title');

    expect(finished.complete).toBe(true);
    expect(finished.updatedPageIds).toEqual(['b']);
    expect(await t.onDisk('b')).toContain('#Design edited');
  });

  it('writes definitions once, restyling stored spellings and keeping icons — and adds no style field', async () => {
    const t = setup(
      { a: '#design' },
      { design: { icon: '🎨' }, 'unused tag': { name: 'unused-tag', favorite: true } }
    );
    const definitionWrites = vi.spyOn(t.store, 'update');

    await t.tagOperations.restyle('title');

    expect(definitionWrites).toHaveBeenCalledTimes(1);
    expect(t.definitionsOnDisk()).toEqual({
      design: { icon: '🎨', name: 'Design' },
      'unused tag': { name: 'Unused-Tag', favorite: true },
    });
    expect(JSON.stringify(t.definitionsOnDisk())).not.toMatch(/style/i);
  });

  it('keeps definitions untouched while the batch is incomplete', async () => {
    const t = setup({ a: '#design', b: '#design' }, { design: { icon: '🎨' } });
    await t.fileSystem.writeFile(`${ROOT}/b.md`, '---\nid: b\n---\n#design edited');

    await t.tagOperations.restyle('title');

    expect(t.definitionsOnDisk()).toEqual({ design: { icon: '🎨' } });
  });

  it('moves spelling-keyed Configure/expansion state with the new spelling', async () => {
    const t = setup({ a: '#design-system' });
    const renameKey = vi.fn();
    const renameTag = vi.fn();
    const operations = new TagOperations(
      t.vault,
      t.store,
      t.fileSystem,
      t.pageOperations,
      { renameKey } as never,
      { renameTag } as never
    );

    await operations.restyle('title');

    expect(renameKey).toHaveBeenCalledWith('tag:design-system', 'tag:Design-System');
    expect(renameTag).toHaveBeenCalledWith('design-system', 'Design-System');
  });

  it('an already-matching vault does no work: nothing is read from or written to disk', async () => {
    const t = setup(
      { a: '---\nid: a\ntags:\n  - Research\n---\nOn #Design', b: '#Ux' },
      { design: { name: 'Design' }, ux: { name: 'Ux', icon: '🎨' } }
    );
    const reads = vi.spyOn(t.fileSystem, 'readFile');
    const writes = vi.spyOn(t.fileSystem, 'writeFile');
    const definitionUpdates = vi.spyOn(t.store, 'update');

    const result = await t.tagOperations.restyle('title');

    expect(result).toMatchObject({ attemptedPageCount: 0, updatedPageIds: [], complete: true });
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(definitionUpdates).not.toHaveBeenCalled();
  });

  it('reads and rewrites only the affected notes, once each', async () => {
    const t = setup({ a: '#design', b: '#Design-System', c: 'no tags here', d: '#Ux' });
    const reads = vi.spyOn(t.fileSystem, 'readFile');

    const result = await t.tagOperations.restyle('title');

    expect(result.updatedPageIds).toEqual(['a']);
    // Only the one affected note is read back for its changed-on-disk check.
    expect(reads.mock.calls.map(([path]) => path)).not.toContain(`${ROOT}/b.md`);
    expect(reads.mock.calls.filter(([path]) => path === `${ROOT}/a.md`).length).toBeGreaterThan(0);
    expect(reads.mock.calls.some(([path]) => path === `${ROOT}/c.md` || path === `${ROOT}/d.md`)).toBe(false);
  });

  it('does not change how a new tag is created, whatever style was last applied', async () => {
    const t = setup({ a: '#design' });
    await t.tagOperations.restyle('title');

    expect(t.tagOperations.checkNewTagName('Fresh Idea')).toEqual({ ok: true, name: 'fresh-idea' });
  });
});
