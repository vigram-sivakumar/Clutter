import { describe, expect, it, vi } from 'vitest';

import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { PageOperations } from '@core/application/page/PageOperations';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { MoveService } from '@core/vault/persistence/MoveService';
import { PagePathResolver } from '@core/application/page/PagePathResolver';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { Workspace } from '@core/workspace/Workspace';
import type { Page } from '@core/vault/models/Page';

import {
  CREATE_TEMPLATE_LABELS,
  DAILY_NOTE_TEMPLATE_NAME,
  createTemplateFromPage,
  getCreateTemplateDefaults,
} from './createTemplateFromPage';

const ROOT = '/vault';

function buildPage(path: string, content: string, frontmatter: Record<string, unknown> = {}): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id: `id-${path}`, ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function setup(pages: Page[]) {
  const vault = new Vault(ROOT, pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const query = new VaultQuery(vault);
  const workspace = new Workspace();
  const fileSystem = new InMemoryVaultFileSystem();
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
    documentRegistry,
    saveCoordinator,
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
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);

  return { vault, workspace, pageOperations, folderOperations, effectivePageState };
}

describe('getCreateTemplateDefaults (dialog prefill)', () => {
  it('a Note prefills its own title and description', () => {
    expect(getCreateTemplateDefaults({ type: 'note', name: 'Weekly review', description: 'Every Friday' })).toEqual({
      name: 'Weekly review',
      description: 'Every Friday',
    });
  });

  it('a Note with no description leaves it empty', () => {
    expect(getCreateTemplateDefaults({ type: 'note', name: 'Weekly review', description: null })).toEqual({
      name: 'Weekly review',
      description: '',
    });
  });

  it('an auto-generated "Untitled" name is not carried over — the field is left for the user', () => {
    expect(getCreateTemplateDefaults({ type: 'note', name: 'Untitled', description: null }).name).toBe('');
  });

  it('a Daily Note whose title is its date gets a generic name, never the date', () => {
    const defaults = getCreateTemplateDefaults({ type: 'daily-note', name: '2026-10-07', description: null });

    expect(defaults.name).toBe(DAILY_NOTE_TEMPLATE_NAME);
    expect(defaults.name).toBe('Daily Note Template');
    expect(defaults.name).not.toMatch(/2026|October/);
  });

  it('a Daily Note still prefills its description when it has one', () => {
    expect(getCreateTemplateDefaults({ type: 'daily-note', name: '2026-10-07', description: 'Plan' }).description).toBe(
      'Plan'
    );
  });

  it('the dialog says "Create template" for its title and its CTA', () => {
    expect(CREATE_TEMPLATE_LABELS.title).toBe('Create template');
    expect(CREATE_TEMPLATE_LABELS.submitLabel).toBe('Create template');
  });
});

