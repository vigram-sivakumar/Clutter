import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskOperations } from './TaskOperations';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { TaskExtractor } from '../../vault/ingest/extractors/TaskExtractor';
import { TagExtractor } from '../../vault/ingest/extractors/TagExtractor';
import { LinkExtractor } from '../../vault/ingest/extractors/LinkExtractor';
import { EmbedExtractor } from '../../vault/ingest/extractors/EmbedExtractor';
import { BlockReferenceExtractor } from '../../vault/ingest/extractors/BlockReferenceExtractor';
import { HeadingExtractor } from '../../vault/ingest/extractors/HeadingExtractor';
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

  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );

  return { vault, fileSystem, coordinator, taskOperations: new TaskOperations(vault, coordinator) };
}

function firstTask(page: Page): TaskOccurrence {
  const task = page.analysis.tasks[0];
  if (!task) throw new Error('Fixture page has no task');
  return task;
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
});
