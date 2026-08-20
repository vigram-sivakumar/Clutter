import { describe, expect, it } from 'vitest';
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
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { TaskExtractor } from '../../vault/ingest/extractors/TaskExtractor';
import { TagExtractor } from '../../vault/ingest/extractors/TagExtractor';
import { LinkExtractor } from '../../vault/ingest/extractors/LinkExtractor';
import { EmbedExtractor } from '../../vault/ingest/extractors/EmbedExtractor';
import { BlockReferenceExtractor } from '../../vault/ingest/extractors/BlockReferenceExtractor';
import { HeadingExtractor } from '../../vault/ingest/extractors/HeadingExtractor';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

function buildPage(id: string, body: string): Page {
  const builder = new PageBuilder();

  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${id}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: {
        headings: new HeadingExtractor().extract(body),
        blockReferences: new BlockReferenceExtractor().extract(body),
        tasks: new TaskExtractor().extract(body),
        tags: new TagExtractor().extract(body),
        links: new LinkExtractor().extract(body),
        embeds: new EmbedExtractor().extract(body),
      },
    },
  });
}

/** Same scaffold TaskOperations.test.ts uses for its own mutateBody()-backed operation. */
function setup(pages: Page[]) {
  const vault = new Vault(
    ROOT,
    pages,
    [],
    new TagBuilder().build(pages),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const fileSystem = new InMemoryVaultFileSystem();

  for (const page of pages) {
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
  }

  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
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
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );

  return {
    vault,
    fileSystem,
    pageOperations,
    tagOperations: new TagOperations(vault, fileSystem, ROOT, pageOperations),
  };
}

describe('TagOperations.updateMetadata', () => {
  // Lazy system-folder lifecycle, applied to `.clutter`: it is never
  // eagerly created at startup (there is no VaultInitializer anymore), so
  // every writer ensures it exists immediately before writing —
  // TagOperations is the current one. InMemoryVaultFileSystem.writeFile()
  // doesn't itself require a parent directory to exist (unlike the real
  // Tauri filesystem), so this test asserts the directory was actually
  // created, not just that the write happened to succeed regardless.
  it('ensures .clutter exists before writing tags.json when it was missing', async () => {
    const { fileSystem, tagOperations } = setup([]);
    expect(await fileSystem.exists('/vault/.clutter')).toBe(false);

    await tagOperations.updateMetadata('Project', { icon: '📦' });

    expect(await fileSystem.exists('/vault/.clutter')).toBe(true);
  });

  it('does nothing extra when .clutter already exists', async () => {
    const { fileSystem, tagOperations } = setup([]);
    await fileSystem.createDirectory('/vault/.clutter');

    await expect(
      tagOperations.updateMetadata('Project', { icon: '📦' })
    ).resolves.toBeUndefined();
    expect(await fileSystem.exists('/vault/.clutter')).toBe(true);
  });

  it('creates .clutter/tags.json with a normalized key on first assignment', async () => {
    const { fileSystem, vault, tagOperations } = setup([]);

    await tagOperations.updateMetadata('Project', { icon: '📦' });

    const written = JSON.parse(fileSystem.getFileSync('/vault/.clutter/tags.json')!);
    expect(written).toEqual({ tags: { project: { icon: '📦' } } });
    expect([...vault.tags()]).toEqual([]); // no occurrence anywhere — no Tag manufactured
  });

  it('merges a patch into an existing entry rather than replacing it', async () => {
    const { fileSystem, tagOperations } = setup([]);
    fileSystem.seedFile(
      '/vault/.clutter/tags.json',
      JSON.stringify({ tags: { project: { icon: '📦' } } })
    );

    await tagOperations.updateMetadata('project', { icon: '🚀' });

    const written = JSON.parse(fileSystem.getFileSync('/vault/.clutter/tags.json')!);
    expect(written).toEqual({ tags: { project: { icon: '🚀' } } });
  });

  it('removes the entry entirely when every field is cleared', async () => {
    const { fileSystem, tagOperations } = setup([]);
    fileSystem.seedFile(
      '/vault/.clutter/tags.json',
      JSON.stringify({ tags: { project: { icon: '📦' } } })
    );

    await tagOperations.updateMetadata('project', { icon: undefined });

    const written = JSON.parse(fileSystem.getFileSync('/vault/.clutter/tags.json')!);
    expect(written).toEqual({ tags: {} });
  });

  it('normalizes hand-edited mixed-case keys on read', async () => {
    const { fileSystem, tagOperations } = setup([]);
    fileSystem.seedFile(
      '/vault/.clutter/tags.json',
      JSON.stringify({ tags: { Project: { icon: '📦' } } })
    );

    await tagOperations.updateMetadata('project', { icon: '🚀' });

    const written = JSON.parse(fileSystem.getFileSync('/vault/.clutter/tags.json')!);
    expect(written).toEqual({ tags: { project: { icon: '🚀' } } });
  });

  it('pushes the new metadata into Vault via setTagMetadata', async () => {
    const { vault, tagOperations } = setup([]);
    const setTagMetadataSpy = vault.setTagMetadata.bind(vault);
    let capturedMetadata: ReadonlyMap<string, unknown> | undefined;
    vault.setTagMetadata = (metadata) => {
      capturedMetadata = metadata;
      setTagMetadataSpy(metadata);
    };

    await tagOperations.updateMetadata('project', { icon: '📦' });

    expect(capturedMetadata?.get('project')).toEqual({ icon: '📦' });
  });
});

