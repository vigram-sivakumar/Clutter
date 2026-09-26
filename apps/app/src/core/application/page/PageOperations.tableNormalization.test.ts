import { describe, expect, it } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
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
import type { Folder } from '../../vault/models/Folder';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import { normalizeAllTablesInMarkdown } from '../../../features/markdown/editor/codemirror/table/tableColumnNormalization';

/** Thin `writeFile` call-counter, wrapping `InMemoryVaultFileSystem` — the same purpose `GatedVaultFileSystem` serves in `PageOperations.requestSave.test.ts`, minus the hold/release machinery this file doesn't need. */
class CountingVaultFileSystem implements VaultFileSystem {
  public writeFileCallCount = 0;

  constructor(private readonly inner: VaultFileSystem) {}

  async writeFile(path: string, contents: string): Promise<void> {
    this.writeFileCallCount += 1;
    return this.inner.writeFile(path, contents);
  }

  exists(path: string) {
    return this.inner.exists(path);
  }
  createDirectory(path: string) {
    return this.inner.createDirectory(path);
  }
  readDirectory(path: string) {
    return this.inner.readDirectory(path);
  }
  readFile(path: string) {
    return this.inner.readFile(path);
  }
  deleteFile(path: string) {
    return this.inner.deleteFile(path);
  }
  moveFile(sourcePath: string, destinationPath: string) {
    return this.inner.moveFile(sourcePath, destinationPath);
  }
  copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string) {
    return this.inner.copyFile(sourceAbsolutePath, destinationAbsolutePath);
  }
}

/**
 * Integration coverage for the durable-save boundary's table normalization
 * (see this session's own investigation): `PageOperations.save()` applies
 * an injected `normalizeMarkdownForSave` hook to the string handed to the
 * Persistence Gate, never to `DocumentSession`'s own committed revision —
 * this file proves that boundary end-to-end, using the *real*
 * `normalizeAllTablesInMarkdown` (`tableColumnNormalization.ts`), not a
 * stand-in, so a regression in the wiring (wrong parameter, wrong
 * function, applied to the wrong string) would actually fail here. Per-
 * table normalization *rules* (long-cell-determines-width, alignment
 * markers, escaped pipes, ragged completion, idempotency) already have
 * their own exhaustive coverage in `tableColumnNormalization.test.ts` —
 * this file only proves the persistence-boundary wiring, not the algorithm
 * itself, per "don't create a second normalization algorithm."
 */

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

const defaultFolderMetadata = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
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

function buildPage(initialBody: string): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: initialBody,
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

function setup(page: Page, options: { normalizeMarkdownForSave?: (markdown: string) => string } = {}) {
  const vault = new Vault(
    ROOT,
    [page],
    [makeArchiveFolder()],
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
  const fileSystem = new CountingVaultFileSystem(inner);

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
    () => {},
    undefined,
    options.normalizeMarkdownForSave
  );

  return { vault, fileSystem, documentRegistry, saveCoordinator, coordinator, pageOperations };
}

const COMPACT_TABLE =
  '| Name | Role | City |\n| ---- | ---- | ---- |\n| Vik | UI | Come on man this is really long table cells |\n| Sam | UX | Pune |';

const NORMALIZED_TABLE =
  '| Name | Role | City                                        |\n' +
  '| ---- | ---- | ------------------------------------------- |\n' +
  '| Vik  | UI   | Come on man this is really long table cells |\n' +
  '| Sam  | UX   | Pune                                        |';

describe('PageOperations.save — table normalization at the durable-save boundary', () => {
  it('(A) editing a table and saving writes normalized Markdown to disk', async () => {
    const page = buildPage('Before');
    const { fileSystem, pageOperations } = setup(page, {
      normalizeMarkdownForSave: normalizeAllTablesInMarkdown,
    });

    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, COMPACT_TABLE);
    await pageOperations.requestSave(page.id);

    const written = await fileSystem.readFile(page.path);
    expect(written).toContain(NORMALIZED_TABLE);
    expect(written).not.toContain(COMPACT_TABLE);
  });

  it('(H) non-table Markdown is written unchanged', async () => {
    const page = buildPage('Before');
    const { fileSystem, pageOperations } = setup(page, {
      normalizeMarkdownForSave: normalizeAllTablesInMarkdown,
    });
    const prose = '# Heading\n\nSome *paragraph* text, no tables here at all.';

    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, prose);
    await pageOperations.requestSave(page.id);

    const written = await fileSystem.readFile(page.path);
    expect(written).toContain(prose);
  });

  it('normalization is applied to the durable write, never to the in-memory committed session', async () => {
    const page = buildPage('Before');
    const { documentRegistry, pageOperations } = setup(page, {
      normalizeMarkdownForSave: normalizeAllTablesInMarkdown,
    });

    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, COMPACT_TABLE);
    await pageOperations.requestSave(page.id);

    // The open editing session's own committed content — what CM6's
    // syncMarkdownIntoView/undo history/caret all reason about — must
    // stay exactly what the user typed, compact spacing included. Undo/
    // redo and caret behavior are properties of the live CM6 document,
    // which this proves the save path never rewrites.
    const session = documentRegistry.get(page.id)!;
    expect(session.currentRevision.markdown).toBe(COMPACT_TABLE);
  });

  it('(I) a second save with no new edits does not re-write the file (dirty-state tracking is unaffected by normalization)', async () => {
    const page = buildPage('Before');
    const { fileSystem, pageOperations } = setup(page, {
      normalizeMarkdownForSave: normalizeAllTablesInMarkdown,
    });

    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, COMPACT_TABLE);
    await pageOperations.requestSave(page.id);

    const writeCountAfterFirstSave = fileSystem.writeFileCallCount;
    await pageOperations.requestSave(page.id);

    expect(fileSystem.writeFileCallCount).toBe(writeCountAfterFirstSave);
  });

  it('without an injected normalizer, save() writes the raw Markdown verbatim (existing behavior for every caller that omits it)', async () => {
    const page = buildPage('Before');
    const { fileSystem, pageOperations } = setup(page); // no normalizeMarkdownForSave

    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, COMPACT_TABLE);
    await pageOperations.requestSave(page.id);

    const written = await fileSystem.readFile(page.path);
    expect(written).toContain(COMPACT_TABLE);
  });
});
