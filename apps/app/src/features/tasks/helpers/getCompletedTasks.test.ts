import { describe, expect, it } from 'vitest';
import { getCompletedTasks } from './getCompletedTasks';
import type { TaskOccurrence } from '@core/vault/models/occurrences';

function task(overrides: Partial<TaskOccurrence>): TaskOccurrence {
  return {
    sourcePageId: 'page-1',
    text: 'task',
    completed: false,
    ...overrides,
  };
}

describe('getCompletedTasks', () => {
  it('excludes incomplete tasks', () => {
    const incomplete = task({ text: 'incomplete' });
    const completed = task({ text: 'completed', completed: true, completedAt: '2026-08-01' });

    expect(getCompletedTasks([incomplete, completed])).toEqual([completed]);
  });

  it('sorts completed tasks newest-completed-first, regardless of completion date', () => {
    const oldest = task({ text: 'oldest', completed: true, completedAt: '2026-07-01' });
    const newest = task({ text: 'newest', completed: true, completedAt: '2026-08-04' });
    const middle = task({ text: 'middle', completed: true, completedAt: '2026-07-20' });

    expect(getCompletedTasks([oldest, newest, middle])).toEqual([newest, middle, oldest]);
  });

  it('sorts a completed task with no completedAt last rather than dropping it', () => {
    const withDate = task({ text: 'with date', completed: true, completedAt: '2026-08-01' });
    const withoutDate = task({ text: 'without date', completed: true });

    expect(getCompletedTasks([withoutDate, withDate])).toEqual([withDate, withoutDate]);
  });
});
