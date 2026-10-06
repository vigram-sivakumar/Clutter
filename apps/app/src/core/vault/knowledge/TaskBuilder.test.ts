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

describe("TaskBuilder — a task's due date is only ever explicit (ADR-044)", () => {
  const dailyNotePath = '/vault/Daily Notes/2026/October/2026-10-06.md';

  it('leaves a Daily Note task with no explicit due date undated', () => {
    const page = makePage('page-a', dailyNotePath, 'daily-note', [makeTask('page-a')]);

    const [task] = new TaskBuilder().build([page]);

    expect(task?.dueDate).toBeUndefined();
  });

  it("keeps an explicit due date unchanged, even when it differs from the Daily Note's own date", () => {
    const page = makePage('page-a', dailyNotePath, 'daily-note', [
      makeTask('page-a', { dueDate: '2026-10-08' }),
    ]);

    const [task] = new TaskBuilder().build([page]);

    expect(task?.dueDate).toBe('2026-10-08');
  });

  it('leaves a task on an ordinary Note undated', () => {
    const page = makePage('page-a', '/vault/Note.md', 'note', [makeTask('page-a')]);

    expect(new TaskBuilder().build([page])[0]?.dueDate).toBeUndefined();
  });

  it('passes every task through untouched, across pages', () => {
    const a = makeTask('page-a');
    const b = makeTask('page-b', { text: 'Second', completed: true });
    const pages = [
      makePage('page-a', dailyNotePath, 'daily-note', [a]),
      makePage('page-b', '/vault/Note.md', 'note', [b]),
    ];

    expect(new TaskBuilder().build(pages)).toEqual([a, b]);
  });
});
