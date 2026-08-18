import { describe, expect, it, vi } from 'vitest';
import { MutateBodyAbandonedError, PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
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
  const fileSystem = new InMemoryVaultFileSystem();
  fileSystem.seedFile(
    page.path,
    new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
  );

  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
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

  return { vault, fileSystem, documentRegistry, coordinator, pageOperations };
}

/** Archives a page directly through the coordinator, bypassing PageOperations.archive(). */
async function archiveDirectly(coordinator: PagePersistenceCoordinator, pageId: string) {
  await coordinator.enqueue(pageId, { kind: 'archive' });
}

describe('PageOperations.mutateBody — no open session', () => {
  it('applies the transform to the Vault’s durable content and persists via the existing Gate save path', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.mutateBody(page.id, (markdown) => `${markdown} — mutated`);

    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body — mutated');
  });

  it('writes the mutation to disk — reaches Durable, not just Vault', async () => {
    const page = buildPage();
    const { fileSystem, pageOperations } = setup(page);

    await pageOperations.mutateBody(page.id, () => 'Rewritten body');

    const persisted = await fileSystem.readFile(page.path);
    expect(persisted).toContain('Rewritten body');
  });

  it('never opens or touches a DocumentSession for this branch', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);

    await pageOperations.mutateBody(page.id, (markdown) => `${markdown}!`);

    expect(documentRegistry.isOpen(page.id)).toBe(false);
  });
});

describe('PageOperations.mutateBody — clean open session', () => {
  it('updates the session’s current revision instead of writing through the Gate', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    await pageOperations.mutateBody(page.id, (markdown) => `${markdown} — mutated`);

    expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(
      'Original body — mutated'
    );
  });

  it('does not enqueue a Gate operation in the session branch', async () => {
    const page = buildPage();
    const { coordinator, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await pageOperations.mutateBody(page.id, (markdown) => `${markdown} — mutated`);

    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('leaves the durable Vault/disk content untouched until a save actually runs', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    await pageOperations.mutateBody(page.id, (markdown) => `${markdown} — mutated`);

    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body');
  });

  it('marks the session dirty and schedules the existing autosave (via commitEdit), which persists on the next requestSave', async () => {
    const page = buildPage();
    const { vault, documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    await pageOperations.mutateBody(page.id, (markdown) => `${markdown} — mutated`);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(true);

    await pageOperations.requestSave(page.id);

    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body — mutated');
    expect(documentRegistry.get(page.id)!.state).toBe(DocumentState.Clean);
  });
});

describe('PageOperations.mutateBody — dirty open session', () => {
  it('operates on the session’s current (already-dirty) content, not stale Vault content, and preserves the prior edit', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    // Simulate an in-progress, uncommitted-to-disk user edit.
    pageOperations.commitEdit(page.id, 'Original body with user prose added');
    expect(documentRegistry.get(page.id)!.isDirty).toBe(true);

    await pageOperations.mutateBody(page.id, (markdown) => `${markdown} [DONE]`);

    expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(
      'Original body with user prose added [DONE]'
    );
  });

  it('a subsequent save persists both the prior dirty edit and the mutation together', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    pageOperations.commitEdit(page.id, 'Original body with user prose added');
    await pageOperations.mutateBody(page.id, (markdown) => `${markdown} [DONE]`);
    await pageOperations.requestSave(page.id);

    expect(vault.getPage(page.id)!.source.markdown).toBe(
      'Original body with user prose added [DONE]'
    );
  });
});

describe('PageOperations.mutateBody — preconditions', () => {
  it('throws "Page not found" for an id with no Vault page and no open session', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(
      pageOperations.mutateBody('missing-page', (markdown) => markdown)
    ).rejects.toThrow(/Page not found: missing-page/);
  });

  it('throws for an archived page even when no session is open', async () => {
    const page = buildPage();
    const { coordinator, pageOperations } = setup(page);
    await archiveDirectly(coordinator, page.id);

    await expect(
      pageOperations.mutateBody(page.id, (markdown) => markdown)
    ).rejects.toThrow(/Cannot edit archived page/);
  });

  it('throws for an archived page even when a session is open', async () => {
    const page = buildPage();
    const { coordinator, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    await archiveDirectly(coordinator, page.id);

    await expect(
      pageOperations.mutateBody(page.id, (markdown) => markdown)
    ).rejects.toThrow(/Cannot edit archived page/);
  });

  it('the archived-page check runs before the transform — transform is never invoked', async () => {
    const page = buildPage();
    const { coordinator, pageOperations } = setup(page);
    await archiveDirectly(coordinator, page.id);
    const transform = vi.fn((markdown: string) => markdown);

    await expect(pageOperations.mutateBody(page.id, transform)).rejects.toThrow();

    expect(transform).not.toHaveBeenCalled();
  });

  it('throws MutateBodyAbandonedError (no-session branch) when the Gate abandons the write', async () => {
    const page = buildPage();
    const { vault, coordinator, pageOperations } = setup(page);
    // Force the coordinator's own dequeue-time guard to abandon by removing
    // the page from the Vault after this call is already in flight.
    const enqueueSpy = vi
      .spyOn(coordinator, 'enqueue')
      .mockResolvedValueOnce({ status: 'abandoned', reason: 'Page no longer exists in the vault: page-1' });

    await expect(
      pageOperations.mutateBody(page.id, (markdown) => markdown)
    ).rejects.toBeInstanceOf(MutateBodyAbandonedError);

    enqueueSpy.mockRestore();
    expect(vault.getPage(page.id)).toBeDefined();
  });
});
