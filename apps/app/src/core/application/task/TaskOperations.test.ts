import { TaskTransferRecoveryStore } from '../../vault/persistence/TaskTransferRecoveryStore';
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

function setup(page: Page, reopened?: { vault: Vault; fileSystem: InMemoryVaultFileSystem }, normalizeMarkdownForSave?: (markdown: string) => string) {
  const vault = reopened?.vault ?? new Vault(
    ROOT,
    [page],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const fileSystem = reopened?.fileSystem ?? new InMemoryVaultFileSystem();

  if (!reopened) fileSystem.seedFile(
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
    () => {},
    undefined,
    normalizeMarkdownForSave
  );

  const transferRecovery = new TaskTransferRecoveryStore(fileSystem, ROOT);
  return {
    vault,
    fileSystem,
    coordinator,
    documentRegistry,
    pageOperations,
    transferRecovery,
    taskOperations: new TaskOperations(pageOperations, transferRecovery, normalizeMarkdownForSave),
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

  describe("a Daily Note task's due date is independent of its note (ADR-044)", () => {
    function dailyNoteWith(body: string) {
      return new PageBuilder(ROOT).build({
        parentId: null,
        page: {
          path: `${ROOT}/Daily Notes/2026/October/2026-10-06.md`,
          directoryPath: `${ROOT}/Daily Notes/2026/October`,
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
    }

    it('a task with no date has no due date, despite living in a dated Daily Note', () => {
      const page = dailyNoteWith('- [ ] Buy groceries');
      const { vault } = setup(page);

      expect([...vault.tasks()][0]?.dueDate).toBeUndefined();
    });

    it('changing the due date rewrites only the date, in the same note — it never moves the task', async () => {
      const page = dailyNoteWith('- [ ] Submit report @2026-10-06');
      const { vault, taskOperations } = setup(page);

      await taskOperations.setDate(firstTask(page), '2026-10-10');

      expect(vault.getPage('daily-1')!.source.markdown).toBe('- [ ] Submit report @2026-10-10');
      expect([...vault.tasks()][0]).toMatchObject({ sourcePageId: 'daily-1', dueDate: '2026-10-10' });
    });

    it('Edit task > Save: a changed due date is rewritten in place — same note, same single task, other tokens kept', async () => {
      const page = dailyNoteWith('- [x] Submit report @2026-10-06 @completed:2026-10-06\n- [ ] Other');
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), { title: 'Submit the report', dueDate: '2026-10-12' });

      expect(vault.getPage('daily-1')!.source.markdown).toBe(
        '- [x] Submit the report @completed:2026-10-06 @2026-10-12\n- [ ] Other'
      );
      const tasks = [...vault.tasks()];
      expect(tasks).toHaveLength(2); // the existing task was updated, no new one created
      expect(tasks[0]).toMatchObject({ sourcePageId: 'daily-1', dueDate: '2026-10-12', completed: true });
    });

    it('Edit task > Save: a title-only edit leaves the date and the note alone', async () => {
      const page = dailyNoteWith('- [ ] Submit report @2026-10-06');
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), { title: 'Submit the report', dueDate: '2026-10-06' });

      expect(vault.getPage('daily-1')!.source.markdown).toBe('- [ ] Submit the report @2026-10-06');
      expect([...vault.tasks()][0]).toMatchObject({ sourcePageId: 'daily-1', dueDate: '2026-10-06' });
    });

    it('clearing the due date makes it absent (no persisted "none" value), still in the same note', async () => {
      const page = dailyNoteWith('- [ ] Submit report @2026-10-08');
      const { vault, taskOperations } = setup(page);

      await taskOperations.clearDate(firstTask(page));

      expect(vault.getPage('daily-1')!.source.markdown).toBe('- [ ] Submit report');
      const [task] = [...vault.tasks()];
      expect(task?.dueDate).toBeUndefined();
      expect(task?.sourcePageId).toBe('daily-1');
    });
  });

  it('Edit task > Save: a task in a normal note stays in that note when its due date changes', async () => {
    const page = buildPage('p1', '- [ ] Collect the bill @2026-08-05\n- [ ] Other');
    const { vault, taskOperations } = setup(page);

    await taskOperations.update(firstTask(page), { title: 'Collect the bill', dueDate: '2026-10-06' });

    expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill @2026-10-06\n- [ ] Other');
    expect([...vault.tasks()].map((task) => task.sourcePageId)).toEqual(['p1', 'p1']);
    expect([...vault.pages()]).toHaveLength(1); // no Daily Note was created or opened for it
  });

  describe('targets the exact occurrence among textually-identical task lines', () => {
    const DUPLICATES = '- [ ] Dup test\n- [ ] Dup test';

    function taskAt(page: Page, index: number): TaskOccurrence {
      const task = page.analysis.tasks[index];
      if (!task) throw new Error(`Fixture page has no task at ${index}`);
      return task;
    }

    it('extracts the two identical lines as occurrences with distinct offsets', () => {
      const page = buildPage('p1', DUPLICATES);

      expect(taskAt(page, 0).rawText).toBe(taskAt(page, 1).rawText);
      expect(taskAt(page, 0).startOffset).toBe(0);
      expect(taskAt(page, 1).startOffset).toBe(15);
    });

    it('completing the first only changes the first', async () => {
      const page = buildPage('p1', DUPLICATES);
      const { vault, taskOperations } = setup(page);

      await taskOperations.toggleComplete(taskAt(page, 0));

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [x] Dup test @completed:2026-08-04\n- [ ] Dup test'
      );
    });

    it('completing the second only changes the second', async () => {
      const page = buildPage('p1', DUPLICATES);
      const { vault, taskOperations } = setup(page);

      await taskOperations.toggleComplete(taskAt(page, 1));

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Dup test\n- [x] Dup test @completed:2026-08-04'
      );
    });

    it('changing the due date of the second only changes the second', async () => {
      const page = buildPage('p1', DUPLICATES);
      const { vault, taskOperations } = setup(page);

      await taskOperations.setDate(taskAt(page, 1), '2026-08-05');

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Dup test\n- [ ] Dup test @2026-08-05'
      );
    });

    it('editing the second (update) only changes the second', async () => {
      const page = buildPage('p1', DUPLICATES);
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(taskAt(page, 1), { title: 'Renamed', dueDate: undefined });

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Dup test\n- [ ] Renamed');
    });

    it('deleting the second only deletes the second', async () => {
      // Separated by a line so which one was removed is observable.
      const page = buildPage('p1', '- [ ] Dup test\nMiddle\n- [ ] Dup test');
      const { vault, taskOperations } = setup(page);

      await taskOperations.delete(taskAt(page, 1));

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Dup test\nMiddle');
    });

    it('duplicating the second inserts the copy below the second, not the first', async () => {
      const page = buildPage('p1', '- [ ] Dup test\nMiddle\n- [ ] Dup test');
      const { vault, taskOperations } = setup(page);

      await taskOperations.duplicate(taskAt(page, 1));

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Dup test\nMiddle\n- [ ] Dup test\n- [ ] Dup test'
      );
    });

    it('a fresh duplicate stays individually targetable — later actions hit only the occurrence chosen', async () => {
      const page = buildPage('p1', '- [ ] Dup test');
      const { vault, taskOperations } = setup(page);

      await taskOperations.duplicate(firstTask(page));

      const [original, copy] = vault.getPage('p1')!.analysis.tasks;
      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Dup test\n- [ ] Dup test');
      expect(original!.startOffset).not.toBe(copy!.startOffset);

      await taskOperations.toggleComplete(copy!);
      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Dup test\n- [x] Dup test @completed:2026-08-04'
      );

      await taskOperations.setDate(vault.getPage('p1')!.analysis.tasks[0]!, '2026-08-05');
      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Dup test @2026-08-05\n- [x] Dup test @completed:2026-08-04'
      );
    });

    it('identical task text elsewhere in the same note does not attract the mutation', async () => {
      const page = buildPage(
        'p1',
        '# Today\n- [ ] Buy milk\n\n## Later\nSome prose.\n- [ ] Buy milk @energy:low\n- [ ] Buy milk'
      );
      const { vault, taskOperations } = setup(page);

      await taskOperations.toggleComplete(taskAt(page, 2));

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '# Today\n- [ ] Buy milk\n\n## Later\nSome prose.\n- [ ] Buy milk @energy:low\n- [x] Buy milk @completed:2026-08-04'
      );
    });

    it('refuses, without mutating, when stale offsets leave several identical lines to choose from', async () => {
      const page = buildPage('p1', DUPLICATES);
      const { vault, taskOperations } = setup(page);
      const stale = { ...taskAt(page, 1), startOffset: 3, endOffset: 17 };

      await expect(taskOperations.toggleComplete(stale)).rejects.toThrow(/unambiguously/);
      expect(vault.getPage('p1')!.source.markdown).toBe(DUPLICATES);
    });

    it('refuses offsets that fall outside the note entirely when identical lines exist', async () => {
      const page = buildPage('p1', DUPLICATES);
      const { vault, taskOperations } = setup(page);
      const stale = { ...taskAt(page, 1), startOffset: 100, endOffset: 114 };

      await expect(taskOperations.delete(stale)).rejects.toThrow(/unambiguously/);
      expect(vault.getPage('p1')!.source.markdown).toBe(DUPLICATES);
    });

    it('refuses a task with no recorded offsets rather than matching by text', async () => {
      const page = buildPage('p1', DUPLICATES);
      const { vault, taskOperations } = setup(page);
      const unpositioned = { ...taskAt(page, 1), startOffset: undefined, endOffset: undefined };

      await expect(taskOperations.toggleComplete(unpositioned)).rejects.toThrow(
        /no recorded source position/
      );
      expect(vault.getPage('p1')!.source.markdown).toBe(DUPLICATES);
    });
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

  it('refuses, leaving the session untouched, when unsaved edits shift identical task lines', async () => {
    // Offsets come from the durable body; the unsaved preamble shifts both
    // identical lines, so neither offset lands on its task any more and
    // picking either line would be a guess.
    const page = buildPage('p1', '- [ ] Dup test\n- [ ] Dup test');
    const { documentRegistry, pageOperations, taskOperations } = setup(page);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Preamble.\n- [ ] Dup test\n- [ ] Dup test');

    await expect(
      taskOperations.toggleComplete(page.analysis.tasks[1]!)
    ).rejects.toThrow(/unambiguously/);
    expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(
      'Preamble.\n- [ ] Dup test\n- [ ] Dup test'
    );
  });

  it('targets the exact occurrence through an open session when its offsets are current', async () => {
    const page = buildPage('p1', '- [ ] Dup test\n- [ ] Dup test');
    const { documentRegistry, pageOperations, taskOperations } = setup(page);
    await pageOperations.open(page.id);

    await taskOperations.toggleComplete(page.analysis.tasks[1]!);

    expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe(
      '- [ ] Dup test\n- [x] Dup test @completed:2026-08-04'
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

    it('writes an explicit due date as a bare @date mention when one is given', async () => {
      const page = buildPage('p1', '');
      const { vault, taskOperations } = setup(page);

      await taskOperations.create('p1', 'Submit report', '2026-10-08');

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Submit report @2026-10-08');
      expect([...vault.tasks()][0]?.dueDate).toBe('2026-10-08');
    });

    it('creates a task with no due date when none is given', async () => {
      const page = buildPage('p1', '');
      const { vault, taskOperations } = setup(page);

      await taskOperations.create('p1', 'Buy groceries');

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Buy groceries');
      expect([...vault.tasks()][0]?.dueDate).toBeUndefined();
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

  describe('delete', () => {
    it('removes the task line from its page, leaving the rest untouched', async () => {
      const page = buildPage('p1', 'Intro\n- [ ] Collect the bill\nOutro');
      const { vault, taskOperations } = setup(page);

      await taskOperations.delete(firstTask(page));

      expect(vault.getPage('p1')!.source.markdown).toBe('Intro\nOutro');
    });

    it('rejects when the task line can no longer be located', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, taskOperations } = setup(page);
      const stale = { ...firstTask(page), rawText: '- [ ] Some other line' };

      await expect(taskOperations.delete(stale)).rejects.toThrow(
        'Could not locate task'
      );
      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');
    });
  });

  describe('duplicate', () => {
    it('inserts an exact copy of the task line directly below the original', async () => {
      const page = buildPage(
        'p1',
        'Intro\n- [x] Collect the bill @2026-08-05\n- [ ] Buy milk\nOutro'
      );
      const { vault, taskOperations } = setup(page);

      await taskOperations.duplicate(firstTask(page));

      expect(vault.getPage('p1')!.source.markdown).toBe(
        'Intro\n- [x] Collect the bill @2026-08-05\n- [x] Collect the bill @2026-08-05\n- [ ] Buy milk\nOutro'
      );
    });

    it('rejects when the task line can no longer be located', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, taskOperations } = setup(page);
      const stale = { ...firstTask(page), rawText: '- [ ] Some other line' };

      await expect(taskOperations.duplicate(stale)).rejects.toThrow(
        'Could not locate task'
      );
      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');
    });
  });

  describe('update', () => {
    it('replaces the title, leaving an unset due date unset', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), {
        title: 'Collect the parcel',
        dueDate: undefined,
      });

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the parcel');
    });

    it('replaces the title while preserving an untouched bare due date', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill @2026-08-05');
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), {
        title: 'Collect the parcel',
        dueDate: '2026-08-05',
      });

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Collect the parcel @2026-08-05'
      );
    });

    it('replaces the title while preserving an untouched legacy @due: token verbatim', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill @due:2026-08-05');
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), {
        title: 'Collect the parcel',
        dueDate: '2026-08-05',
      });

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Collect the parcel @due:2026-08-05'
      );
    });

    it('updates the due date in place when it changes, legacy @due: included', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill @due:2026-08-05');
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), {
        title: 'Collect the bill',
        dueDate: '2026-09-01',
      });

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Collect the bill @due:2026-09-01'
      );
    });

    it('clears the due date when explicitly set to undefined', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill @2026-08-05');
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), {
        title: 'Collect the bill',
        dueDate: undefined,
      });

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');
    });

    it('never adds an inline date when the due date is left unchanged by a title edit', async () => {
      // The line carries no inline date; update() must not stamp one just
      // because the caller passes the task's current dueDate back unchanged.
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, taskOperations } = setup(page);
      const task = { ...firstTask(page), dueDate: '2026-08-04' };

      await taskOperations.update(task, {
        title: 'Collect the parcel',
        dueDate: '2026-08-04',
      });

      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the parcel');
    });

    it('preserves @completed verbatim across a title-only edit', async () => {
      const page = buildPage(
        'p1',
        '- [x] Collect the bill @completed:2026-08-04'
      );
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), {
        title: 'Collect the parcel',
        dueDate: undefined,
      });

      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [x] Collect the parcel @completed:2026-08-04'
      );
    });

    it('never moves the task — always mutates its own sourcePageId, regardless of the due date chosen', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, taskOperations } = setup(page);

      await taskOperations.update(firstTask(page), {
        title: 'Collect the bill',
        dueDate: '2026-12-25',
      });

      // Still on p1 — update() never calls PageOperations.openAtPath/open
      // for a different page, so there is nowhere else this could land.
      expect(vault.getPage('p1')!.source.markdown).toContain('Collect the bill');
    });

    it('rejects an empty or whitespace-only title without touching the page', async () => {
      const page = buildPage('p1', '- [ ] Collect the bill');
      const { vault, taskOperations } = setup(page);

      await expect(
        taskOperations.update(firstTask(page), { title: '   ', dueDate: undefined })
      ).rejects.toThrow('Task title must not be empty.');
      expect(vault.getPage('p1')!.source.markdown).toBe('- [ ] Collect the bill');
    });
  });
});

