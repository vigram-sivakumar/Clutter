import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
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

describe('PageOperations.commitEdit', () => {
  it('updates the open session’s current revision', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    pageOperations.commitEdit(page.id, 'Edited body');

    expect(documentRegistry.get(page.id)?.currentRevision.markdown).toBe(
      'Edited body'
    );
  });

  it('leaves DocumentState unchanged — does not transition to Saving', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    pageOperations.commitEdit(page.id, 'Edited body');

    expect(documentRegistry.get(page.id)?.state).toBe(DocumentState.Clean);
  });

  it('never enqueues a Persistence Gate operation — no Gate involvement', async () => {
    const page = buildPage();
    const { coordinator, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    pageOperations.commitEdit(page.id, 'Edited body');

    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('does not write to disk — the underlying file is untouched', async () => {
    const page = buildPage();
    const { fileSystem, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const before = await fileSystem.readFile(page.path);

    pageOperations.commitEdit(page.id, 'Edited body');

    const after = await fileSystem.readFile(page.path);
    expect(after).toBe(before);
  });

  it('marks the session dirty — currentRevision now differs from savedRevision', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    pageOperations.commitEdit(page.id, 'Edited body');

    expect(documentRegistry.get(page.id)?.isDirty).toBe(true);
  });

  it('is a silent no-op when no session is open for the page id', () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    expect(() =>
      pageOperations.commitEdit(page.id, 'Edited body')
    ).not.toThrow();
  });

  it('is a silent no-op for an id that was never opened at all', () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    expect(() =>
      pageOperations.commitEdit('unknown-id', 'content')
    ).not.toThrow();
  });
});

describe('PageOperations.commitEdit: DocumentSession invariants (audit)', () => {
  it('increments the revision number monotonically across repeated commits', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const initialNumber = documentRegistry.get(page.id)!.revisionNumber;

    pageOperations.commitEdit(page.id, 'Edit 1');
    pageOperations.commitEdit(page.id, 'Edit 2');
    pageOperations.commitEdit(page.id, 'Edit 3');

    expect(documentRegistry.get(page.id)!.revisionNumber).toBe(
      initialNumber + 3
    );
  });

  it('short-circuits identical-content commits — no new revision, no notification', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const session = documentRegistry.get(page.id)!;
    const revisionBefore = session.currentRevision;

    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    // Same content the session was seeded with (page.source.markdown) — a no-op transaction.
    pageOperations.commitEdit(page.id, page.source.markdown);

    expect(session.currentRevision).toBe(revisionBefore);
    expect(notifications).toBe(0);
  });

  it('never advances savedRevision — only markSaved() may do that', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const session = documentRegistry.get(page.id)!;
    const savedRevisionBefore = session.savedRevision;

    pageOperations.commitEdit(page.id, 'Edit 1');
    pageOperations.commitEdit(page.id, 'Edit 2');

    expect(session.savedRevision).toBe(savedRevisionBefore);
    expect(session.isDirty).toBe(true);
  });

  it('produces an immutable revision — readonly fields, distinct object per real edit', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const session = documentRegistry.get(page.id)!;
    const revisionBefore = session.currentRevision;

    pageOperations.commitEdit(page.id, 'Edit 1');

    const revisionAfter = session.currentRevision;
    expect(revisionAfter).not.toBe(revisionBefore);
    expect(revisionBefore.markdown).not.toBe(revisionAfter.markdown);
    // TypeScript enforces readonly at compile time; this is the runtime
    // corroboration that the prior revision object was never mutated in
    // place — its own fields are unchanged after the new commit.
    expect(revisionBefore.number).toBe(session.currentRevision.number - 1);
  });

  it('notifies subscribers exactly once per genuine (non-no-op) commit', async () => {
    const page = buildPage();
    const { documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const session = documentRegistry.get(page.id)!;
    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    pageOperations.commitEdit(page.id, 'Edit 1');
    pageOperations.commitEdit(page.id, 'Edit 2');

    expect(notifications).toBe(2);
  });
});

describe('PageOperations.hasUnsavedWork', () => {
  it('is false until a page has a change, true while it is unsaved, and false once it has been saved', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);
    await pageOperations.open(page.id);
    expect(pageOperations.hasUnsavedWork()).toBe(false);

    pageOperations.commitEdit(page.id, 'Edited body');
    expect(pageOperations.hasUnsavedWork()).toBe(true);

    await pageOperations.flushAll(1000);
    expect(pageOperations.hasUnsavedWork()).toBe(false);
  });

  it('an edit that arrives while a save is in flight is never reported as saved when it is not on disk', async () => {
    const page = buildPage();
    const { pageOperations, fileSystem } = setup(page);
    await pageOperations.open(page.id);
    const realWrite = fileSystem.writeFile.bind(fileSystem);
    let writes = 0;
    vi.spyOn(fileSystem, 'writeFile').mockImplementation(async (path, contents) => {
      writes++;
      if (writes === 1) {
        // The save already holds its content; this edit comes after it, while the write is under way.
        pageOperations.commitEdit(page.id, 'Second edit, mid-flush');
        await realWrite(path, contents);
        return;
      }
      // The engine's own follow-up save cannot land: the second edit stays unsaved.
      throw new Error('disk full');
    });

    pageOperations.commitEdit(page.id, 'First edit');
    await pageOperations.flushAll(2000);

    expect(await fileSystem.readFile(page.path)).toContain('First edit');
    expect(pageOperations.hasUnsavedWork()).toBe(true);
  });

  it('when the follow-up save does land, the edit made mid-flush is on disk and nothing is reported unsaved', async () => {
    const page = buildPage();
    const { pageOperations, fileSystem } = setup(page);
    await pageOperations.open(page.id);
    const realWrite = fileSystem.writeFile.bind(fileSystem);
    let editedMidFlush = false;
    vi.spyOn(fileSystem, 'writeFile').mockImplementation(async (path, contents) => {
      if (!editedMidFlush) {
        editedMidFlush = true;
        pageOperations.commitEdit(page.id, 'Second edit, mid-flush');
      }
      await realWrite(path, contents);
    });

    pageOperations.commitEdit(page.id, 'First edit');
    await pageOperations.flushAll(2000);

    // Whichever way the engine gets there, "not unsaved" must mean "on disk".
    expect(pageOperations.hasUnsavedWork()).toBe(false);
    expect(await fileSystem.readFile(page.path)).toContain('Second edit, mid-flush');
  });

  it('a flush whose save fails leaves the edit in the open session, still unsaved, and a later flush saves it', async () => {
    const page = buildPage();
    const { pageOperations, fileSystem, documentRegistry } = setup(page);
    await pageOperations.open(page.id);
    const realWrite = fileSystem.writeFile.bind(fileSystem);
    const failing = vi.spyOn(fileSystem, 'writeFile').mockRejectedValue(new Error('disk full'));

    pageOperations.commitEdit(page.id, 'Edit that cannot be saved yet');
    await pageOperations.flushAll(2000);

    expect(pageOperations.hasUnsavedWork()).toBe(true);
    expect(documentRegistry.get(page.id)?.currentRevision.markdown).toBe('Edit that cannot be saved yet');

    failing.mockImplementation(realWrite);
    await pageOperations.flushAll(2000);

    expect(pageOperations.hasUnsavedWork()).toBe(false);
    expect(await fileSystem.readFile(page.path)).toContain('Edit that cannot be saved yet');
  });
});

