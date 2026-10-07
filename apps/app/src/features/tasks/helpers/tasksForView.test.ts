import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskOccurrence } from '@core/vault/models/occurrences';

import { taskViewHasFixedOrder, tasksForView, type TaskViewKind } from './tasksForView';

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

    it('All Tasks → every task', () => {
      expect(titles('tasks-all', all)).toEqual(all.map((t) => t.text));
    });
    it('no due date → Unscheduled', () => {
      expect(titles('tasks-unscheduled', all)).toEqual(['no date']);
    });
    it('due today → Today', () => {
      expect(titles('tasks-today', all)).toEqual(['due today']);
    });
    it('due yesterday → Overdue', () => {
      expect(titles('tasks-overdue', all)).toEqual(['due yesterday']);
    });
    it('due tomorrow → Upcoming; unscheduled tasks are never Upcoming', () => {
      expect(titles('tasks-upcoming', all)).toEqual(['due tomorrow']);
    });
    it('completed → Done', () => {
      expect(titles('tasks-completed', all)).toEqual(['done']);
    });
  });

  describe('Daily Note independence (ADR-044)', () => {
    // Both live in today's Daily Note (sourcePageId); only the explicit due date decides the view.
    it('a task in today\'s Daily Note with no due date is Unscheduled, NOT Today', () => {
      const t = task('buy groceries');
      expect(titles('tasks-today', [t])).toEqual([]);
      expect(titles('tasks-unscheduled', [t])).toEqual(['buy groceries']);
    });

    it('a task in today\'s Daily Note due tomorrow is Upcoming, NOT Today', () => {
      const t = task('submit report', { dueDate: '2026-10-07' });
      expect(titles('tasks-today', [t])).toEqual([]);
      expect(titles('tasks-upcoming', [t])).toEqual(['submit report']);
    });
  });

  describe('completed tasks — one documented rule', () => {
    const completedToday = task('done today', { completed: true, dueDate: '2026-10-06', completedAt: '2026-10-06' });
    const completedFuture = task('done future', { completed: true, dueDate: '2026-10-09', completedAt: '2026-10-05' });
    const completedOverdue = task('done overdue', { completed: true, dueDate: '2026-10-01', completedAt: '2026-10-02' });
    const completedNoDate = task('done undated', { completed: true, completedAt: '2026-10-03' });
    const everyCompleted = [completedToday, completedFuture, completedOverdue, completedNoDate];

    it('Show completed applies to All Tasks, Today and Upcoming', () => {
      expect(titles('tasks-all', everyCompleted, SHOW)).toHaveLength(4);
      expect(titles('tasks-all', everyCompleted, HIDE)).toEqual([]);
      expect(titles('tasks-today', everyCompleted, SHOW)).toEqual(['done today']);
      expect(titles('tasks-today', everyCompleted, HIDE)).toEqual([]);
      expect(titles('tasks-upcoming', everyCompleted, SHOW)).toEqual(['done future']);
      expect(titles('tasks-upcoming', everyCompleted, HIDE)).toEqual([]);
    });

    it('a completed task due before today is not Overdue (no longer "still overdue") — with Show completed on or off', () => {
      expect(titles('tasks-overdue', everyCompleted, SHOW)).toEqual([]);
      expect(titles('tasks-overdue', everyCompleted, HIDE)).toEqual([]);
    });

    it('a completed task with no due date never appears in Unscheduled — with Show completed on or off', () => {
      expect(titles('tasks-unscheduled', everyCompleted, SHOW)).toEqual([]);
      expect(titles('tasks-unscheduled', everyCompleted, HIDE)).toEqual([]);
    });

    it('Done ignores Show completed: it is completed-only by definition', () => {
      expect(titles('tasks-completed', everyCompleted, HIDE)).toHaveLength(4);
      expect(titles('tasks-completed', [task('open'), ...everyCompleted], SHOW)).not.toContain('open');
    });
  });

  describe('Done ordering is a view-level semantic rule', () => {
    it('lists completed tasks newest-completed-first; a task with no completion date sorts last', () => {
      const tasks = [
        task('older', { completed: true, completedAt: '2026-09-01' }),
        task('no stamp', { completed: true }),
        task('newest', { completed: true, completedAt: '2026-10-05' }),
        task('middle', { completed: true, completedAt: '2026-09-20' }),
      ];

      expect(titles('tasks-completed', tasks)).toEqual(['newest', 'middle', 'older', 'no stamp']);
    });

    it('only Done has a fixed order that the shared sort does not reorder', () => {
      expect(taskViewHasFixedOrder('tasks-completed')).toBe(true);
      for (const view of ['tasks-all', 'tasks-today', 'tasks-overdue', 'tasks-upcoming', 'tasks-unscheduled'] as const) {
        expect(taskViewHasFixedOrder(view), view).toBe(false);
      }
    });
  });

  describe('invalid due dates', () => {
    it('a shape-valid but invalid date is unscheduled: Unscheduled only, never Today / Overdue / Upcoming', () => {
      const bad = task('malformed', { dueDate: '2026-13-45' });

      expect(titles('tasks-unscheduled', [bad])).toEqual(['malformed']);
      for (const view of ['tasks-today', 'tasks-overdue', 'tasks-upcoming'] as const) {
        expect(titles(view, [bad]), view).toEqual([]);
      }
    });
  });

  it('every task is in exactly one of Today / Overdue / Upcoming / Unscheduled, or is completed-and-past — never lost or duplicated', () => {
    const tasks = [
      task('a'),
      task('b', { dueDate: '2026-10-06' }),
      task('c', { dueDate: '2026-10-01' }),
      task('d', { dueDate: '2026-10-20' }),
      task('e', { dueDate: '2026-02-31' }),
    ];
    const counts = tasks.map(
      (t) =>
        (['tasks-today', 'tasks-overdue', 'tasks-upcoming', 'tasks-unscheduled'] as const).filter((view) =>
          tasksForView(view, [t], SHOW).includes(t)
        ).length
    );

    expect(counts).toEqual([1, 1, 1, 1, 1]);
  });
});