// Uses the real broker, Gate, parser and Vault; no parallel Inbox task implementation.
describe('Task Inbox transfers', () => {
  const inbox = (body: string): Page => ({
    ...buildPage('inbox-source', body),
    path: `${ROOT}/.clutter/inbox.md`,
  });

  it('moves dated completed and incomplete tasks verbatim, leaving undated/invalid tasks and prose', async () => {
    const body =
      '# Captured\n<!-- Keep this -->\n- [ ] Same @2026-11-20\n- [ ] Same @2026-11-20\n- [x] Finished @2026-11-21 @completed:2026-11-14\n- [ ] Timed @2026-11-22T14:30 @energy:high\n- [ ] Undated\n- [ ] Invalid @2026-13-45';
    const env = setup(inbox(body));
    await env.taskOperations.tidyInbox(ROOT, 'inbox-source');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe(
      '# Captured\n<!-- Keep this -->\n- [ ] Undated\n- [ ] Invalid @2026-13-45'
    );
    const tasks = [...env.vault.tasks()];
    expect(
      tasks.filter((task) => task.rawText === '- [ ] Same @2026-11-20')
    ).toHaveLength(2);
    expect(
      tasks.some(
        (task) =>
          task.rawText === '- [x] Finished @2026-11-21 @completed:2026-11-14' &&
          task.completed
      )
    ).toBe(true);
    expect(
      tasks.some(
        (task) => task.dueDate === '2026-11-22' && task.dueTime === '14:30'
      )
    ).toBe(true);
    const count = tasks.length;
    await env.taskOperations.tidyInbox(ROOT, 'inbox-source');
    expect([...env.vault.tasks()]).toHaveLength(count);
  });

  it('moves completed tasks without due dates by completion date only', async () => {
    const body = [
      '- [x] Finished yesterday @completed:2026-11-19',
      '- [ ] Still open',
      '- [x] Missing completion date',
      '- [x] Invalid due date @2026-13-45 @completed:2026-11-18',
    ].join('\n');
    const env = setup(inbox(body));
    await env.taskOperations.tidyInbox(ROOT, 'inbox-source');

    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe(
      [
        '- [ ] Still open',
        '- [x] Missing completion date',
        '- [x] Invalid due date @2026-13-45 @completed:2026-11-18',
      ].join('\n')
    );

    const { DailyNotePath } = await import('../../vault/ingest/DailyNotePath');
    const yesterday = await env.pageOperations.ensureAtPath(
      DailyNotePath.absoluteFrom(ROOT, new Date(2026, 10, 19)),
      { type: 'daily-note' }
    );
    expect(env.vault.getPage(yesterday)!.source.markdown).toBe(
      '- [x] Finished yesterday @completed:2026-11-19'
    );
  });

  it('resumes a failed source removal using private recovery metadata, including identical tasks', async () => {
    const env = setup(inbox('- [ ] Same @2026-11-20\n- [ ] Same @2026-11-20'));
    const persist = env.pageOperations.mutateBodyAndSave.bind(
      env.pageOperations
    );
    let sourceWrites = 0;
    const failure = vi
      .spyOn(env.pageOperations, 'mutateBodyAndSave')
      .mockImplementation(async (id, transform) => {
        if (id === 'inbox-source' && ++sourceWrites === 2)
          throw new Error('Disk unavailable');
        return persist(id, transform);
      });
    await expect(
      env.taskOperations.tidyInbox(ROOT, 'inbox-source')
    ).rejects.toThrow('Disk unavailable');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe('- [ ] Same @2026-11-20\n- [ ] Same @2026-11-20');
    expect(await env.transferRecovery.load()).not.toBeNull();
    expect([...env.vault.tasks()]).toHaveLength(4); // source is retained until all writes finish
    await expect(
      env.taskOperations.create('inbox-source', 'Wait')
    ).rejects.toThrow('Finish Tidy up');
    failure.mockRestore();
    const restarted = new TaskOperations(env.pageOperations, env.transferRecovery);
    await restarted.tidyInbox(ROOT, 'inbox-source');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe('');
    expect([...env.vault.tasks()]).toHaveLength(2);
    expect(await env.transferRecovery.load()).toBeNull();
  });

  it('keeps all originals when a destination fails and shares rapid repeated requests', async () => {
    const body = '- [x] Finished @2026-11-20 @completed:2026-11-14';
    const env = setup(inbox(body));
    const ensure = vi
      .spyOn(env.pageOperations, 'ensureAtPath')
      .mockRejectedValueOnce(new Error('No access'));
    const first = env.taskOperations.tidyInbox(ROOT, 'inbox-source');
    expect(env.taskOperations.tidyInbox(ROOT, 'inbox-source')).toBe(first);
    await expect(first).rejects.toThrow('No access');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toContain(body);
    ensure.mockRestore();
    await env.taskOperations.tidyInbox(ROOT, 'inbox-source');
    expect([...env.vault.tasks()]).toHaveLength(1);
    expect([...env.vault.tasks()][0]!.completed).toBe(true);
  });

  it('serializes concurrent task creation and coalesces first source creation', async () => {
    const env = setup(inbox(''));
    await Promise.all([
      env.taskOperations.create('inbox-source', 'One'),
      env.taskOperations.create('inbox-source', 'Two'),
    ]);
    expect([...env.vault.tasks()].map((task) => task.text).sort()).toEqual([
      'One',
      'Two',
    ]);
    const paths = await Promise.all([
      env.pageOperations.ensureAtPath(`${ROOT}/New.md`, { type: 'note' }),
      env.pageOperations.ensureAtPath(`${ROOT}/New.md`, { type: 'note' }),
    ]);
    expect(paths[0]).toBe(paths[1]);
  });

  it('refuses source removal when an open destination cannot be saved', async () => {
    const env = setup(inbox('- [ ] Keep @2026-11-20'));
    // Resolve through the production path convention, then leave a dirty editor session on it.
    const { DailyNotePath } = await import('../../vault/ingest/DailyNotePath');
    const targetId = await env.pageOperations.ensureAtPath(
      DailyNotePath.absoluteFrom(ROOT, new Date(2026, 10, 20)),
      { type: 'daily-note' }
    );
    await env.pageOperations.open(targetId);
    const failedSave = vi
      .spyOn(env.pageOperations, 'requestSave')
      .mockResolvedValue(undefined);
    await expect(
      env.taskOperations.tidyInbox(ROOT, 'inbox-source')
    ).rejects.toThrow('not been saved');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toContain(
      '- [ ] Keep @2026-11-20'
    );
    failedSave.mockRestore();
  });
});