describe('createTemplateFromPage — a NEW Template from a copy of the content', () => {
  const NOTE_PATH = `${ROOT}/Projects/Weekly review.md`;
  const DAILY_PATH = `${ROOT}/Daily Notes/2026/October/2026-10-07.md`;

  it('creates a Template under the Templates root with the entered title, description and the source Markdown', async () => {
    const note = buildPage(NOTE_PATH, '# Review\n\n- [ ] item', { description: 'Every Friday' });
    const { vault, effectivePageState, pageOperations, folderOperations } = setup([note]);

    const newId = await createTemplateFromPage({ pageOperations, folderOperations, effectivePageState }, note.id, {
      name: 'Review template',
      description: 'Use every week',
    });

    const templates = vault.getReservedFolder('templates')!;
    const created = vault.getPage(newId)!;
    expect(created.path).toBe(`${ROOT}/Templates/Review template.md`);
    expect(created.parentId).toBe(templates.id);
    expect(created.metadata.description).toBe('Use every week');
    expect(created.source.markdown).toContain('# Review');
    expect(created.source.markdown).toContain('- [ ] item');
    expect(created.id).not.toBe(note.id);
  });

  it('the created page is a Template: it lives in Templates and carries the template marker', async () => {
    const note = buildPage(NOTE_PATH, 'Body');
    const { vault, effectivePageState, pageOperations, folderOperations } = setup([note]);

    const newId = await createTemplateFromPage({ pageOperations, folderOperations, effectivePageState }, note.id, {
      name: 'T',
    });

    expect(effectivePageState.getPage(newId)!.isTemplate).toBe(true);
    expect(vault.getPage(newId)!.metadata.unownedFrontmatter ?? []).toContain('kind: template');
  });

  it('leaves the source Note exactly as it was — same path, parent, content and metadata, not a template', async () => {
    const note = buildPage(NOTE_PATH, '# Review', { description: 'Every Friday', favorite: true });
    const { vault, effectivePageState, pageOperations, folderOperations } = setup([note]);
    const before = JSON.stringify(vault.getPage(note.id));

    await createTemplateFromPage({ pageOperations, folderOperations, effectivePageState }, note.id, { name: 'T' });

    expect(JSON.stringify(vault.getPage(note.id))).toBe(before);
    expect(vault.getPage(note.id)!.path).toBe(NOTE_PATH);
    expect(effectivePageState.getPage(note.id)!.isTemplate).toBe(false);
  });

  it('does not navigate, open or select anything — the current page stays active', async () => {
    const note = buildPage(NOTE_PATH, 'Body');
    const { workspace, effectivePageState, pageOperations, folderOperations } = setup([note]);
    workspace.openPage(note.id);
    const openSpy = vi.spyOn(pageOperations, 'open');
    const openPageSpy = vi.spyOn(workspace, 'openPage');

    const newId = await createTemplateFromPage({ pageOperations, folderOperations, effectivePageState }, note.id, {
      name: 'T',
    });

    expect(workspace.activePageId).toBe(note.id);
    expect(workspace.isPageOpen(newId)).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
    expect(openPageSpy).not.toHaveBeenCalled();
  });

  it('a Daily Note becomes a plain Template: copied body, but no Daily Note date, type or custom metadata', async () => {
    // (PageBuilder alone cannot know the vault root, so the type a Vault scan would derive from the path is set here.)
    const daily: Page = {
      ...buildPage(DAILY_PATH, '## Plan\n\n- [ ] todo', { description: 'Plan', mood: 'good' }),
      type: 'daily-note',
    };
    const { vault, effectivePageState, pageOperations, folderOperations } = setup([daily]);
    expect(effectivePageState.getPage(daily.id)!.type).toBe('daily-note');

    const newId = await createTemplateFromPage({ pageOperations, folderOperations, effectivePageState }, daily.id, {
      name: DAILY_NOTE_TEMPLATE_NAME,
      description: 'Plan',
    });

    const created = vault.getPage(newId)!;
    expect(created.path).toBe(`${ROOT}/Templates/Daily Note Template.md`);
    expect(created.type).toBe('note');
    expect(created.source.markdown).toContain('## Plan');
    expect(created.id).not.toBe(daily.id);
    // Nothing date-shaped, and none of the Daily Note's own custom properties, came across.
    expect(created.path).not.toMatch(/2026/);
    const carried = (created.metadata.unownedFrontmatter ?? []).join('\n');
    expect(carried).not.toContain('mood');
    expect(carried).not.toMatch(/2026/);
    // The Daily Note itself is untouched.
    expect(vault.getPage(daily.id)!.path).toBe(DAILY_PATH);
  });

  it('copies the source\'s CURRENT Markdown, including unsaved edits in an open session', async () => {
    const note = buildPage(NOTE_PATH, 'saved body');
    const { vault, effectivePageState, pageOperations, folderOperations } = setup([note]);
    await pageOperations.open(note.id);
    await pageOperations.mutateBody(note.id, () => 'unsaved edit');

    const newId = await createTemplateFromPage({ pageOperations, folderOperations, effectivePageState }, note.id, {
      name: 'T',
    });

    expect(vault.getPage(newId)!.source.markdown).toContain('unsaved edit');
  });

  it('fails clearly for an unknown source page, creating nothing', async () => {
    const { vault, effectivePageState, pageOperations, folderOperations } = setup([]);

    await expect(
      createTemplateFromPage({ pageOperations, folderOperations, effectivePageState }, 'missing', { name: 'T' })
    ).rejects.toThrow(/Page not found/);
    expect(vault.getReservedFolder('templates')).toBeUndefined();
  });
});
