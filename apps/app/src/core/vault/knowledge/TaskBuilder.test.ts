import { describe, expect, it } from 'vitest';
import { TaskBuilder } from './TaskBuilder';
import type { Page } from '../models';
import type { TaskOccurrence } from '../models/occurrences';

function makePage(
  id: string,
  path: string,
  type: Page['type'],
  tasks: readonly TaskOccurrence[]
): Page {
  return {
    id,
    type,
    name: 'name',
    path,
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side' as const,
      coverPositionAbove: 50,
      coverPositionSide: 50,
      description: '',
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks,
      tags: [],
      links: [],
      embeds: [],
    },
  };
}

function makeTask(sourcePageId: string, overrides: Partial<TaskOccurrence> = {}): TaskOccurrence {
  return {
    sourcePageId,
    text: 'Seperator height above Headings',
    completed: false,
    rawText: '- [ ] Seperator height above Headings',
    ...overrides,
  };
}

describe('TaskBuilder — Daily Note implicit due date', () => {
  it('falls back to the Daily Note page date when the task has no explicit due date', () => {
    const page = makePage('page-a', '/vault/Daily Notes/2026/October/2026-10-01.md', 'daily-note', [
      makeTask('page-a'),
    ]);

    const tasks = new TaskBuilder().build([page]);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.dueDate).toBe('2026-10-01');
  });

  it('keeps an explicit inline due date over the Daily Note implicit one', () => {
    const page = makePage('page-a', '/vault/Daily Notes/2026/October/2026-10-01.md', 'daily-note', [
      makeTask('page-a', { dueDate: '2026-12-25' }),
    ]);

    const tasks = new TaskBuilder().build([page]);

    expect(tasks[0]!.dueDate).toBe('2026-12-25');
  });

  it('never assigns an implicit due date to a task on an ordinary Note', () => {
    const page = makePage('page-a', '/vault/Projects/Roadmap.md', 'note', [makeTask('page-a')]);

    const tasks = new TaskBuilder().build([page]);

    expect(tasks[0]!.dueDate).toBeUndefined();
  });

  it('does not alter completed state or any other field while adding the implicit due date', () => {
    const page = makePage('page-a', '/vault/Daily Notes/2026/October/2026-10-01.md', 'daily-note', [
      makeTask('page-a', { completed: true, completedAt: '2026-10-01' }),
    ]);

    const tasks = new TaskBuilder().build([page]);

    expect(tasks[0]).toMatchObject({
      completed: true,
      completedAt: '2026-10-01',
      dueDate: '2026-10-01',
      text: 'Seperator height above Headings',
    });
  });

  it("derives each Daily Note page's own date independently for its own tasks", () => {
    const pageOct1 = makePage('page-a', '/vault/Daily Notes/2026/October/2026-10-01.md', 'daily-note', [
      makeTask('page-a'),
    ]);
    const pageOct2 = makePage('page-b', '/vault/Daily Notes/2026/October/2026-10-02.md', 'daily-note', [
      makeTask('page-b', { text: 'Second task' }),
    ]);

    const tasks = new TaskBuilder().build([pageOct1, pageOct2]);

    expect(tasks.find((t) => t.sourcePageId === 'page-a')?.dueDate).toBe('2026-10-01');
    expect(tasks.find((t) => t.sourcePageId === 'page-b')?.dueDate).toBe('2026-10-02');
  });
});
