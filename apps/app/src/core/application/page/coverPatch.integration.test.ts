import { describe, expect, it, vi } from 'vitest';

import { Application } from '../Application';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { initialCoverLayoutPatch, newCoverPatch } from './coverPatch';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { DailyNotePath } from '../../vault/ingest/DailyNotePath';
import type { Page } from '../../vault/models/Page';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';
const emptyAnalysis = { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] };

function page(id: string, path: string, frontmatter: Record<string, unknown> = {}): Page {
  const directory = path.slice(0, path.lastIndexOf('/'));
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path,
      directoryPath: directory,
      frontmatter: { id, ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: emptyAnalysis,
    },
  } as never);
}

const TODAY = DailyNotePath.absoluteFrom(ROOT, new Date());

async function boot() {
  const pages = [
    page('plain', `${ROOT}/Plain.md`),
    page('daily', TODAY),
    // Saved Top, with a cover already.
    page('top', `${ROOT}/Top.md`, { cover: 'Assets/old.png', coverLayout: 'above' }),
    // A cover and no saved position (Right).
    page('covered', `${ROOT}/Covered.md`, { cover: 'Assets/old.png' }),
  ];
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  for (const seeded of pages) {
    fileSystem.seedFile(seeded.path, serializer.serializeDocument(seeded, seeded.source.markdown));
  }
  const vault = new Vault(ROOT, pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());

  /** What every "set this note's cover" call site does: the new cover, plus the default position for a note without one. */
  const addCover = (id: string, defaultLayout: 'side' | 'above') =>
    application.pageOperations.updateMetadata(id, {
      ...newCoverPatch('Assets/new.png'),
      ...initialCoverLayoutPatch(vault.getPage(id)?.metadata, defaultLayout),
    });
  const layout = (id: string) => vault.getPage(id)?.metadata.coverLayout;
  const file = (id: string) => fileSystem.readFile(vault.getPage(id)!.path);

  return { application, vault, addCover, layout, file };
}

describe('adding a cover with the default cover position', () => {
  it('Top: a regular note with no cover gets Top, saved as its own coverLayout', async () => {
    const { addCover, layout, file } = await boot();
    await addCover('plain', 'above');

    expect(layout('plain')).toBe('above');
    expect(await file('plain')).toContain('coverLayout: above');
  });

  it('Top: a Daily Note with no cover gets Top too', async () => {
    const { addCover, layout, vault } = await boot();
    expect(vault.getPage('daily')?.type).toBe('daily-note');

    await addCover('daily', 'above');

    expect(layout('daily')).toBe('above');
  });

  it('Right (the default): nothing is written, the note keeps the position it always had', async () => {
    const { addCover, layout, file } = await boot();
    await addCover('plain', 'side');
    await addCover('daily', 'side');

    expect(layout('plain')).toBe('side');
    expect(layout('daily')).toBe('side');
    expect(await file('plain')).not.toContain('coverLayout');
  });

  it("a note's saved Top is kept when its cover is replaced, whatever the default is", async () => {
    const { addCover, layout, file } = await boot();
    await addCover('top', 'side');

    expect(layout('top')).toBe('above');
    expect(await file('top')).toContain('coverLayout: above');
  });

  it('replacing the cover of a note that has one keeps its position, even when the default is Top', async () => {
    const { addCover, layout } = await boot();
    await addCover('covered', 'above');

    expect(layout('covered')).toBe('side');
  });

  it('changing the default never touches a note that already has its cover', async () => {
    const { application, vault, addCover, layout, file } = await boot();
    await addCover('plain', 'side');
    const before = await file('plain');

    // The app-wide default is read only when a cover is added; changing it rewrites nothing.
    await addCover('daily', 'above');

    expect(layout('plain')).toBe('side');
    expect(await file('plain')).toBe(before);
    expect(vault.getPage('top')?.metadata.coverLayout).toBe('above');
    expect(application.vault.getPage('covered')?.metadata.coverLayout).toBe('side');
  });

  it('removing a cover leaves the note position alone', async () => {
    const { application, addCover, layout } = await boot();
    await addCover('plain', 'above');

    await application.pageOperations.updateMetadata('plain', {
      cover: null,
      coverCredit: null,
      coverHidden: false,
      coverPositionAbove: 50,
      coverPositionSide: 50,
    });

    expect(layout('plain')).toBe('above');
  });
});
