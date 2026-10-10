import { describe, expect, it } from 'vitest';

import { PageOperations } from '@core/application/page/PageOperations';
import { PagePathResolver } from '@core/application/page/PagePathResolver';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
import { MoveService } from '@core/vault/persistence/MoveService';
import { Workspace } from '@core/workspace/Workspace';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import type { PageFrontmatter } from '@core/vault/ingest/frontmatter/PageFrontmatter';

import { createNoteFromTemplate } from './createNoteFromTemplate';

const ROOT = '/vault';

function buildTemplate(frontmatter: Partial<PageFrontmatter>, body = '# Agenda\n\n- item') {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: `${ROOT}/Template.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'template-1', ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

/** The real Vault + Persistence Gate + PageOperations stack over an in-memory file system. */
function setup(frontmatter: Partial<PageFrontmatter>) {
  const template = buildTemplate(frontmatter);
  const vault = new Vault(ROOT, [template], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const fileSystem = new InMemoryVaultFileSystem();
  fileSystem.seedFile(template.path, new FrontmatterSerializer().serializeDocument(template, template.source.markdown));

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

  const created = () => [...vault.pages()].filter((page) => page.id !== template.id);

  return { vault, fileSystem, pageOperations, template, created };
}

const VISUAL = {
  icon: '🧾',
  cover: 'Assets/cover.png',
  coverHidden: true,
  coverLayout: 'above' as const,
  coverPositionAbove: 30,
  coverPositionSide: 70,
};

async function useTemplate(env: ReturnType<typeof setup>) {
  await createNoteFromTemplate(
    env.pageOperations,
    null,
    env.template.source.markdown,
    env.vault.getPage(env.template.id)!.metadata
  );
}

describe('createNoteFromTemplate — icon and cover inheritance', () => {
  it('1. a template with an icon and a cover: the new note has both at once, with its own id, the body, and the cover settings', async () => {
    const env = setup(VISUAL);

    await useTemplate(env);

    const [note] = env.created();
    expect(env.created()).toHaveLength(1);
    expect(note!.id).not.toBe('template-1');
    expect(note!.metadata.icon).toBe('🧾');
    expect(note!.metadata.cover).toBe('Assets/cover.png');
    expect(note!.metadata.coverHidden).toBe(true);
    expect(note!.metadata.coverLayout).toBe('above');
    expect(note!.metadata.coverPositionAbove).toBe(30);
    expect(note!.metadata.coverPositionSide).toBe(70);
    expect(note!.source.markdown).toBe('# Agenda\n\n- item');
  });

  it('a template with only a cover and icon leaves tags and description empty on the note', async () => {
    const env = setup(VISUAL);

    await useTemplate(env);

    const [note] = env.created();
    expect(note!.metadata.tags).toEqual([]);
    expect(note!.metadata.description).toBeNull();
    expect(note!.id).not.toBe(env.template.id);
  });

  it('2. an icon but no cover: only the icon is inherited', async () => {
    const env = setup({ icon: '📌' });

    await useTemplate(env);

    const [note] = env.created();
    expect(note!.metadata.icon).toBe('📌');
    expect(note!.metadata.cover).toBeNull();
    expect(note!.source.markdown).toBe('# Agenda\n\n- item');
  });

  it('3. a cover but no icon: only the cover (and its settings) is inherited', async () => {
    const env = setup({ cover: 'https://example.com/c.jpg', coverLayout: 'above', coverPositionAbove: 10 });

    await useTemplate(env);

    const [note] = env.created();
    expect(note!.metadata.icon).toBeNull();
    expect(note!.metadata.cover).toBe('https://example.com/c.jpg');
    expect(note!.metadata.coverLayout).toBe('above');
    expect(note!.metadata.coverPositionAbove).toBe(10);
  });

  it('4. neither: behaves as before — a plain draft carrying the body, nothing persisted yet', async () => {
    const env = setup({});

    await useTemplate(env);

    expect(env.created()).toHaveLength(0);
    expect([...env.vault.pages()].map((p) => p.id)).toEqual(['template-1']);
  });

  it('5. the icon and cover are written to the file, so they persist when the note is reopened', async () => {
    const env = setup(VISUAL);

    await useTemplate(env);

    const [note] = env.created();
    const onDisk = await env.fileSystem.readFile(note!.path);
    expect(onDisk).toContain('icon: 🧾');
    expect(onDisk).toContain('cover: Assets/cover.png');
    expect(onDisk).toContain('coverLayout: above');
    expect(onDisk).toContain('# Agenda');
    // The id on disk is the new note's own, not the template's.
    expect(onDisk).toContain(`id: ${note!.id}`);
  });

  it('6. changing the new note’s icon and cover leaves the template unchanged', async () => {
    const env = setup(VISUAL);
    await useTemplate(env);
    const [note] = env.created();
    const templateBefore = await env.fileSystem.readFile(env.template.path);

    await env.pageOperations.updateMetadata(note!.id, { icon: '🔥', cover: 'Assets/other.png' });

    expect(env.vault.getPage(note!.id)!.metadata.icon).toBe('🔥');
    expect(env.vault.getPage('template-1')!.metadata.icon).toBe('🧾');
    expect(env.vault.getPage('template-1')!.metadata.cover).toBe('Assets/cover.png');
    expect(await env.fileSystem.readFile(env.template.path)).toBe(templateBefore);
  });

  it('7. a blank template with neither leaves the empty draft, as before', async () => {
    const env = setup({});

    await createNoteFromTemplate(env.pageOperations, null, '  \n', env.vault.getPage('template-1')!.metadata);

    expect(env.created()).toHaveLength(0);
  });
});

const FULL_TEMPLATE: Partial<PageFrontmatter> = {
  ...VISUAL,
  description: 'Template description',
  tags: ['tpl', 'meeting'],
  aliases: ['Tpl alias'],
  favorite: true,
  created: '2020-01-01T00:00:00.000Z',
  modified: '2020-02-02T00:00:00.000Z',
  unownedLines: ['kind: template', 'Priority: High', 'Attendees:', '  - Ann', '  - Bo', 'reviewed: true'],
};

describe('createNoteFromTemplate — full inheritance rules', () => {
  it('inherits the body, icon, cover (with its presentation), tags, description and custom properties', async () => {
    const env = setup(FULL_TEMPLATE);

    await useTemplate(env);

    const [note] = env.created();
    expect(env.created()).toHaveLength(1);
    expect(note!.source.markdown).toBe('# Agenda\n\n- item');
    expect(note!.metadata).toMatchObject({
      icon: '🧾',
      cover: 'Assets/cover.png',
      coverHidden: true,
      coverLayout: 'above',
      coverPositionAbove: 30,
      coverPositionSide: 70,
      description: 'Template description',
      tags: ['tpl', 'meeting'],
    });
    expect(note!.metadata.unownedFrontmatter).toEqual(['Priority: High', 'Attendees:', '  - Ann', '  - Bo', 'reviewed: true']);
  });

  it('does not inherit aliases, favorite, id, created, modified or the kind: template marker', async () => {
    const env = setup(FULL_TEMPLATE);

    await useTemplate(env);

    const [note] = env.created();
    expect(note!.metadata.aliases ?? []).toEqual([]);
    expect(note!.metadata.favorite).toBe(false);
    expect(note!.id).not.toBe('template-1');
    expect(note!.metadata.createdAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(note!.metadata.updatedAt).not.toBe('2020-02-02T00:00:00.000Z');
    expect(note!.metadata.unownedFrontmatter!.join('\n')).not.toMatch(/kind/);
  });

  it('writes the custom properties, tags and description to the file — all in one create, the template untouched', async () => {
    const env = setup(FULL_TEMPLATE);
    const templateBefore = await env.fileSystem.readFile(env.template.path);

    await useTemplate(env);

    const [note] = env.created();
    const onDisk = await env.fileSystem.readFile(note!.path);
    expect(onDisk).toContain(`id: ${note!.id}`);
    expect(onDisk).toContain('description: Template description');
    expect(onDisk).toMatch(/tpl/);
    expect(onDisk).toContain('Priority: High');
    expect(onDisk).toContain('Attendees:\n  - Ann\n  - Bo');
    expect(onDisk).toContain('reviewed: true');
    expect(onDisk).not.toContain('kind: template');
    expect(onDisk).not.toContain('Tpl alias');
    expect(onDisk).not.toContain('favorite');
    expect(onDisk).not.toContain('2020-01-01');
    expect(await env.fileSystem.readFile(env.template.path)).toBe(templateBefore);
  });

  it('the custom properties survive a reload of the file (parse and rebuild)', async () => {
    const env = setup(FULL_TEMPLATE);
    await useTemplate(env);
    const [note] = env.created();

    const reparsed = new FrontmatterParser().parse(await env.fileSystem.readFile(note!.path)).frontmatter;

    expect(reparsed.unownedLines).toEqual(['Priority: High', 'Attendees:', '  - Ann', '  - Bo', 'reviewed: true']);
    expect(reparsed.id).toBe(note!.id);
    expect(reparsed.tags).toEqual(['tpl', 'meeting']);
  });

  it('a user\'s own non-template `kind` is a custom property and is kept', async () => {
    const env = setup({ unownedLines: ['kind: book', 'rating: 5'] });

    await useTemplate(env);

    expect(env.created()[0]!.metadata.unownedFrontmatter).toEqual(['kind: book', 'rating: 5']);
  });

  it('a template with only custom properties still makes the note (with them), and one with none stays a draft', async () => {
    const withProps = setup({ unownedLines: ['rating: 5'] });
    await useTemplate(withProps);
    expect(withProps.created()).toHaveLength(1);

    const none = setup({ unownedLines: ['kind: template'] });
    await useTemplate(none);
    expect(none.created()).toHaveLength(0);
  });

  it('a note made from a template that lacks a property leaves that property at its normal default', async () => {
    const env = setup({ ...VISUAL });

    await useTemplate(env);

    const [note] = env.created();
    expect(note!.metadata.description).toBeNull();
    expect(note!.metadata.tags ?? []).toEqual([]);
    expect(note!.metadata.unownedFrontmatter ?? []).toEqual([]);
  });
});