describe('TagOperations.canRename', () => {
  it('returns false for an empty or whitespace-only name, mirroring rename()\'s own rejection', () => {
    const page = buildPage('p1', '#product-design and #marketing');
    const { tagOperations } = setup([page]);

    expect(tagOperations.canRename('product-design', '')).toBe(false);
    expect(tagOperations.canRename('product-design', '   ')).toBe(false);
  });

  it('returns false for a normalized identity that already belongs to a different existing tag', () => {
    const page = buildPage('p1', '#product-design and #marketing');
    const { tagOperations } = setup([page]);

    expect(tagOperations.canRename('product-design', 'Marketing')).toBe(false);
  });

  it('returns false for a collision regardless of the target tag\'s own separator/casing variant', () => {
    const page = buildPage('p1', '#product-design and #Marketing_Team');
    const { tagOperations } = setup([page]);

    expect(tagOperations.canRename('product-design', 'marketing-team')).toBe(false);
  });

  it('returns true for a different separator/casing of the tag\'s OWN identity (not a collision)', () => {
    const page = buildPage('p1', '#product-design');
    const { tagOperations } = setup([page]);

    expect(tagOperations.canRename('product-design', 'product_design')).toBe(true);
  });

  it('returns true for a genuinely new, non-colliding name', () => {
    const page = buildPage('p1', '#product-design and #marketing');
    const { tagOperations } = setup([page]);

    expect(tagOperations.canRename('product-design', 'UX design')).toBe(true);
  });

  it('returns false for a name containing a character outside the tag grammar (e.g. a colon) — regression for "Personal: project" silently truncating to "Personal" once re-parsed', () => {
    const page = buildPage('p1', '#product-design');
    const { tagOperations } = setup([page]);

    expect(tagOperations.canRename('product-design', 'Personal: project')).toBe(false);
  });

  it('returns false for other characters outside the tag grammar (slash, hash, apostrophe)', () => {
    const page = buildPage('p1', '#product-design');
    const { tagOperations } = setup([page]);

    expect(tagOperations.canRename('product-design', 'work/personal')).toBe(false);
    expect(tagOperations.canRename('product-design', 'a#b')).toBe(false);
    expect(tagOperations.canRename('product-design', "editor's notes")).toBe(false);
  });

  it('still returns true for a name using only letters, digits, hyphen, underscore, and spaces (all serialize to valid characters)', () => {
    const page = buildPage('p1', '#product-design');
    const { tagOperations } = setup([page]);

    expect(tagOperations.canRename('product-design', 'UX Design System 2')).toBe(true);
    expect(tagOperations.canRename('product-design', 'ux_design-system')).toBe(true);
  });

  it('never mutates anything — safe to call speculatively without affecting a later rename()', async () => {
    const page = buildPage('p1', '#product-design');
    const { vault, tagOperations } = setup([page]);

    tagOperations.canRename('product-design', 'UX design');
    tagOperations.canRename('product-design', 'Marketing');

    expect(vault.getPage('p1')!.source.markdown).toBe('#product-design');

    await tagOperations.rename('product-design', 'UX design');
    expect(vault.getPage('p1')!.source.markdown).toBe('#UX-design');
  });
});

