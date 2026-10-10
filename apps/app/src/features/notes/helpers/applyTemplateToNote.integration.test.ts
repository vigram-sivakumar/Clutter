import { describe, expect, it, vi } from 'vitest';

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

import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { applyTemplateToNote } from './applyTemplateToNote';

const ROOT = '/vault';

function buildPage(id: string, path: string, frontmatter: Partial<PageFrontmatter>, body: string) {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: ROOT,
      frontmatter: { id, ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

/** The real Vault + Persistence Gate + PageOperations stack over an in-memory file system. */
function setup(
  templateFrontmatter: Partial<PageFrontmatter>,
  noteFrontmatter: Partial<PageFrontmatter> | null = {}
) {
  const template = buildPage('template-1', `${ROOT}/Template.md`, templateFrontmatter, '# Agenda\n\n- item');
  const note = noteFrontmatter ? buildPage('note-1', `${ROOT}/Note.md`, noteFrontmatter, '') : null;
  const pages = note ? [template, note] : [template];
  const vault = new Vault(ROOT, pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const fileSystem = new InMemoryVaultFileSystem();

  for (const page of pages) {
    fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
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
    () => {}
  );

  return { vault, fileSystem, pageOperations, documentRegistry, template, note };
}

const TEMPLATE: Partial<PageFrontmatter> = {
  icon: '🧾',
  cover: 'Assets/cover.png',
  coverLayout: 'above',
  coverPositionAbove: 30,
  description: 'Template description',
  tags: ['tpl', 'meeting'],
  aliases: ['Tpl alias'],
  favorite: true,
  created: '2020-01-01T00:00:00.000Z',
  unownedLines: ['kind: template', 'Priority: High', 'Attendees:', '  - Ann', '  - Bo', 'reviewed: true'],
};

type Env = ReturnType<typeof setup>;

const apply = (env: Env, id: string, type: 'note' | 'daily-note', existing = env.vault.getPage(id)?.metadata ?? {}) =>
  applyTemplateToNote(
    env.pageOperations,
    id,
    type,
    existing,
    env.template.source.markdown,
    env.vault.getPage('template-1')!.metadata
  );

/** The body as the editor shows it: the open session's text. */
const bodyOf = (env: Env, id: string) => env.documentRegistry.get(id)?.currentRevision.markdown;

describe('applyTemplateToNote — a persisted note', () => {
  it('puts the body and the inherited metadata into the same note, creating nothing, and writes it to disk', async () => {
    const env = setup(TEMPLATE);
    await env.pageOperations.open('note-1');

    await apply(env, 'note-1', 'note');
    await env.pageOperations.requestSave('note-1');

    const note = env.vault.getPage('note-1')!;
    expect([...env.vault.pages()].map((page) => page.id).sort()).toEqual(['note-1', 'template-1']);
    expect(bodyOf(env, 'note-1')).toBe('# Agenda\n\n- item');
    expect(note.metadata.icon).toBe('🧾');
    expect(note.metadata.cover).toBe('Assets/cover.png');
    expect(note.metadata.coverLayout).toBe('above');
    expect(note.metadata.coverPositionAbove).toBe(30);
    expect(note.metadata.description).toBe('Template description');
    expect(note.metadata.tags).toEqual(['tpl', 'meeting']);
    expect(note.metadata.aliases).toEqual([]);
    expect(note.metadata.favorite).toBe(false);
    expect(note.metadata.unownedFrontmatter).toEqual(['Priority: High', 'Attendees:', '  - Ann', '  - Bo', 'reviewed: true']);

    const onDisk = await env.fileSystem.readFile(note.path);
    expect(onDisk).toContain('id: note-1');
    expect(onDisk).toContain('# Agenda');
    expect(onDisk).toContain('Attendees:\n  - Ann\n  - Bo');
    expect(onDisk).not.toContain('kind: template');
    expect(onDisk).not.toContain('Tpl alias');
    expect(onDisk).not.toContain('2020-01-01');
    const reparsed = new FrontmatterParser().parse(onDisk).frontmatter;
    expect(reparsed.unownedLines).toEqual(['Priority: High', 'Attendees:', '  - Ann', '  - Bo', 'reviewed: true']);
  });

  it('merges: the template\'s icon and cover replace the note\'s; keeps its own description and property values; unions tags; adds missing properties', async () => {
    const env = setup(TEMPLATE, {
      icon: '📌',
      cover: 'Assets/mine.png',
      description: 'Mine',
      tags: ['mine', 'tpl'],
      aliases: ['My alias'],
      favorite: true,
      unownedLines: ['priority: Low', 'owner: Me'],
    });
    await env.pageOperations.open('note-1');

    await apply(env, 'note-1', 'note');

    const { metadata } = env.vault.getPage('note-1')!;
    expect(metadata.icon).toBe('🧾');
    expect(metadata.cover).toBe('Assets/cover.png');
    expect(metadata.coverLayout).toBe('above');
    expect(metadata.coverPositionAbove).toBe(30);
    expect(metadata.description).toBe('Mine');
    expect(metadata.tags).toEqual(['mine', 'tpl', 'meeting']);
    expect(metadata.aliases).toEqual(['My alias']);
    expect(metadata.favorite).toBe(true);
    // `priority` exists (any letter case), so the template's `Priority` is not added; `kind` never is.
    expect(metadata.unownedFrontmatter).toEqual([
      'priority: Low',
      'owner: Me',
      'Attendees:',
      '  - Ann',
      '  - Bo',
      'reviewed: true',
    ]);
  });

  it('is idempotent: applying twice changes nothing the second time and duplicates no tags or properties', async () => {
    const env = setup(TEMPLATE);
    await env.pageOperations.open('note-1');
    await apply(env, 'note-1', 'note');
    const once = env.vault.getPage('note-1')!.metadata;

    await apply(env, 'note-1', 'note');

    const twice = env.vault.getPage('note-1')!.metadata;
    expect(twice.tags).toEqual(once.tags);
    expect(twice.unownedFrontmatter).toEqual(once.unownedFrontmatter);
    expect(bodyOf(env, 'note-1')).toBe('# Agenda\n\n- item');
  });

  it('never overwrites text typed into the note after the check', async () => {
    const env = setup(TEMPLATE);
    await env.pageOperations.open('note-1');
    await env.pageOperations.mutateBody('note-1', () => 'typed');

    await apply(env, 'note-1', 'note');

    expect(bodyOf(env, 'note-1')).toBe('typed');
  });

  it('refuses an archived note and leaves it unchanged', async () => {
    const env = setup(TEMPLATE);
    await env.pageOperations.archive('note-1');

    await expect(apply(env, 'note-1', 'note')).rejects.toThrow(/archived/i);

    expect(env.vault.getPage('note-1')!.metadata.icon).toBeNull();
  });

  it('a failing metadata step leaves the body untouched (nothing half-applied)', async () => {
    const env = setup(TEMPLATE);
    await env.pageOperations.open('note-1');
    vi.spyOn(env.pageOperations, 'updateMetadata').mockRejectedValueOnce(new Error('disk full'));

    await expect(apply(env, 'note-1', 'note')).rejects.toThrow('disk full');

    expect(bodyOf(env, 'note-1')).toBe('');
    expect(env.vault.getPage('note-1')!.metadata.tags).toEqual([]);
  });

  it('a failing body step after the metadata step leaves the metadata applied, and a retry completes it', async () => {
    const env = setup(TEMPLATE);
    await env.pageOperations.open('note-1');
    vi.spyOn(env.pageOperations, 'mutateBody').mockRejectedValueOnce(new Error('abandoned'));

    await expect(apply(env, 'note-1', 'note')).rejects.toThrow('abandoned');
    expect(env.vault.getPage('note-1')!.metadata.tags).toEqual(['tpl', 'meeting']);
    expect(bodyOf(env, 'note-1')).toBe('');

    await apply(env, 'note-1', 'note');

    expect(bodyOf(env, 'note-1')).toBe('# Agenda\n\n- item');
    expect(env.vault.getPage('note-1')!.metadata.tags).toEqual(['tpl', 'meeting']);
  });
});

describe('applyTemplateToNote — a draft', () => {
  it('promotes the draft under its own id with the inherited metadata and body, and creates no other note', async () => {
    const env = setup(TEMPLATE, null);
    const draftId = await env.pageOperations.openDraft({ folderId: null });

    await apply(env, draftId, 'note', { tags: env.pageOperations.getDraft(draftId)?.tags });
    await env.pageOperations.requestSave(draftId);

    const created = [...env.vault.pages()].filter((page) => page.id !== 'template-1');
    expect(created.map((page) => page.id)).toEqual([draftId]);
    expect(created[0]!.metadata.tags).toEqual(['tpl', 'meeting']);
    expect(created[0]!.metadata.icon).toBe('🧾');
    expect(bodyOf(env, draftId)).toBe('# Agenda\n\n- item');
    expect(await env.fileSystem.readFile(created[0]!.path)).toContain('# Agenda');
  });

  it('keeps tags the draft already carries (a new note from a tag) in the union', async () => {
    const env = setup(TEMPLATE, null);
    const draftId = await env.pageOperations.openDraft({ folderId: null, tags: ['from-tag'] });

    await apply(env, draftId, 'note', { tags: env.pageOperations.getDraft(draftId)?.tags });

    expect(env.vault.getPage(draftId)!.metadata.tags).toEqual(['from-tag', 'tpl', 'meeting']);
  });

  it('a template with no metadata leaves the draft a draft: only the body is committed', async () => {
    const env = setup({}, null);
    const draftId = await env.pageOperations.openDraft({ folderId: null });

    await apply(env, draftId, 'note', {});

    expect(env.vault.getPage(draftId)).toBeUndefined();
    expect(bodyOf(env, draftId)).toBe('# Agenda\n\n- item');
  });
});

describe('applyTemplateToNote — a daily note', () => {
  it('promotes the empty daily draft at its own date and path, with the same id, and skips the icon', async () => {
    const env = setup(TEMPLATE, null);
    const path = DailyNotePath.absoluteFrom(`${ROOT}/Daily Notes`, new Date(2026, 9, 10));
    const draftId = await env.pageOperations.openAtPath(path, { type: 'daily-note' });

    await apply(env, draftId, 'daily-note', { tags: env.pageOperations.getDraft(draftId)?.tags });

    const page = env.vault.getPage(draftId)!;
    expect(page.id).toBe(draftId);
    expect(page.path).toBe(path);
    expect(page.metadata.icon).toBeNull();
    expect(page.metadata.cover).toBe('Assets/cover.png');
    expect(page.metadata.tags).toEqual(['tpl', 'meeting']);
    expect(page.metadata.description).toBe('Template description');
    expect(page.metadata.unownedFrontmatter).toEqual(['Priority: High', 'Attendees:', '  - Ann', '  - Bo', 'reviewed: true']);
    expect(bodyOf(env, draftId)).toBe('# Agenda\n\n- item');
    const onDisk = await env.fileSystem.readFile(path);
    // Promotion wrote the daily-note type and the draft's id. (Only this first write is asserted: in this
    // harness the vault's in-memory `type` is 'note' — it needs the real vault's reserved folders — so ANY
    // later save, with or without a template, rewrites the file without it.)
    expect(onDisk).toContain('type: daily-note');
    expect(onDisk).toContain(`id: ${draftId}`);
    expect(env.vault.getPageByPath(path)!.id).toBe(draftId);
  });
});
