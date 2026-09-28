import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupTasks, DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from './groupTasks';
import type { TaskOccurrence } from '@core/vault/models/occurrences';

function task(overrides: Partial<TaskOccurrence>): TaskOccurrence {
  return {
    sourcePageId: 'page-1',
    text: 'task',
    completed: false,
    ...overrides,
  };
}

const HIDDEN: TaskDisplayConfig = { showCompleted: false, autoSortCompleted: false };
const SHOWN: TaskDisplayConfig = { showCompleted: true, autoSortCompleted: false };
const SHOWN_SORTED: TaskDisplayConfig = { showCompleted: true, autoSortCompleted: true };

describe('groupTasks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('puts incomplete tasks due today into `today`', () => {
    const dueToday = task({ text: 'due today', dueDate: '2026-08-04' });
    const dueTomorrow = task({ text: 'due tomorrow', dueDate: '2026-08-05' });

    const groups = groupTasks([dueToday, dueTomorrow], HIDDEN);

    expect(groups.today).toEqual([dueToday]);
    expect(groups.upcoming).toEqual([dueTomorrow]);
  });

  it('orders upcoming as overdue (chronological), then future (chronological), then unscheduled', () => {
    const future2 = task({ text: 'future far', dueDate: '2026-09-01' });
    const future1 = task({ text: 'future near', dueDate: '2026-08-10' });
    const overdue2 = task({ text: 'overdue recent', dueDate: '2026-08-03' });
    const overdue1 = task({ text: 'overdue old', dueDate: '2026-07-20' });
    const unscheduled = task({ text: 'unscheduled' });

    const groups = groupTasks([future2, unscheduled, future1, overdue2, overdue1], HIDDEN);

    expect(groups.upcoming).toEqual([
      overdue1,
      overdue2,
      future1,
      future2,
      unscheduled,
    ]);
  });

  it('exposes the unscheduled subset of upcoming separately', () => {
    const future = task({ text: 'future', dueDate: '2026-08-10' });
    const overdue = task({ text: 'overdue', dueDate: '2026-07-20' });
    const unscheduled = task({ text: 'unscheduled' });

    const groups = groupTasks([future, overdue, unscheduled], HIDDEN);

    expect(groups.unscheduled).toEqual([unscheduled]);
    expect(groups.upcoming).toEqual([overdue, future, unscheduled]);
  });

  it('treats an unparseable due date as unscheduled rather than dropping the task', () => {
    const malformed = task({ text: 'malformed', dueDate: 'not-a-date' });

    const groups = groupTasks([malformed], HIDDEN);

    expect(groups.upcoming).toEqual([malformed]);
  });

  it('treats a shape-valid but calendar-invalid due date as unscheduled, not a rolled-over date', () => {
    // Regression: '2026-13-45' is exactly the shape TaskExtractor.ts's
    // BARE_DATE_PATTERN accepts without calendar validation. toDate()'s
    // local-component construction silently rolls this over to a real but
    // fabricated date (2027-02-14) rather than throwing — without the
    // isValidCalendarDate guard in isOverdue/isDueInFuture/isDueToday, this
    // task would have sorted into `future` under that fabricated date
    // instead of `unscheduled`.
    const invalidCalendarDate = task({ text: 'invalid calendar date', dueDate: '2026-13-45' });

    const groups = groupTasks([invalidCalendarDate], HIDDEN);

    expect(groups.today).toEqual([]);
    expect(groups.unscheduled).toEqual([invalidCalendarDate]);
    expect(groups.upcoming).toEqual([invalidCalendarDate]);
  });

  describe('showCompleted: false', () => {
    it('excludes every completed task from every group, regardless of due date', () => {
      const completedToday = task({ text: 'completed today', completed: true, dueDate: '2026-08-04' });
      const completedOverdue = task({ text: 'completed overdue', completed: true, dueDate: '2026-07-01' });
      const completedUnscheduled = task({ text: 'completed unscheduled', completed: true });

      const groups = groupTasks([completedToday, completedOverdue, completedUnscheduled], HIDDEN);

      expect(groups.today).toEqual([]);
      expect(groups.upcoming).toEqual([]);
      expect(groups.unscheduled).toEqual([]);
    });
  });

  describe('showCompleted: true', () => {
    it('includes a completed task due today in `today`, alongside incomplete tasks', () => {
      const activeToday = task({ text: 'active today', dueDate: '2026-08-04' });
      const completedToday = task({ text: 'completed today', completed: true, dueDate: '2026-08-04' });

      const groups = groupTasks([completedToday, activeToday], SHOWN);

      // Auto-sort is off — the completed task keeps its original relative
      // position (first in the source array), it is not moved.
      expect(groups.today).toEqual([completedToday, activeToday]);
    });

    it('buckets a completed task with no due date, or a past/future one, into upcoming/unscheduled the same way an incomplete task would', () => {
      const completedOverdue = task({ text: 'completed overdue', completed: true, dueDate: '2026-07-20' });
      const completedFuture = task({ text: 'completed future', completed: true, dueDate: '2026-09-01' });
      const completedUnscheduled = task({ text: 'completed unscheduled', completed: true });

      const groups = groupTasks(
        [completedFuture, completedUnscheduled, completedOverdue],
        SHOWN
      );

      expect(groups.upcoming).toEqual([completedOverdue, completedFuture, completedUnscheduled]);
      expect(groups.unscheduled).toEqual([completedUnscheduled]);
    });
  });

  describe('autoSortCompleted', () => {
    it('off: a completed task due today stays in its original position among Today\'s incomplete tasks', () => {
      const completed = task({ text: 'completed', completed: true, dueDate: '2026-08-04' });
      const active1 = task({ text: 'active 1', dueDate: '2026-08-04' });
      const active2 = task({ text: 'active 2', dueDate: '2026-08-04' });

      const groups = groupTasks([completed, active1, active2], SHOWN);

      expect(groups.today).toEqual([completed, active1, active2]);
    });

    it('on: moves every completed task in Today to the bottom, below every incomplete one', () => {
      const completed = task({ text: 'completed', completed: true, dueDate: '2026-08-04' });
      const active1 = task({ text: 'active 1', dueDate: '2026-08-04' });
      const active2 = task({ text: 'active 2', dueDate: '2026-08-04' });

      const groups = groupTasks([completed, active1, active2], SHOWN_SORTED);

      expect(groups.today).toEqual([active1, active2, completed]);
    });

    it('on: moves every completed task in Everything else to the bottom, preserving incomplete task ordering above it', () => {
      const completedOverdue = task({ text: 'completed overdue', completed: true, dueDate: '2026-07-01' });
      const overdue = task({ text: 'overdue', dueDate: '2026-07-20' });
      const future = task({ text: 'future', dueDate: '2026-09-01' });

      const groups = groupTasks([future, completedOverdue, overdue], SHOWN_SORTED);

      expect(groups.upcoming).toEqual([overdue, future, completedOverdue]);
    });

    it('on, showCompleted off: no completed tasks are present to sort, upcoming ordering is unaffected', () => {
      const completed = task({ text: 'completed', completed: true, dueDate: '2026-07-01' });
      const overdue = task({ text: 'overdue', dueDate: '2026-07-20' });

      const groups = groupTasks([overdue, completed], {
        showCompleted: false,
        autoSortCompleted: true,
      });

      expect(groups.upcoming).toEqual([overdue]);
    });
  });

  it('DEFAULT_TASK_DISPLAY_CONFIG shows completed tasks without auto-sorting them', () => {
    expect(DEFAULT_TASK_DISPLAY_CONFIG).toEqual({ showCompleted: true, autoSortCompleted: false });
  });
});