describe('Inbox recovery across a full vault reload', () => {
  it('recognizes a destination written before an interruption without duplicating it after restart', async () => {
    const source = { ...buildPage('inbox-id', '- [x] Same @2026-11-20 @completed:2026-11-14\n- [x] Same @2026-11-20 @completed:2026-11-14'), path: `${ROOT}/.clutter/inbox.md` };
    const env = setup(source);
    await env.fileSystem.createDirectory(`${ROOT}/.clutter`);
    const persist = env.pageOperations.mutateBodyAndSave.bind(env.pageOperations);
    const interrupted = vi.spyOn(env.pageOperations, 'mutateBodyAndSave').mockImplementation(async (id, transform) => {
      await persist(id, transform);
      if (id !== source.id) throw new Error('Interrupted after destination save');
    });
    await expect(env.taskOperations.tidyInbox(ROOT, source.id)).rejects.toThrow('Interrupted');
    interrupted.mockRestore();
    const { VaultScanner } = await import('../../vault/ingest/VaultScanner');
    const { VaultBuilder } = await import('../../vault/ingest/VaultBuilder');
    const scan = await new VaultScanner(env.fileSystem).scan(ROOT);
    const { vault } = new VaultBuilder(new UuidGenerator()).build(scan);
    const restarted = setup(vault.getPage(source.id)!, { vault, fileSystem: env.fileSystem });
    await restarted.taskOperations.tidyInbox(ROOT, source.id);
    expect(vault.getPage(source.id)!.source.markdown).toBe('');
    expect([...vault.tasks()]).toHaveLength(2);
    expect([...vault.tasks()].every((task) => task.completed && task.completedAt === '2026-11-14')).toBe(true);
  });

  it('does not reserve comment text in ordinary notes', async () => {
    const source = buildPage('ordinary', 'Example: <!-- clutter-inbox-plan \n- [ ] Still editable');
    const env = setup(source);
    await env.taskOperations.toggleComplete(firstTask(source));
    expect(env.vault.getPage(source.id)!.analysis.tasks[0]!.completed).toBe(true);
  });
});


