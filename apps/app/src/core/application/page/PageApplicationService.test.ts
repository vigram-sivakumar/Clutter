import { describe, expect, it } from 'vitest';
import { PageApplicationService } from './PageApplicationService';
import { PageMutationService } from './PageMutationService';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';
import { PersistenceService } from '../persistence/PersistenceService';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentState } from '../../engine/DocumentState';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { MoveService } from '../move/MoveService';
import { PageBuilder } from '../../vault/build/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

const defaultFolderMetadata = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeArchiveFolder(): Folder {
  return {
    id: ARCHIVE_FOLDER_ID,
    name: 'Archive',
    path: `${ROOT}/Archive`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function archivePathFor(page: Page): string {
  const filename = page.path.slice(page.path.lastIndexOf('/') + 1);
  return `${ROOT}/Archive/${filename}`;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

function makeVault(pages: Page[]): Vault {
  return new Vault(
    ROOT,
    pages,
    [makeArchiveFolder()],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function setup(page: Page) {
  const vault = makeVault([page]);
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
  const persistenceService = new PersistenceService(coordinator, saveCoordinator);
  const pageService = new PageApplicationService(
    workspace,
    vault,
    documentRegistry,
    saveCoordinator,
    persistenceService
  );
  const pageMutationService = new PageMutationService(coordinator, vault);

  return { vault, fileSystem, documentRegistry, pageService, pageMutationService };
}

describe('PageApplicationService: archived pages are view-only', () => {
  it('an archived page can still be opened', async () => {
    const page = buildPage();
    const { pageService, pageMutationService } = setup(page);

    await pageMutationService.archivePage(page.id);

    const session = pageService.openPage(page.id);
    expect(session).toBeDefined();
    expect(session.page.id).toBe(page.id);
  });

  it('updateMarkdown throws for an archived page and never touches the session', async () => {
    const page = buildPage();
    const { vault, pageService, pageMutationService } = setup(page);

    await pageMutationService.archivePage(page.id);
    const session = pageService.openPage(page.id);
    const revisionBefore = session.currentRevision;

    expect(() => pageService.updateMarkdown(page.id, 'Attempted edit')).toThrow(
      /Cannot edit archived page/
    );

    // No transaction was committed and no save lifecycle began.
    expect(session.currentRevision).toBe(revisionBefore);
    expect(session.state).not.toBe(DocumentState.Saving);
    // The archived content on disk/vault is untouched.
    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body');
  });

  it('updateMarkdown on an archived page never reaches persistence (disk is untouched)', async () => {
    const page = buildPage();
    const { fileSystem, pageService, pageMutationService } = setup(page);

    await pageMutationService.archivePage(page.id);
    pageService.openPage(page.id);

    const archivePath = archivePathFor(page);
    const diskBefore = await fileSystem.readFile(archivePath);

    expect(() => pageService.updateMarkdown(page.id, 'Attempted edit')).toThrow();

    const diskAfter = await fileSystem.readFile(archivePath);
    expect(diskAfter).toBe(diskBefore);
    expect(diskAfter).not.toContain('Attempted edit');
  });

  it('a page archived after its session was already open is still rejected on the next edit', async () => {
    const page = buildPage();
    const { pageService, pageMutationService } = setup(page);

    // Session opened while the page is still active.
    const session = pageService.openPage(page.id);
    expect(() => pageService.updateMarkdown(page.id, 'Edit while active')).not.toThrow();
    expect(session.currentRevision.markdown).toBe('Edit while active');

    // The page is archived out from under the still-open session.
    await pageMutationService.archivePage(page.id);

    // The existing session object is reused, but the next edit attempt is
    // still caught because the check re-reads current Vault status rather
    // than relying on anything cached on the session.
    expect(() => pageService.updateMarkdown(page.id, 'Edit after archiving')).toThrow(
      /Cannot edit archived page/
    );
  });

  it('once a page is restored to active status, edits are allowed again', async () => {
    const page = buildPage();
    const { vault, pageService, pageMutationService } = setup(page);

    await pageMutationService.archivePage(page.id);
    pageService.openPage(page.id);
    expect(() => pageService.updateMarkdown(page.id, 'Blocked')).toThrow();

    // No restore flow exists yet (future dependency — see PageMutationService
    // docstring, which lists "Restore pages" as a not-yet-implemented
    // responsibility). This directly restores the Vault's page status to
    // prove the editability check is a live status read, not a one-time
    // gate, so it will work correctly once a real restore flow lands.
    const archivedPage = vault.getPage(page.id)!;
    vault.replacePage({
      ...archivedPage,
      metadata: { ...archivedPage.metadata, status: 'active', archivedAt: null },
    });

    expect(() => pageService.updateMarkdown(page.id, 'Edit after restore')).not.toThrow();
    await flush();
    expect(vault.getPage(page.id)!.source.markdown).toBe('Edit after restore');
  });
});
