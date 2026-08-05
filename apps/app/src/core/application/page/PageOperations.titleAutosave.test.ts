import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PageOperations,
  TITLE_AUTOSAVE_CEILING_MS,
  TITLE_AUTOSAVE_DEBOUNCE_MS,
} from './PageOperations';
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

describe('PageOperations title channel (continuous commit + debounced autosave)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commitTitle() arms a debounce timer that autosaves via requestTitleSave() once it fires', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'Renamed');
    expect(moveSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS);

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Renamed.md`);
    expect(vault.getPage(page.id)!.name).toBe('Renamed');
  });

  it('uses its own, longer debounce than the body channel — a body-cadence elapse does not flush a still-debouncing title', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'Renamed');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(moveSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS - AUTOSAVE_DEBOUNCE_MS);
    expect(moveSpy).toHaveBeenCalledTimes(1);
  });

  it('a no-op commit (identical title) does not arm a timer', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, page.name);

    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS + TITLE_AUTOSAVE_CEILING_MS);

    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('repeated typing resets the debounce timer, and only the final title is autosaved', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'M');
    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS - 500);
    pageOperations.commitTitle(page.id, 'Me');
    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS - 500);
    pageOperations.commitTitle(page.id, 'Meeting');

    expect(moveSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS);

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(vault.getPage(page.id)!.name).toBe('Meeting');
  });

  it('requestTitleSave() flushes immediately regardless of the debounce window (blur behavior)', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'Renamed');
    await pageOperations.requestTitleSave(page.id);

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(vault.getPage(page.id)!.name).toBe('Renamed');
  });

  it('requestTitleSave() is a silent no-op for a page with no title-editing activity', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(pageOperations.requestTitleSave(page.id)).resolves.toBeUndefined();
  });

  it('close() cancels any armed title timer — no autosave fires for a closed page', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'Never persisted');
    pageOperations.close(page.id);

    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS + TITLE_AUTOSAVE_CEILING_MS);

    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('delete() cancels any armed title timer — no autosave fires for a deleted page', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'Never persisted');
    await pageOperations.delete(page.id);
    moveSpy.mockClear();

    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS + TITLE_AUTOSAVE_CEILING_MS);

    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('commitTitle() throws for a page id with no backing Vault page (drafts use updateDraftTitle instead)', () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    expect(() => pageOperations.commitTitle('does-not-exist', 'Anything')).toThrow(
      /Page not found/
    );
  });

  it('flushActivePage() flushes a dirty title channel for the active page (navigation-away boundary)', async () => {
    const page = buildPage();
    const { vault, inner, workspace, pageOperations } = setup(page);
    workspace.openPage(page.id);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'Renamed');
    pageOperations.flushActivePage();
    // flushActivePage() fires requestTitleSave() fire-and-forget internally
    // (mirroring flushActivePage()'s existing requestSave() call) — awaiting
    // the same call here joins that exact in-flight promise via
    // requestTitleSave()'s own dedup, rather than polling.
    await pageOperations.requestTitleSave(page.id);

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(vault.getPage(page.id)!.name).toBe('Renamed');
  });

  it('flushAll() flushes a dirty title channel alongside dirty bodies (shutdown boundary)', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'Renamed');

    await pageOperations.flushAll(5000);

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(vault.getPage(page.id)!.name).toBe('Renamed');
  });
});

describe('PageOperations.cancelTitleEdit() (Escape support)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reverts a pending, not-yet-persisted title edit — no rename occurs, even after the debounce window elapses', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations } = setup(page);
    const moveSpy = vi.spyOn(inner, 'moveFile');

    pageOperations.commitTitle(page.id, 'Cancelled Title');
    pageOperations.cancelTitleEdit(page.id);

    await vi.advanceTimersByTimeAsync(TITLE_AUTOSAVE_DEBOUNCE_MS + TITLE_AUTOSAVE_CEILING_MS);

    expect(moveSpy).not.toHaveBeenCalled();
    expect(vault.getPage(page.id)!.name).toBe(page.name);
  });

  it('is a silent no-op for a page with no title-editing activity', () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    expect(() => pageOperations.cancelTitleEdit(page.id)).not.toThrow();
  });

  it('a subsequent real edit after a cancel still works normally', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    pageOperations.commitTitle(page.id, 'Cancelled Title');
    pageOperations.cancelTitleEdit(page.id);

    pageOperations.commitTitle(page.id, 'Renamed');
    await pageOperations.requestTitleSave(page.id);

    expect(vault.getPage(page.id)!.name).toBe('Renamed');
  });
});
