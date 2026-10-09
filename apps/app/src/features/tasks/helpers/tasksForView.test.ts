import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskOccurrence } from '@core/vault/models/occurrences';

import { tasksForView, type TaskViewKind } from './tasksForView';

const SHOW = { showCompleted: true };
const HIDE = { showCompleted: false };

function task(text: string, overrides: Partial<TaskOccurrence> = {}): TaskOccurrence {
  return { sourcePageId: 'daily-2026-10-06', text, completed: false, ...overrides };
}

const titles = (view: TaskViewKind, tasks: readonly TaskOccurrence[], config = SHOW) =>
  tasksForView(view, tasks, config).map((t) => t.text);

describe('tasksForView — the single authority on which tasks belong to each task view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0)); // 2026-10-06
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('membership', () => {
    const noDate = task('no date');
    const today = task('due today', { dueDate: '2026-10-06' });
    const yesterday = task('due yesterday', { dueDate: '2026-10-05' });
    const tomorrow = task('due tomorrow', { dueDate: '2026-10-07' });
    const done = task('done', { completed: true, completedAt: '2026-10-01' });
    const all = [noDate, today, yesterday, tomorrow, done];

    it('Tasks → every task', () => {
      expect(titles('tasks-all', all)).toEqual(all.map((t) => t.text));
    });
    it('no due date → Unscheduled', () => {
      expect(titles('tasks-unscheduled', all)).toEqual(['no date']);
    });
    it('due today → Today', () => {
      expect(titles('tasks-today', all)).toEqual(['due today']);
    });
    it('due after today → Upcoming; unscheduled tasks are never Upcoming', () => {
      expect(titles('tasks-upcoming', all)).toEqual(['due tomorrow']);
    });
  });

  describe('Daily Note independence (ADR-044)', () => {
    // Lives in today's Daily Note (sourcePageId); only the explicit due date decides the view.
    it('a task in today\'s Daily Note with no due date is Unscheduled', () => {
      const t = task('buy groceries');
      expect(titles('tasks-unscheduled', [t])).toEqual(['buy groceries']);
    });

    it('a task in today\'s Daily Note with a due date is not Unscheduled', () => {
      const t = task('submit report', { dueDate: '2026-10-07' });
      expect(titles('tasks-unscheduled', [t])).toEqual([]);
    });
  });

  describe('completed tasks — one documented rule', () => {
    const completedToday = task('done today', { completed: true, dueDate: '2026-10-06', completedAt: '2026-10-06' });
    const completedNoDate = task('done undated', { completed: true, completedAt: '2026-10-03' });
    const everyCompleted = [completedToday, completedNoDate];

    it('Show completed applies to Tasks, Today and Upcoming', () => {
      const completedFuture = task('done future', { completed: true, dueDate: '2026-10-09', completedAt: '2026-10-05' });
      expect(titles('tasks-all', everyCompleted, SHOW)).toHaveLength(2);
      expect(titles('tasks-all', everyCompleted, HIDE)).toEqual([]);
      expect(titles('tasks-today', everyCompleted, SHOW)).toEqual(['done today']);
      expect(titles('tasks-today', everyCompleted, HIDE)).toEqual([]);
      expect(titles('tasks-upcoming', [completedFuture], SHOW)).toEqual(['done future']);
      expect(titles('tasks-upcoming', [completedFuture], HIDE)).toEqual([]);
    });

    it('a completed task never appears in Unscheduled — with Show completed on or off', () => {
      expect(titles('tasks-unscheduled', everyCompleted, SHOW)).toEqual([]);
      expect(titles('tasks-unscheduled', everyCompleted, HIDE)).toEqual([]);
    });
  });

  describe('invalid due dates', () => {
    it('a shape-valid but invalid date is unscheduled — never Today or Upcoming', () => {
      const bad = task('malformed', { dueDate: '2026-13-45' });

      expect(titles('tasks-unscheduled', [bad])).toEqual(['malformed']);
      expect(titles('tasks-today', [bad])).toEqual([]);
      expect(titles('tasks-upcoming', [bad])).toEqual([]);
    });
  });
});
