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

    it('All tasks contains incomplete tasks only', () => {
      expect(titles('tasks-all', all)).toEqual(['no date', 'due today', 'due yesterday', 'due tomorrow']);
    });
    it('Completed contains every completed task regardless of due date', () => {
      expect(titles('tasks-completed', all)).toEqual(['done']);
    });
    it('no due date → Unplanned', () => {
      expect(titles('tasks-unscheduled', all)).toEqual(['no date']);
    });
    it('overdue and due today → Today', () => {
      expect(titles('tasks-today', all)).toEqual(['due today', 'due yesterday']);
    });
    it('due before today and not completed → Overdue', () => {
      expect(titles('tasks-overdue', all)).toEqual(['due yesterday']);
    });
    it('due after today → Upcoming; unscheduled tasks are never Upcoming', () => {
      expect(titles('tasks-upcoming', all)).toEqual(['due tomorrow']);
    });
  });

  describe('Daily Note independence (ADR-044)', () => {
    // Lives in today's Daily Note (sourcePageId); only the explicit due date decides the view.
    it('a task in today\'s Daily Note with no due date is Unplanned', () => {
      const t = task('buy groceries');
      expect(titles('tasks-unscheduled', [t])).toEqual(['buy groceries']);
    });

    it('a task in today\'s Daily Note with a due date is not Unplanned', () => {
      const t = task('submit report', { dueDate: '2026-10-07' });
      expect(titles('tasks-unscheduled', [t])).toEqual([]);
    });
  });

  describe('completed tasks — one documented rule', () => {
    const completedToday = task('done today', { completed: true, dueDate: '2026-10-06', completedAt: '2026-10-06' });
    const completedNoDate = task('done undated', { completed: true, completedAt: '2026-10-03' });
    const everyCompleted = [completedToday, completedNoDate];

    it('completed tasks are excluded from active tabs regardless of the legacy Show completed setting', () => {
      const completedFuture = task('done future', { completed: true, dueDate: '2026-10-09', completedAt: '2026-10-05' });
      expect(titles('tasks-all', everyCompleted, SHOW)).toEqual([]);
      expect(titles('tasks-all', everyCompleted, HIDE)).toEqual([]);
      expect(titles('tasks-completed', everyCompleted, SHOW)).toEqual(['done today', 'done undated']);
      expect(titles('tasks-completed', everyCompleted, HIDE)).toEqual(['done today', 'done undated']);
      expect(titles('tasks-today', everyCompleted, SHOW)).toEqual([]);
      expect(titles('tasks-today', everyCompleted, HIDE)).toEqual([]);
      expect(titles('tasks-upcoming', [completedFuture], SHOW)).toEqual([]);
      expect(titles('tasks-upcoming', [completedFuture], HIDE)).toEqual([]);
    });

    it('a completed task never appears in Overdue — with Show completed on or off', () => {
      const completedPast = task('done past', { completed: true, dueDate: '2026-10-01', completedAt: '2026-10-01' });
      expect(titles('tasks-overdue', [completedPast], SHOW)).toEqual([]);
      expect(titles('tasks-overdue', [completedPast], HIDE)).toEqual([]);
      expect(titles('tasks-today', [completedPast], SHOW)).toEqual([]);
      expect(titles('tasks-today', [completedPast], HIDE)).toEqual([]);
    });

    it('a completed task never appears in Unplanned — with Show completed on or off', () => {
      expect(titles('tasks-unscheduled', everyCompleted, SHOW)).toEqual([]);
      expect(titles('tasks-unscheduled', everyCompleted, HIDE)).toEqual([]);
    });
  });

  describe('invalid due dates', () => {
    it('a shape-valid but invalid date is unscheduled — never Today or Upcoming', () => {
      const bad = task('malformed', { dueDate: '2026-13-45' });

      expect(titles('tasks-unscheduled', [bad])).toEqual(['malformed']);
      expect(titles('tasks-today', [bad])).toEqual([]);
      expect(titles('tasks-overdue', [bad])).toEqual([]);
      expect(titles('tasks-upcoming', [bad])).toEqual([]);
    });
  });
});
