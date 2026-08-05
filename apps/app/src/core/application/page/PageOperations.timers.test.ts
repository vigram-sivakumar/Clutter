import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import {
  AUTOSAVE_CEILING_MS,
  AUTOSAVE_DEBOUNCE_MS,
  SaveCoordinator,
} from '../../engine/SaveCoordinator';
import { DocumentState } from '../../engine/DocumentState';
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
      content: 'Original body',
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

  return {
    vault,
    inner,
    documentRegistry,
    saveCoordinator,
    coordinator,
    pageOperations,
  };
}

describe('PageOperations: autosave timers, end-to-end through commitEdit/requestSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commitEdit() arms a debounce timer that autosaves via requestSave() once it fires', async () => {
    const page = buildPage();
    const { inner, documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitEdit(page.id, 'Autosaved via debounce');
    expect(writeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(documentRegistry.get(page.id)!.state).toBe(DocumentState.Clean);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
    const persisted = await inner.readFile(page.path);
    expect(persisted).toContain('Autosaved via debounce');
  });

  it('a no-op commit (identical content) does not arm a timer', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitEdit(page.id, page.source.markdown);

    await vi.advanceTimersByTimeAsync(
      AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_CEILING_MS
    );

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('repeated typing resets the debounce timer, and only the final content is autosaved', async () => {
    const page = buildPage();
    const { inner, documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitEdit(page.id, 'A');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 200);
    pageOperations.commitEdit(page.id, 'AB');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 200);
    pageOperations.commitEdit(page.id, 'ABC');

    expect(writeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
    const persisted = await inner.readFile(page.path);
    expect(persisted).toContain('ABC');
  });

  it('close() cancels any armed timer — no autosave fires for a closed session', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitEdit(page.id, 'Never persisted');
    pageOperations.close(page.id);

    await vi.advanceTimersByTimeAsync(
      AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_CEILING_MS
    );

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('delete() cancels any armed timer — no autosave fires for a deleted page', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    pageOperations.commitEdit(page.id, 'Never persisted');
    await pageOperations.delete(page.id);
    writeSpy.mockClear(); // delete() itself writes nothing here (file already gone), but clear to isolate the assertion below

    await vi.advanceTimersByTimeAsync(
      AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_CEILING_MS
    );

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
