import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { AUTOSAVE_DEBOUNCE_MS, SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
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

function buildPage(): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

function setup(page: Page) {
  const vault = new Vault(
    ROOT,
    [page],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const inner = new InMemoryVaultFileSystem();
  inner.seedFile(
    page.path,
    new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
  );

  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, inner);
  const coordinator = new PagePersistenceCoordinator(
    inner,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
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

  return { vault, inner, documentRegistry, workspace, saveCoordinator, pageOperations };
}

describe('PageOperations description channel (continuous commit + debounced autosave)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commitDescription() arms a debounce timer that autosaves via requestDescriptionSave() once it fires', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations } = setup(page);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitDescription(page.id, 'A description');
    expect(writeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(vault.getPage(page.id)!.metadata.description).toBe('A description');
  });

  it('uses the body channel\'s default cadence, not title\'s longer one — flushes at AUTOSAVE_DEBOUNCE_MS', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitDescription(page.id, 'A description');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(writeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('a no-op commit (identical description) does not arm a timer', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitDescription(page.id, page.metadata.description ?? '');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 30000);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('repeated typing resets the debounce timer, and only the final description is autosaved', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations } = setup(page);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitDescription(page.id, 'A');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 500);
    pageOperations.commitDescription(page.id, 'A des');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 500);
    pageOperations.commitDescription(page.id, 'A description');

    expect(writeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(vault.getPage(page.id)!.metadata.description).toBe('A description');
  });

  it('requestDescriptionSave() flushes immediately regardless of the debounce window (blur behavior)', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    pageOperations.commitDescription(page.id, 'A description');
    await pageOperations.requestDescriptionSave(page.id);

    expect(vault.getPage(page.id)!.metadata.description).toBe('A description');
  });

  it('requestDescriptionSave() is a silent no-op for a page with no description-editing activity', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(
      pageOperations.requestDescriptionSave(page.id)
    ).resolves.toBeUndefined();
  });

  it('clearing a description to empty persists null, not a literal empty string (omit-on-empty convention)', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    pageOperations.commitDescription(page.id, 'Something');
    await pageOperations.requestDescriptionSave(page.id);
    expect(vault.getPage(page.id)!.metadata.description).toBe('Something');

    pageOperations.commitDescription(page.id, '');
    await pageOperations.requestDescriptionSave(page.id);

    expect(vault.getPage(page.id)!.metadata.description).toBeNull();
  });

  it('close() cancels any armed description timer — no autosave fires for a closed page', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitDescription(page.id, 'Never persisted');
    pageOperations.close(page.id);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 30000);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('delete() cancels any armed description timer — no autosave fires for a deleted page', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);

    pageOperations.commitDescription(page.id, 'Never persisted');
    await pageOperations.delete(page.id, { allowActive: true });
    const writeSpy = vi.spyOn(inner, 'writeFile');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 30000);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('commitDescription() throws for a page id with no backing Vault page (drafts commit through updateMetadata directly)', () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    expect(() =>
      pageOperations.commitDescription('does-not-exist', 'Anything')
    ).toThrow(/Page not found/);
  });

  it('flushActivePage() flushes a dirty description channel for the active page (navigation-away boundary)', async () => {
    const page = buildPage();
    const { vault, workspace, pageOperations } = setup(page);
    workspace.openPage(page.id);

    pageOperations.commitDescription(page.id, 'A description');
    pageOperations.flushActivePage();
    await pageOperations.requestDescriptionSave(page.id);

    expect(vault.getPage(page.id)!.metadata.description).toBe('A description');
  });

  it('flushAll() flushes a dirty description channel alongside dirty bodies/titles (shutdown boundary)', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    pageOperations.commitDescription(page.id, 'A description');

    await pageOperations.flushAll(5000);

    expect(vault.getPage(page.id)!.metadata.description).toBe('A description');
  });
});

describe('PageOperations.cancelDescriptionEdit() (Escape support)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reverts a pending, not-yet-persisted description edit — no write occurs, even after the debounce window elapses', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations } = setup(page);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitDescription(page.id, 'Cancelled description');
    pageOperations.cancelDescriptionEdit(page.id);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 30000);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(vault.getPage(page.id)!.metadata.description).toBe(
      page.metadata.description
    );
  });

  it('is a silent no-op for a page with no description-editing activity', () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    expect(() => pageOperations.cancelDescriptionEdit(page.id)).not.toThrow();
  });

  it('a subsequent real edit after a cancel still works normally', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    pageOperations.commitDescription(page.id, 'Cancelled description');
    pageOperations.cancelDescriptionEdit(page.id);

    pageOperations.commitDescription(page.id, 'A description');
    await pageOperations.requestDescriptionSave(page.id);

    expect(vault.getPage(page.id)!.metadata.description).toBe('A description');
  });
});