describe('TagOperations.rename', () => {
  it('successfully changes the canonical tag name in the source Markdown', async () => {
    const page = buildPage('p1', 'Working on #product-design today.');
    const { vault, tagOperations } = setup([page]);

    await tagOperations.rename('product-design', 'UX design');

    expect(vault.getPage('p1')!.source.markdown).toBe(
      'Working on #UX-design today.'
    );
  });

  it('updates the in-memory Tag/Vault projection after the source rewrite — no manual reindex needed', async () => {
    const page = buildPage('p1', '#product-design');
    const { vault, tagOperations } = setup([page]);

    await tagOperations.rename('product-design', 'UX design');

    const tags = [...vault.tags()];
    expect(tags).toHaveLength(1);
    expect(tags[0]!.name).toBe('UX-design');
  });

  it('rewrites the occurrence across every affected page, not just one', async () => {
    const pageA = buildPage('a', 'See #product-design for details.');
    const pageB = buildPage('b', 'Also tagged #product-design here.');
    const pageC = buildPage('c', 'Unrelated content, no tag.');
    const { vault, tagOperations } = setup([pageA, pageB, pageC]);

    await tagOperations.rename('product-design', 'UX design');

    expect(vault.getPage('a')!.source.markdown).toBe('See #UX-design for details.');
    expect(vault.getPage('b')!.source.markdown).toBe('Also tagged #UX-design here.');
    expect(vault.getPage('c')!.source.markdown).toBe('Unrelated content, no tag.');
  });

  it('renames every separator/case variant of the same logical tag to the canonical new form', async () => {
    const pageA = buildPage('a', '#Product-design');
    const pageB = buildPage('b', '#product_design');
    const pageC = buildPage('c', '#PRODUCT-DESIGN');
    const pageD = buildPage('d', '#Product_Design');
    const { vault, tagOperations } = setup([pageA, pageB, pageC, pageD]);

    await tagOperations.rename('Product-design', 'UX design');

    expect(vault.getPage('a')!.source.markdown).toBe('#UX-design');
    expect(vault.getPage('b')!.source.markdown).toBe('#UX-design');
    expect(vault.getPage('c')!.source.markdown).toBe('#UX-design');
    expect(vault.getPage('d')!.source.markdown).toBe('#UX-design');
  });

  it('does not touch an unrelated tag on the same line or page', async () => {
    const page = buildPage('p1', '#product-design and #marketing both apply.');
    const { vault, tagOperations } = setup([page]);

    await tagOperations.rename('product-design', 'UX design');

    expect(vault.getPage('p1')!.source.markdown).toBe(
      '#UX-design and #marketing both apply.'
    );
  });

  it('preserves all other Markdown content exactly, including formatting and unrelated lines', async () => {
    const page = buildPage(
      'p1',
      '# Heading\n\nSome **bold** text with #product-design mentioned.\n\n- A list item\n- #product-design again'
    );
    const { vault, tagOperations } = setup([page]);

    await tagOperations.rename('product-design', 'UX design');

    expect(vault.getPage('p1')!.source.markdown).toBe(
      '# Heading\n\nSome **bold** text with #UX-design mentioned.\n\n- A list item\n- #UX-design again'
    );
  });

  it('does not touch ordinary text that merely contains the same characters without being a tag occurrence', async () => {
    const page = buildPage(
      'p1',
      'product-design is a phrase, and so is product_design, neither preceded by #.'
    );
    const { vault, tagOperations } = setup([page]);

    await tagOperations.rename('product-design', 'UX design');

    expect(vault.getPage('p1')!.source.markdown).toBe(
      'product-design is a phrase, and so is product_design, neither preceded by #.'
    );
  });

  it('rejects a rename to a normalized identity that already belongs to a different existing tag', async () => {
    const page = buildPage('p1', '#product-design and #marketing');
    const { vault, tagOperations } = setup([page]);

    await expect(tagOperations.rename('product-design', 'Marketing')).rejects.toThrow(
      /already exists/
    );
    // Nothing was rewritten.
    expect(vault.getPage('p1')!.source.markdown).toBe('#product-design and #marketing');
  });

  it('rejects a collision regardless of the target tag\'s own separator/casing variant', async () => {
    const page = buildPage('p1', '#product-design and #Marketing_Team');
    const { tagOperations } = setup([page]);

    // "marketing team" (normalized) already exists as "Marketing_Team".
    await expect(
      tagOperations.rename('product-design', 'marketing-team')
    ).rejects.toThrow(/already exists/);
  });

  it('allows renaming a tag to a different separator/casing of its OWN identity (not a collision) — underscore is itself a valid canonical separator, left as typed', async () => {
    const page = buildPage('p1', '#product-design');
    const { vault, tagOperations } = setup([page]);

    await expect(
      tagOperations.rename('product-design', 'product_design')
    ).resolves.toBeUndefined();
    // serializeTagName only converts spaces (display form) to hyphens — a
    // directly-typed underscore is a valid canonical separator on its own
    // and is preserved, matching "product-design"/"product_design" both
    // being valid canonical names.
    expect(vault.getPage('p1')!.source.markdown).toBe('#product_design');
  });

  it('rejects an empty new name', async () => {
    const page = buildPage('p1', '#product-design');
    const { vault, tagOperations } = setup([page]);

    await expect(tagOperations.rename('product-design', '')).rejects.toThrow(
      /cannot be empty/
    );
    await expect(tagOperations.rename('product-design', '   ')).rejects.toThrow(
      /cannot be empty/
    );
    expect(vault.getPage('p1')!.source.markdown).toBe('#product-design');
  });

  it('rejects a name containing a character outside the tag grammar (e.g. a colon), never writing it to Markdown', async () => {
    const page = buildPage('p1', '#product-design');
    const { vault, tagOperations } = setup([page]);

    await expect(tagOperations.rename('product-design', 'Personal: project')).rejects.toThrow(
      /aren't allowed in a tag name/
    );
    expect(vault.getPage('p1')!.source.markdown).toBe('#product-design');
  });

  it('resolves without error and rewrites nothing when no page contains the tag', async () => {
    const page = buildPage('p1', 'No tags here at all.');
    const { vault, tagOperations } = setup([page]);

    await expect(
      tagOperations.rename('nonexistent-tag', 'something-else')
    ).resolves.toBeUndefined();
    expect(vault.getPage('p1')!.source.markdown).toBe('No tags here at all.');
  });

  it('serializes a display-style name (spaces) to the canonical hyphen-separated form', async () => {
    const page = buildPage('p1', '#product-design');
    const { vault, tagOperations } = setup([page]);

    await tagOperations.rename('product-design', 'UX Design System');

    expect(vault.getPage('p1')!.source.markdown).toBe('#UX-Design-System');
  });

  it('persists the rewrite to disk, not just in-memory Vault state', async () => {
    const page = buildPage('p1', '#product-design');
    const { fileSystem, tagOperations } = setup([page]);

    await tagOperations.rename('product-design', 'UX design');

    const persisted = await fileSystem.readFile(page.path);
    expect(persisted).toContain('#UX-design');
    expect(persisted).not.toContain('product-design');
  });
});
