import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskOperations } from './TaskOperations';
import { PageOperations } from '../page/PageOperations';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { PagePathResolver } from '../page/PagePathResolver';
import { MoveService } from '../../vault/persistence/MoveService';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { TaskExtractor } from '../../vault/ingest/extractors/TaskExtractor';
import { TagExtractor } from '../../vault/ingest/extractors/TagExtractor';
import { LinkExtractor } from '../../vault/ingest/extractors/LinkExtractor';
import { EmbedExtractor } from '../../vault/ingest/extractors/EmbedExtractor';
import { BlockReferenceExtractor } from '../../vault/ingest/extractors/BlockReferenceExtractor';
import { HeadingExtractor } from '../../vault/ingest/extractors/HeadingExtractor';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import type { Page } from '../../vault/models/Page';
import type { TaskOccurrence } from '../../vault/models/occurrences';

const ROOT = '/vault';

function buildPage(id: string, body: string): Page {
  const builder = new PageBuilder();

  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${id}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: {
        headings: new HeadingExtractor().extract(body),
        blockReferences: new BlockReferenceExtractor().extract(body),
        tasks: new TaskExtractor().extract(body),
        tags: new TagExtractor().extract(body),
        links: new LinkExtractor().extract(body),
        embeds: new EmbedExtractor().extract(body),
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
    fileSystem,
    coordinator,
    documentRegistry,
    pageOperations,
    taskOperations: new TaskOperations(pageOperations),
  };
}

function firstTask(page: Page): TaskOccurrence {
  const task = page.analysis.tasks[0];
  if (!task) throw new Error('Fixture page has no task');
  return task;
}

/** Archives a page directly through the coordinator, bypassing PageOperations.archive(). */
async function archiveDirectly(coordinator: PagePersistenceCoordinator, pageId: string) {
  await coordinator.enqueue(pageId, { kind: 'archive' });
}

