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
import { formatTablesForTest } from '../../../features/markdown/editor/codemirror/table-engine/tableFormatTestFixtures';
import { markdownForTableSave } from '../../../features/markdown/editor/codemirror/table-engine/tableSavePolicy';

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

/** Integration coverage of the injected durable-save policy: a non-identity
 * fixture delegates to the real explicit Format table command. Production
 * uses the identity markdownForTableSave policy, covered below. */

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

const defaultFolderMetadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
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
      normalizeMarkdownForSave: formatTablesForTest,
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
      normalizeMarkdownForSave: formatTablesForTest,
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
      normalizeMarkdownForSave: formatTablesForTest,
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
      normalizeMarkdownForSave: formatTablesForTest,
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


describe('verified durable body mutations', () => {
  it('accepts the existing normalized disk representation without changing the editor content', async () => {
    const page = buildPage(COMPACT_TABLE);
    const { vault, documentRegistry, pageOperations } = setup(page, { normalizeMarkdownForSave: formatTablesForTest });
    await pageOperations.open(page.id);
    const task = '\n- [ ] Transferred task @2026-11-20';
    await expect(pageOperations.mutateBodyAndSave(page.id, (body) => body + task)).resolves.toBeUndefined();
    expect(vault.getPage(page.id)!.source.markdown).toContain(NORMALIZED_TABLE);
    expect(vault.getPage(page.id)!.source.markdown).toContain(task);
    expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(COMPACT_TABLE + task);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
  });

  it('keeps the existing closed-document mutation path unchanged', async () => {
    const page = buildPage(COMPACT_TABLE);
    const { vault, pageOperations } = setup(page, { normalizeMarkdownForSave: formatTablesForTest });
    await pageOperations.mutateBodyAndSave(page.id, (body) => body + '\n- [ ] Transferred task');
    expect(vault.getPage(page.id)!.source.markdown).toBe(COMPACT_TABLE + '\n- [ ] Transferred task');
  });
});


describe('production table engine exact-source save policy', () => {
  it('uses the real bootstrap policy and preserves table source through multiple durable saves', async () => {
      const page = buildPage('Before');
      const { fileSystem, vault, documentRegistry, pageOperations } = setup(page, {
        normalizeMarkdownForSave: markdownForTableSave,
      });
      await pageOperations.open(page.id);
      const sources = [
        '| Name | Age | Size |\n| ---- | --- | ---- |\n| Vi   | 21  | md   |\n| Sow     |     |      |',
        '| Name | Age | Size |\n| ---- | --- | ---- |\n| Vi   | 21  | md   |\n| Sow     | 28    | sm     |',
        COMPACT_TABLE,
      ];
      for (const source of sources) {
        pageOperations.commitEdit(page.id, source);
        await pageOperations.requestSave(page.id);
        expect(vault.getPage(page.id)!.source.markdown).toBe(source);
        expect(await fileSystem.readFile(page.path)).toContain(source);
        expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(source);
        expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
      }
  });

  it('preserves exact source regardless of padding or table shape', () => {
    for (const source of [COMPACT_TABLE, NORMALIZED_TABLE, 'Before\n\n' + COMPACT_TABLE + '\n\nAfter']) {
      expect(markdownForTableSave(source)).toBe(source);
    }
  });
});