describe('Tidy up adds only task lines to user Markdown', () => {
  const raw = '- [x] Finished @2026-11-20 @completed:2026-11-14';
  const inbox = (body: string): Page => ({ ...buildPage('inbox-source', body), path: `${ROOT}/.clutter/inbox.md` });

  it('preserves old comments while inserting only the task lines', async () => {
    const env = setup(inbox(raw + '\n- [ ] Undated'));
    const { DailyNotePath } = await import('../../vault/ingest/DailyNotePath');
    const target = await env.pageOperations.ensureAtPath(DailyNotePath.absoluteFrom(ROOT, new Date(2026, 10, 20)), { type: 'daily-note' });
    const old = '<!-- clutter-inbox-transfer fa780adf-0056-47b1-9a8e-e32d14e832bb:2026-11-20 -->';
    const previous = `# Notes\n${old}\n<!-- My own comment -->\n- [ ] Existing task`;
    await env.pageOperations.mutateBodyAndSave(target, () => previous);
    await env.taskOperations.tidyInbox(ROOT, 'inbox-source');
    expect(env.vault.getPage(target)!.source.markdown).toBe(`# Notes\n${old}\n<!-- My own comment -->\n${raw}\n- [ ] Existing task`);
    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe('- [ ] Undated');
    expect(await env.transferRecovery.load()).toBeNull();
  });

  it('refuses a move before adding anything when private recovery cannot be saved', async () => {
    const env = setup(inbox(raw));
    vi.spyOn(env.transferRecovery, 'save').mockRejectedValueOnce(new Error('Metadata unavailable'));
    await expect(env.taskOperations.tidyInbox(ROOT, 'inbox-source')).rejects.toThrow('Metadata unavailable');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe(raw);
    expect([...env.vault.pages()]).toHaveLength(1);
  });

  it('finishes failed metadata cleanup before accepting a new Inbox task', async () => {
    const env = setup(inbox(raw));
    const save = env.transferRecovery.save.bind(env.transferRecovery);
    const cleanup = vi.spyOn(env.transferRecovery, 'save').mockImplementation(async (expected, next) => {
      if (next === null) throw new Error('Cleanup failed');
      return save(expected, next);
    });
    await expect(env.taskOperations.tidyInbox(ROOT, 'inbox-source')).rejects.toThrow('Cleanup failed');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe('');
    cleanup.mockRestore();
    await env.taskOperations.create('inbox-source', 'New capture');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe('- [ ] New capture');
    expect([...env.vault.tasks()].filter((task) => task.completed)).toHaveLength(1);
    expect(await env.transferRecovery.load()).toBeNull();
  });

  it('recognizes an old pending checkpoint without adding or removing old comments', async () => {
    const id = 'fa780adf-0056-47b1-9a8e-e32d14e832bb';
    const checkpoint = `<!-- clutter-inbox-plan ${JSON.stringify({ version: 1, id, body: raw })} -->`;
    const env = setup(inbox(`${raw}\n${checkpoint}`));
    const { DailyNotePath } = await import('../../vault/ingest/DailyNotePath');
    const target = await env.pageOperations.ensureAtPath(DailyNotePath.absoluteFrom(ROOT, new Date(2026, 10, 20)), { type: 'daily-note' });
    const previous = `<!-- clutter-inbox-transfer ${id}:2026-11-20 -->\n${raw}`;
    await env.pageOperations.mutateBodyAndSave(target, () => previous);
    await env.taskOperations.tidyInbox(ROOT, 'inbox-source');
    expect(env.vault.getPage(target)!.source.markdown).toBe(previous);
    expect(env.vault.getPage('inbox-source')!.source.markdown).toBe(checkpoint);
    expect([...env.vault.tasks()]).toHaveLength(1);
    await env.taskOperations.create('inbox-source', 'Another capture');
    expect(env.vault.getPage('inbox-source')!.source.markdown).toContain(checkpoint);
  });
});


