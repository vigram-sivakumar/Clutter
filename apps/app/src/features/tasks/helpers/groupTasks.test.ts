import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupTasks } from './groupTasks';
import type { TaskOccurrence } from '@core/vault/models/occurrences';

function task(overrides: Partial<TaskOccurrence>): TaskOccurrence {
  return {
    sourcePageId: 'page-1',
    text: 'task',
    completed: false,
    ...overrides,
  };
}

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

    const groups = groupTasks([dueToday, dueTomorrow]);

    expect(groups.today).toEqual([dueToday]);
    expect(groups.upcoming).toEqual([dueTomorrow]);
  });

  it('puts tasks completed today into `todayCompleted`, not `today` or `upcoming`', () => {
    const completedToday = task({
      text: 'completed today',
      completed: true,
      completedAt: '2026-08-04',
    });
    const completedYesterday = task({
      text: 'completed yesterday',
      completed: true,
      completedAt: '2026-08-03',
    });

    const groups = groupTasks([completedToday, completedYesterday]);

    expect(groups.todayCompleted).toEqual([completedToday]);
    expect(groups.today).toEqual([]);
    expect(groups.upcoming).toEqual([]);
  });

  it('orders upcoming as overdue (chronological), then future (chronological), then unscheduled', () => {
    const future2 = task({ text: 'future far', dueDate: '2026-09-01' });
    const future1 = task({ text: 'future near', dueDate: '2026-08-10' });
    const overdue2 = task({ text: 'overdue recent', dueDate: '2026-08-03' });
    const overdue1 = task({ text: 'overdue old', dueDate: '2026-07-20' });
    const unscheduled = task({ text: 'unscheduled' });

    const groups = groupTasks([future2, unscheduled, future1, overdue2, overdue1]);

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

    const groups = groupTasks([future, overdue, unscheduled]);

    expect(groups.unscheduled).toEqual([unscheduled]);
    expect(groups.upcoming).toEqual([overdue, future, unscheduled]);
  });

  it('treats an unparseable due date as unscheduled rather than dropping the task', () => {
    const malformed = task({ text: 'malformed', dueDate: 'not-a-date' });

    const groups = groupTasks([malformed]);

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

    const groups = groupTasks([invalidCalendarDate]);

    expect(groups.today).toEqual([]);
    expect(groups.unscheduled).toEqual([invalidCalendarDate]);
    expect(groups.upcoming).toEqual([invalidCalendarDate]);
  });

  it('excludes completed tasks (other than todayCompleted) from every group', () => {
    const completedLastWeek = task({
      text: 'old completed',
      completed: true,
      completedAt: '2026-07-28',
    });

    const groups = groupTasks([completedLastWeek]);

    expect(groups.today).toEqual([]);
    expect(groups.todayCompleted).toEqual([]);
    expect(groups.upcoming).toEqual([]);
  });
});
