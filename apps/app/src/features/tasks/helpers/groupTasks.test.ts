import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupTasks, DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from './groupTasks';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { Page } from '@core/vault/models';
import { TaskBuilder } from '@core/vault/knowledge/TaskBuilder';

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

  it('puts an incomplete, past-due task into `overdue`, sorted oldest-first, never into `upcoming`', () => {
    const future = task({ text: 'future', dueDate: '2026-09-01' });
    const overdueRecent = task({ text: 'overdue recent', dueDate: '2026-08-03' });
    const overdueOld = task({ text: 'overdue old', dueDate: '2026-07-20' });
    const unscheduled = task({ text: 'unscheduled' });

    const groups = groupTasks([future, unscheduled, overdueRecent, overdueOld], HIDDEN);

    expect(groups.overdue).toEqual([overdueOld, overdueRecent]);
    expect(groups.upcoming).toEqual([future, unscheduled]);
  });

  it('orders upcoming as scheduled (chronological), then unscheduled last', () => {
    const future2 = task({ text: 'future far', dueDate: '2026-09-01' });
    const future1 = task({ text: 'future near', dueDate: '2026-08-10' });
    const unscheduled = task({ text: 'unscheduled' });

    const groups = groupTasks([future2, unscheduled, future1], HIDDEN);

    expect(groups.upcoming).toEqual([future1, future2, unscheduled]);
  });

  it('exposes the unscheduled subset of upcoming separately', () => {
    const future = task({ text: 'future', dueDate: '2026-08-10' });
    const overdue = task({ text: 'overdue', dueDate: '2026-07-20' });
    const unscheduled = task({ text: 'unscheduled' });

    const groups = groupTasks([future, overdue, unscheduled], HIDDEN);

    expect(groups.unscheduled).toEqual([unscheduled]);
    expect(groups.overdue).toEqual([overdue]);
    expect(groups.upcoming).toEqual([future, unscheduled]);
  });

  it('treats an unparseable due date as unscheduled rather than dropping the task', () => {
    const malformed = task({ text: 'malformed', dueDate: 'not-a-date' });

    const groups = groupTasks([malformed], HIDDEN);

    expect(groups.overdue).toEqual([]);
    expect(groups.upcoming).toEqual([malformed]);
  });

  it('treats a shape-valid but calendar-invalid due date as unscheduled, not a rolled-over date', () => {
    // Regression: '2026-13-45' is exactly the shape TaskExtractor.ts's
    // BARE_DATE_PATTERN accepts without calendar validation. toDate()'s
    // local-component construction silently rolls this over to a real but
    // fabricated date (2027-02-14) rather than throwing — without the
    // isValidCalendarDate guard in isOverdue/isDueToday/hasScheduledDueDate,
    // this task would have sorted into `overdue`/`today` under that
    // fabricated date instead of `unscheduled`.
    const invalidCalendarDate = task({ text: 'invalid calendar date', dueDate: '2026-13-45' });

    const groups = groupTasks([invalidCalendarDate], HIDDEN);

    expect(groups.today).toEqual([]);
    expect(groups.overdue).toEqual([]);
    expect(groups.unscheduled).toEqual([invalidCalendarDate]);
    expect(groups.upcoming).toEqual([invalidCalendarDate]);
  });

  describe('the Today/Overdue/Upcoming boundary', () => {
    it('a task due exactly today is in `today`, never `overdue` or `upcoming`', () => {
      const dueToday = task({ text: 'due today', dueDate: '2026-08-04' });

      const groups = groupTasks([dueToday], HIDDEN);

      expect(groups.today).toEqual([dueToday]);
      expect(groups.overdue).toEqual([]);
      expect(groups.upcoming).toEqual([]);
    });

    it('a task due yesterday (one day before today) is `overdue`, never `today` or `upcoming`', () => {
      const dueYesterday = task({ text: 'due yesterday', dueDate: '2026-08-03' });

      const groups = groupTasks([dueYesterday], HIDDEN);

      expect(groups.today).toEqual([]);
      expect(groups.overdue).toEqual([dueYesterday]);
      expect(groups.upcoming).toEqual([]);
    });

    it('a task due tomorrow (one day after today) is `upcoming`, never `today` or `overdue`', () => {
      const dueTomorrow = task({ text: 'due tomorrow', dueDate: '2026-08-05' });

      const groups = groupTasks([dueTomorrow], HIDDEN);

      expect(groups.today).toEqual([]);
      expect(groups.overdue).toEqual([]);
      expect(groups.upcoming).toEqual([dueTomorrow]);
    });

    it('a task with no due date is `upcoming` (and its `unscheduled` subset), never `today` or `overdue`', () => {
      const unscheduled = task({ text: 'unscheduled' });

      const groups = groupTasks([unscheduled], HIDDEN);

      expect(groups.today).toEqual([]);
      expect(groups.overdue).toEqual([]);
      expect(groups.upcoming).toEqual([unscheduled]);
      expect(groups.unscheduled).toEqual([unscheduled]);
    });

    it('every eligible task lands in exactly one of today/overdue/upcoming', () => {
      const dueToday = task({ text: 'today', dueDate: '2026-08-04' });
      const dueYesterday = task({ text: 'yesterday', dueDate: '2026-08-03' });
      const dueTomorrow = task({ text: 'tomorrow', dueDate: '2026-08-05' });
      const unscheduled = task({ text: 'unscheduled' });

      const groups = groupTasks([dueToday, dueYesterday, dueTomorrow, unscheduled], SHOWN);

      const totalMembership = groups.today.length + groups.overdue.length + groups.upcoming.length;
      expect(totalMembership).toBe(4);
      expect(groups.today).toEqual([dueToday]);
      expect(groups.overdue).toEqual([dueYesterday]);
      expect(groups.upcoming).toEqual([dueTomorrow, unscheduled]);
    });
  });

  describe('showCompleted: false', () => {
    it('excludes every completed task from every group, regardless of due date', () => {
      const completedToday = task({ text: 'completed today', completed: true, dueDate: '2026-08-04' });
      const completedOverdue = task({ text: 'completed overdue', completed: true, dueDate: '2026-07-01' });
      const completedUnscheduled = task({ text: 'completed unscheduled', completed: true });

      const groups = groupTasks([completedToday, completedOverdue, completedUnscheduled], HIDDEN);

      expect(groups.today).toEqual([]);
      expect(groups.overdue).toEqual([]);
      expect(groups.upcoming).toEqual([]);
      expect(groups.unscheduled).toEqual([]);
    });
  });

  describe('showCompleted: true', () => {
    it('includes a completed task due today in `today`, alongside incomplete tasks', () => {
      const activeToday = task({ text: 'active today', dueDate: '2026-08-04' });
      const completedToday = task({ text: 'completed today', completed: true, dueDate: '2026-08-04' });

      const groups = groupTasks([completedToday, activeToday], SHOWN);

      // Today sorts alphabetically by title regardless of auto-sort
      // (every member shares today's date, so Group → Due date → Title
      // falls straight through to Title) — 'active today' < 'completed
      // today', independent of source order or completion state.
      expect(groups.today).toEqual([activeToday, completedToday]);
    });

    it('never puts a completed, past-due task into `overdue` — it falls into `upcoming` instead, same as before this section existed', () => {
      const completedOverdue = task({ text: 'completed overdue', completed: true, dueDate: '2026-07-20' });
      const incompleteOverdue = task({ text: 'incomplete overdue', dueDate: '2026-07-25' });

      const groups = groupTasks([completedOverdue, incompleteOverdue], SHOWN);

      expect(groups.overdue).toEqual([incompleteOverdue]);
      expect(groups.upcoming).toEqual([completedOverdue]);
    });

    it('buckets a completed task with no due date, or a past/future one, into upcoming/unscheduled the same way an incomplete task would (except overdue, which stays incomplete-only)', () => {
      const completedOverdue = task({ text: 'completed overdue', completed: true, dueDate: '2026-07-20' });
      const completedFuture = task({ text: 'completed future', completed: true, dueDate: '2026-09-01' });
      const completedUnscheduled = task({ text: 'completed unscheduled', completed: true });

      const groups = groupTasks(
        [completedFuture, completedUnscheduled, completedOverdue],
        SHOWN
      );

      expect(groups.overdue).toEqual([]);
      expect(groups.upcoming).toEqual([completedOverdue, completedFuture, completedUnscheduled]);
      expect(groups.unscheduled).toEqual([completedUnscheduled]);
    });
  });

  describe('autoSortCompleted', () => {
    it('off: Today still sorts alphabetically by title — auto-sort only governs completed-last, not this ordering', () => {
      const completed = task({ text: 'completed', completed: true, dueDate: '2026-08-04' });
      const active1 = task({ text: 'active 1', dueDate: '2026-08-04' });
      const active2 = task({ text: 'active 2', dueDate: '2026-08-04' });

      const groups = groupTasks([completed, active1, active2], SHOWN);

      expect(groups.today).toEqual([active1, active2, completed]);
    });

    it('on: moves every completed task in Today to the bottom, below every incomplete one', () => {
      const completed = task({ text: 'completed', completed: true, dueDate: '2026-08-04' });
      const active1 = task({ text: 'active 1', dueDate: '2026-08-04' });
      const active2 = task({ text: 'active 2', dueDate: '2026-08-04' });

      const groups = groupTasks([completed, active1, active2], SHOWN_SORTED);

      expect(groups.today).toEqual([active1, active2, completed]);
    });

    it('on: moves every completed task in Upcoming to the bottom, preserving incomplete task ordering above it (Overdue is unaffected — it never holds a completed task)', () => {
      const completedPastDue = task({ text: 'completed past due', completed: true, dueDate: '2026-07-01' });
      const incompleteOverdue = task({ text: 'overdue', dueDate: '2026-07-20' });
      const future = task({ text: 'future', dueDate: '2026-09-01' });

      const groups = groupTasks([future, completedPastDue, incompleteOverdue], SHOWN_SORTED);

      expect(groups.overdue).toEqual([incompleteOverdue]);
      expect(groups.upcoming).toEqual([future, completedPastDue]);
    });

    it('on, showCompleted off: no completed tasks are present to sort, overdue/upcoming ordering is unaffected', () => {
      const completed = task({ text: 'completed', completed: true, dueDate: '2026-07-01' });
      const overdue = task({ text: 'overdue', dueDate: '2026-07-20' });

      const groups = groupTasks([overdue, completed], {
        showCompleted: false,
        autoSortCompleted: true,
      });

      expect(groups.overdue).toEqual([overdue]);
      expect(groups.upcoming).toEqual([]);
    });
  });

  it('DEFAULT_TASK_DISPLAY_CONFIG shows completed tasks without auto-sorting them', () => {
    expect(DEFAULT_TASK_DISPLAY_CONFIG).toEqual({ showCompleted: true, autoSortCompleted: false });
  });

  describe('ordering: Group → Due date → Title', () => {
    it('sorts Today alphabetically by title, case-insensitively, regardless of source order', () => {
      const write = task({ text: 'Write notes', dueDate: '2026-08-04' });
      const buy = task({ text: 'buy groceries', dueDate: '2026-08-04' });
      const call = task({ text: 'Call John', dueDate: '2026-08-04' });
      const finish = task({ text: 'finish report', dueDate: '2026-08-04' });

      const groups = groupTasks([write, buy, call, finish], SHOWN);

      expect(groups.today).toEqual([buy, call, finish, write]);
    });

    it('sorts Overdue by date ascending, then alphabetically within the same date', () => {
      const jul29 = task({ text: 'Submit invoice', dueDate: '2026-07-29' });
      const jul28Update = task({ text: 'Update docs', dueDate: '2026-07-28' });
      const jul28Fix = task({ text: 'Fix bug', dueDate: '2026-07-28' });

      const groups = groupTasks([jul29, jul28Update, jul28Fix], SHOWN);

      expect(groups.overdue).toEqual([jul28Fix, jul28Update, jul29]);
    });

    it("sorts Upcoming's scheduled tasks by date ascending, then alphabetically within the same date, unscheduled tasks keeping their own relative order after", () => {
      const oct5 = task({ text: 'Finish proposal', dueDate: '2026-10-05' });
      const oct3Call = task({ text: 'Call John', dueDate: '2026-10-03' });
      const oct3Buy = task({ text: 'Buy tickets', dueDate: '2026-10-03' });
      const unscheduledB = task({ text: 'zzz unscheduled' });
      const unscheduledA = task({ text: 'aaa unscheduled' });

      const groups = groupTasks(
        [oct5, oct3Call, oct3Buy, unscheduledB, unscheduledA],
        SHOWN
      );

      expect(groups.upcoming).toEqual([
        oct3Buy,
        oct3Call,
        oct5,
        unscheduledB,
        unscheduledA,
      ]);
    });

    it('breaks a title tie by preserving the tasks\' existing relative order', () => {
      const first = task({ text: 'Same title', dueDate: '2026-08-04' });
      const second = task({ text: 'Same title', dueDate: '2026-08-04' });

      const groups = groupTasks([first, second], SHOWN);

      expect(groups.today).toEqual([first, second]);
    });

    it('sorts by the displayed title (bare due-date mention hidden), not the raw source text', () => {
      // Both share dueDate 2026-08-04 via a bare mention in `text` — the
      // sidebar hides that one occurrence (formatTaskTitle), so the
      // visible titles are 'Alpha task' and 'Zebra task'; the raw `text`
      // strings alone (with the date still inline) would sort the other
      // way if this compared `text` directly instead of the formatted title.
      const zebra = task({ text: 'Zebra task @2026-08-04', dueDate: '2026-08-04' });
      const alpha = task({ text: 'Alpha task @2026-08-04', dueDate: '2026-08-04' });

      const groups = groupTasks([zebra, alpha], SHOWN);

      expect(groups.today).toEqual([alpha, zebra]);
    });
  });
});

describe('groupTasks over a Daily Note\'s tasks (ADR-044)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6)); // 2026-10-06
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifies by explicit due date only: living in today\'s Daily Note never makes a task Today', () => {
    const todaysNote = {
      id: 'daily',
      type: 'daily-note',
      path: '/vault/Daily Notes/2026/October/2026-10-06.md',
      analysis: {
        tasks: [
          task({ sourcePageId: 'daily', text: 'no date' }),
          task({ sourcePageId: 'daily', text: 'due today', dueDate: '2026-10-06' }),
          task({ sourcePageId: 'daily', text: 'due later', dueDate: '2026-10-08' }),
          task({ sourcePageId: 'daily', text: 'was due', dueDate: '2026-10-01' }),
        ],
      },
    } as unknown as Page;

    const groups = groupTasks(new TaskBuilder().build([todaysNote]), SHOWN);

    expect(groups.today.map((t) => t.text)).toEqual(['due today']);
    expect(groups.overdue.map((t) => t.text)).toEqual(['was due']);
    expect(groups.upcoming.map((t) => t.text)).toContain('due later');
    expect(groups.unscheduled.map((t) => t.text)).toEqual(['no date']);
  });
});