it('recovers privately when an open Daily Note was normalized during its save', async () => {
  const { normalizeAllTablesInMarkdown } = await import('../../../features/markdown/editor/codemirror/table/tableColumnNormalization');
  const raw = '- [ ] Move exactly once @2026-11-20';
  const source = { ...buildPage('inbox-source', raw), path: `${ROOT}/.clutter/inbox.md` };
  const env = setup(source, undefined, normalizeAllTablesInMarkdown);
  await env.fileSystem.createDirectory(`${ROOT}/.clutter`);
  const { DailyNotePath } = await import('../../vault/ingest/DailyNotePath');
  const targetPath = DailyNotePath.absoluteFrom(ROOT, new Date(2026, 10, 20));
  const target = await env.pageOperations.ensureAtPath(targetPath, { type: 'daily-note' });
  await env.pageOperations.open(target);
  await env.pageOperations.mutateBodyAndSave(target, () => '# User notes\n\n| a | longer |\n|---|---|\n| 1 | 2 |');
  const persist = env.pageOperations.mutateBodyAndSave.bind(env.pageOperations);
  const interrupted = vi.spyOn(env.pageOperations, 'mutateBodyAndSave').mockImplementation(async (id, transform) => {
    await persist(id, transform);
    if (id === target) throw new Error('Interrupted after normalized save');
  });
  await expect(env.taskOperations.tidyInbox(ROOT, source.id)).rejects.toThrow('Interrupted');
  interrupted.mockRestore();
  const savedBody = env.vault.getPage(target)!.source.markdown;
  expect(savedBody).not.toContain('<!-- clutter-inbox');
  const { VaultScanner } = await import('../../vault/ingest/VaultScanner');
  const { VaultBuilder } = await import('../../vault/ingest/VaultBuilder');
  const { vault } = new VaultBuilder(new UuidGenerator()).build(await new VaultScanner(env.fileSystem).scan(ROOT));
  const restarted = setup(vault.getPage(source.id)!, { vault, fileSystem: env.fileSystem }, normalizeAllTablesInMarkdown);
  await restarted.taskOperations.tidyInbox(ROOT, source.id);
  expect(vault.getPage(target)!.source.markdown).toBe(savedBody);
  expect([...vault.tasks()]).toHaveLength(1);
  expect(vault.getPage(source.id)!.source.markdown).toBe('');
});