describe('TaskOperations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checking a task stamps @completed with today and flips the checkbox', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill @due:2026-08-05');
    const { vault, taskOperations } = setup(page);

    await taskOperations.toggleComplete(firstTask(page));

    const updated = vault.getPage('p1')!;
    expect(updated.source.markdown).toBe(
      '- [x] Collect the bill @due:2026-08-05 @completed:2026-08-04'
    );
    expect(updated.analysis.tasks[0]!.completed).toBe(true);
    expect(updated.analysis.tasks[0]!.completedAt).toBe('2026-08-04');
    expect(updated.analysis.tasks[0]!.dueDate).toBe('2026-08-05');
  });

  it('unchecking a task removes @completed and flips the checkbox', async () => {
    const page = buildPage(
      'p1',
      '- [x] Submit reimbursement @due:2026-08-05 @completed:2026-08-04'
    );
    const { vault, taskOperations } = setup(page);

    await taskOperations.toggleComplete(firstTask(page));

    const updated = vault.getPage('p1')!;
    expect(updated.source.markdown).toBe(
      '- [ ] Submit reimbursement @due:2026-08-05'
    );
  });

  it('setDueDate appends @due when none exists yet', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill');
    const { vault, taskOperations } = setup(page);

    await taskOperations.setDueDate(firstTask(page), '2026-08-05');

    expect(vault.getPage('p1')!.source.markdown).toBe(
      '- [ ] Collect the bill @due:2026-08-05'
    );
  });

  it('setDueDate updates an existing @due in place without duplicating it', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill @due:2026-08-05');
    const { vault, taskOperations } = setup(page);

    await taskOperations.setDueDate(firstTask(page), '2026-09-01');

    const markdown = vault.getPage('p1')!.source.markdown;
    expect(markdown).toBe('- [ ] Collect the bill @due:2026-09-01');
    expect(markdown.match(/@due:/g)).toHaveLength(1);
  });

  it('removeDueDate removes the @due token entirely', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill @due:2026-08-05');
    const { vault, taskOperations } = setup(page);

    await taskOperations.removeDueDate(firstTask(page));

    expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');
  });

  describe('setDate/clearDate — the v1 bare @date mention syntax', () => {
    it('appends a bare @date mention at the end when the task has no date yet', async () => {
      const page = buildPage('p1', '- [ ] Finish table work');
      const { vault, taskOperations } = setup(page);

      await taskOperations.setDate(firstTask(page), '2026-09-28');

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Finish table work @2026-09-28'
      );
    });

    it('replaces an existing bare @date mention in place rather than appending a second one', async () => {
      const page = buildPage('p1', '- [ ] Finish table work @2026-09-28');
      const { vault, taskOperations } = setup(page);

      await taskOperations.setDate(firstTask(page), '2026-09-30');

      const markdown = vault.getPage('p1')!.source.markdown;
      expect(markdown).toBe('- [ ] Finish table work @2026-09-30');
      expect(markdown.match(/@\d{4}-\d{2}-\d{2}/g)).toHaveLength(1);
    });

    it('clearDate removes the bare @date mention cleanly, with no leftover marker or whitespace', async () => {
      const page = buildPage('p1', '- [ ] Finish table work @2026-09-28');
      const { vault, taskOperations } = setup(page);

      await taskOperations.clearDate(firstTask(page));

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Finish table work');
    });

    it('clearDate on a task with no date is a no-op', async () => {
      const page = buildPage('p1', '- [ ] Finish table work');
      const { vault, taskOperations } = setup(page);

      await taskOperations.clearDate(firstTask(page));

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Finish table work');
    });

    it('preserves every other bare date in the text, replacing only the one that is the recognized due date', async () => {
      const page = buildPage(
        'p1',
        '- [ ] Moved from @2026-08-01 to @2026-09-28'
      );
      const { vault, taskOperations } = setup(page);

      await taskOperations.setDate(firstTask(page), '2026-10-01');

      // TaskExtractor's own rule: the FIRST bare date is the recognized
      // due date when no @due: is present — that's the one replaced.
      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Moved from @2026-10-01 to @2026-09-28'
      );
    });

    it('a legacy @due: token already on the line is updated in place, never left alongside a second bare mention', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill @due:2026-08-05');
      const { vault, taskOperations } = setup(page);

      await taskOperations.setDate(firstTask(page), '2026-09-01');

      const markdown = vault.getPage('p1')!.source.markdown;
      expect(markdown).toBe('- [ ] Collect the bill @due:2026-09-01');
      expect(markdown.match(/@due:/g)).toHaveLength(1);
    });

    it('clearDate removes a legacy @due: token entirely, mirroring removeDueDate', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill @due:2026-08-05');
      const { vault, taskOperations } = setup(page);

      await taskOperations.clearDate(firstTask(page));

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');
    });

    it('preserves unrecognized metadata and the rest of the task text exactly as written', async () => {
      const page = buildPage('p1', '- [ ] Buy milk @energy:high');
      const { vault, taskOperations } = setup(page);

      await taskOperations.setDate(firstTask(page), '2026-08-10');

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Buy milk @energy:high @2026-08-10'
      );
    });
  });

  it('preserves unrecognized metadata exactly as written across a mutation', async () => {
    const page = buildPage('p1', '- [ ] Buy milk @energy:high');
    const { vault, taskOperations } = setup(page);

    await taskOperations.setDueDate(firstTask(page), '2026-08-10');

    expect(vault.getPage('p1')!.source.markdown).toBe(
      '- [ ] Buy milk @energy:high @due:2026-08-10'
    );
  });

  it('updateMetadata patches an arbitrary recognized key without touching completed state', async () => {
    const page = buildPage('p1', '- [x] Submit reimbursement @completed:2026-08-01');
    const { vault, taskOperations } = setup(page);

    await taskOperations.updateMetadata(firstTask(page), { completed: '2026-08-02' });

    const updated = vault.getPage('p1')!;
    expect(updated.source.markdown).toBe(
      '- [x] Submit reimbursement @completed:2026-08-02'
    );
    expect(updated.analysis.tasks[0]!.completed).toBe(true);
  });

  it('throws for a page that does not exist', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill');
    const { taskOperations } = setup(page);
    const task = { ...firstTask(page), sourcePageId: 'missing' };

    await expect(taskOperations.setDueDate(task, '2026-08-05')).rejects.toThrow(
      /Page not found/
    );
  });

  it('throws when the task can no longer be located in its source page', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill');
    const { taskOperations } = setup(page);
    const staleTask = { ...firstTask(page), rawText: '- [ ] This line no longer exists' };

    await expect(taskOperations.setDueDate(staleTask, '2026-08-05')).rejects.toThrow(
      /Could not locate task/
    );
  });

  it('throws for a task on an archived page', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill');
    const { coordinator, taskOperations } = setup(page);
    await archiveDirectly(coordinator, page.id);

    await expect(taskOperations.toggleComplete(firstTask(page))).rejects.toThrow(
      /Cannot edit archived page/
    );
  });

  it('extracts and mutates a task the same way regardless of page type (Note vs Daily Note)', async () => {
    // type is now derived from path (inside the reserved Daily Notes
    // folder), not frontmatter — the path itself must be a real Daily
    // Notes path for this fixture to build as a Daily Note.
    const builder = new PageBuilder(ROOT);
    const body = '- [ ] Log today';
    const dailyNotePath = `${ROOT}/Daily Notes/2026/August/2026-08-04.md`;
    const dailyNotePage = builder.build({
      parentId: null,
      page: {
        path: dailyNotePath,
        directoryPath: `${ROOT}/Daily Notes/2026/August`,
        frontmatter: { id: 'daily-1' },
        frontmatterAnalysis: { aliases: [] },
        content: body,
        analysis: {
          headings: [],
          blockReferences: [],
          tasks: new TaskExtractor().extract(body),
          tags: [],
          links: [],
          embeds: [],
        },
      },
    });

    const { vault, taskOperations } = setup(dailyNotePage);

    expect(dailyNotePage.type).toBe('daily-note');
    expect(dailyNotePage.analysis.tasks[0]!.text).toBe('Log today');

    await taskOperations.toggleComplete(firstTask(dailyNotePage));

    expect(vault.getPage('daily-1')!.source.markdown).toBe(
      '- [x] Log today @completed:2026-08-04'
    );
  });

  it('mutates the first matching line when two tasks share identical rawText (documented limitation — no stable id yet)', async () => {
    const page = buildPage('p1', '- [ ] Buy milk\n- [ ] Buy milk');
    const { vault, taskOperations } = setup(page);

    await taskOperations.setDueDate(firstTask(page), '2026-08-05');

    expect(vault.getPage('p1')!.source.markdown).toBe(
      '- [ ] Buy milk @due:2026-08-05\n- [ ] Buy milk'
    );
  });

  it('runs the full lifecycle — due date, complete, uncomplete, remove due date — without drift', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill');
    const { vault, fileSystem, taskOperations } = setup(page);

    await taskOperations.setDueDate(firstTask(page), '2026-08-05');
    expect(vault.getPage('p1')!.source.markdown).toBe(
      '- [ ] Collect the bill @due:2026-08-05'
    );

    await taskOperations.toggleComplete(vault.getPage('p1')!.analysis.tasks[0]!);
    expect(vault.getPage('p1')!.source.markdown).toBe(
      '- [x] Collect the bill @due:2026-08-05 @completed:2026-08-04'
    );
    expect(vault.getPage('p1')!.analysis.tasks[0]!.completed).toBe(true);

    await taskOperations.toggleComplete(vault.getPage('p1')!.analysis.tasks[0]!);
    expect(vault.getPage('p1')!.source.markdown).toBe(
      '- [ ] Collect the bill @due:2026-08-05'
    );

    await taskOperations.removeDueDate(vault.getPage('p1')!.analysis.tasks[0]!);
    expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');

    // Persistence: what's actually on "disk" (the Gate's own writeFile
    // target) matches the final in-memory state — the same
    // write-parse-rebuild-replace pipeline a fresh VaultScanner.scan()
    // would re-run on restart, so a restart would re-derive this same
    // TaskOccurrence from this same persisted line.
    const persisted = await fileSystem.readFile(page.path);
    expect(persisted).toContain('- [ ] Collect the bill');
    expect(persisted).not.toContain('@due:');
    expect(persisted).not.toContain('@completed:');
  });

  it('throws the historical, task-specific message when the Gate abandons the write (no open session)', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill');
    const { coordinator, taskOperations } = setup(page);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue').mockResolvedValueOnce({
      status: 'abandoned',
      reason: 'Page no longer exists in the vault: p1',
    });

    await expect(taskOperations.setDueDate(firstTask(page), '2026-08-05')).rejects.toThrow(
      'Failed to update task "Collect the bill": Page no longer exists in the vault: p1'
    );

    enqueueSpy.mockRestore();
  });
});

describe('TaskOperations — routing through an open DocumentSession (ADR-031)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a task mutation against a clean open page updates the session, not the Vault, synchronously', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill');
    const { vault, documentRegistry, pageOperations, taskOperations } = setup(page);
    await pageOperations.open(page.id);

    await taskOperations.toggleComplete(firstTask(page));

    expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(
      '- [x] Collect the bill @completed:2026-08-04'
    );
    // Not yet durable — the mutation joined the session's own save
    // lifecycle instead of writing straight to the Gate.
    expect(vault.getPage(page.id)!.source.markdown).toBe('- [ ] Collect the bill');
  });

  it(
    'the regression case: prose edits + a task toggle on a dirty session both survive the next autosave ' +
      '(fails against the old TaskOperations, which wrote page.source.markdown directly and would have been reverted)',
    async () => {
      const page = buildPage('p1', '- [ ] Collect the bill\nSome existing prose.');
      const { vault, documentRegistry, pageOperations, taskOperations } = setup(page);
      await pageOperations.open(page.id);

      // 1. User edits prose elsewhere in the same document — session becomes dirty.
      pageOperations.commitEdit(
        page.id,
        '- [ ] Collect the bill\nSome existing prose, now extended by the user.'
      );
      expect(documentRegistry.get(page.id)!.isDirty).toBe(true);

      // 2. Task toggled from the sidebar while that edit is still unsaved.
      const task = { ...firstTask(page), sourcePageId: page.id };
      await taskOperations.toggleComplete(task);

      // 3. The session now contains BOTH changes.
      expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(
        '- [x] Collect the bill @completed:2026-08-04\nSome existing prose, now extended by the user.'
      );

      // 4. Autosave (a later requestSave, exactly as the debounce/blur path
      // would trigger) persists the session's current content.
      await pageOperations.requestSave(page.id);

      // 5. Vault/disk contain BOTH changes.
      expect(vault.getPage(page.id)!.source.markdown).toBe(
        '- [x] Collect the bill @completed:2026-08-04\nSome existing prose, now extended by the user.'
      );
    }
  );

  it('locates the task line against the session’s current content, not stale Vault content', async () => {
    // The task's rawText only exists after the user's own edit shifted it —
    // proves the lookup runs inside the transform against mutateBody()'s
    // supplied markdown, not a value captured before the session diverged.
    const page = buildPage('p1', '- [ ] Collect the bill');
    const { documentRegistry, pageOperations, taskOperations } = setup(page);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Preamble.\n- [ ] Collect the bill');

    await taskOperations.toggleComplete(firstTask(page));

    expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(
      'Preamble.\n- [x] Collect the bill @completed:2026-08-04'
    );
  });

  describe('create', () => {
    it('inserts the new task before an existing task line, not after it', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, taskOperations } = setup(page);

      await taskOperations.create(page.id, 'Buy milk');

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Buy milk\n- [ ] Collect the bill'
      );
    });

    it('inserts before the first task and leaves everything else (including content after it) untouched', async () => {
      const page = buildPage(
        'p1',
        '- [ ] Existing task\n\nToday\'s notes...\n\n## Heading'
      );
      const { vault, taskOperations } = setup(page);

      await taskOperations.create(page.id, 'Newly created task');

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Newly created task\n- [ ] Existing task\n\nToday\'s notes...\n\n## Heading'
      );
    });

    it('inserts before the first task even when prose precedes it', async () => {
      const page = buildPage('p1', 'Some intro text\n- [ ] Existing task\n\nMore notes');
      const { vault, taskOperations } = setup(page);

      await taskOperations.create(page.id, 'Newest task');

      expect(vault.getPage('p1')!.source.markdown).toBe(
        'Some intro text\n- [ ] Newest task\n- [ ] Existing task\n\nMore notes'
      );
    });

    it('becomes the document\'s own first line when no task exists yet, preserving the rest', async () => {
      const page = buildPage('p1', 'Today\'s notes...\n\n## Heading');
      const { vault, taskOperations } = setup(page);

      await taskOperations.create(page.id, 'Buy milk');

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Buy milk\nToday\'s notes...\n\n## Heading'
      );
    });

    it('does not add a leading blank line when the page body is empty', async () => {
      const page = buildPage('p1', '');
      const { vault, taskOperations } = setup(page);

      await taskOperations.create(page.id, 'Buy milk');

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Buy milk');
    });

    it('trims the title and never writes an inline @date', async () => {
      const page = buildPage('p1', '');
      const { vault, taskOperations } = setup(page);

      await taskOperations.create(page.id, '  Buy milk  ');

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Buy milk');
    });

    it('rejects an empty or whitespace-only title without touching the page', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, taskOperations } = setup(page);

      await expect(taskOperations.create(page.id, '   ')).rejects.toThrow(
        'Task title must not be empty.'
      );
      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');
    });

    it('commits into an open session rather than bypassing it', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, documentRegistry, pageOperations, taskOperations } = setup(page);
      await pageOperations.open(page.id);

      await taskOperations.create(page.id, 'Buy milk');

      expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(
        '- [ ] Buy milk\n- [ ] Collect the bill'
      );
      // Not yet durable — mirrors every other mutate()-based method here:
      // this method only commits, the caller (Sidebar.Tasks.tsx's
      // onCreateTask) is responsible for requestSave() when immediate
      // durability matters.
      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');

      await pageOperations.requestSave(page.id);

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Buy milk\n- [ ] Collect the bill'
      );
    });
  });
});
