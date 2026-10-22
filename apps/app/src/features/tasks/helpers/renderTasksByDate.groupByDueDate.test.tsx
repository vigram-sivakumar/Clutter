// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderTasksByDate } from './renderTasksByDate';
import { formatTaskDueDate, formatTaskDueDateLong } from './formatTaskDueDate';
import type { TaskExpansionKey } from './groupTasks';
import { Workspace } from '@core/workspace/Workspace';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import { pinDateFormat } from '@shared/testing/pinDateFormat';

pinDateFormat('full');

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
});

let offset = 0;
function task(text: string, dueDate?: string, overrides: Partial<TaskOccurrence> = {}): TaskOccurrence {
  return { sourcePageId: 'page-1', completed: false, text, dueDate, startOffset: offset++, ...overrides };
}

// With an item limit of 2: Overdue 28 Jul has three (over), 1 Aug has two (at the limit); Today has three; Upcoming
// 10 Aug has three, 12 Aug has one; one undated task.
const TASKS = [
  task('d2', '2026-08-01'),
  task('c3', '2026-07-28'),
  task('c1', '2026-07-28'),
  task('d1', '2026-08-01'),
  task('c2', '2026-07-28'),
  task('t3', '2026-08-04'),
  task('t1', '2026-08-04'),
  task('t2', '2026-08-04'),
  task('v1', '2026-08-12'),
  task('u3', '2026-08-10'),
  task('u1', '2026-08-10'),
  task('u2', '2026-08-10'),
  task('n1'),
];

function Harness({ grouped, limit = 2, tasks = TASKS, onToggleComplete = vi.fn() }: {
  grouped?: boolean;
  limit?: number;
  tasks?: readonly TaskOccurrence[];
  onToggleComplete?: (task: TaskOccurrence) => void;
}) {
  const [expanded, setExpanded] = useState<readonly TaskExpansionKey[]>([]);
  return (
    <>
      {renderTasksByDate({
        tasks,
        workspace: new Workspace(),
        onToggleComplete,
        onOpenTask: vi.fn(),
        onChangeDueDate: vi.fn(),
        onDuplicateTask: vi.fn(),
        onDeleteTask: vi.fn(),
        groupTasksByDueDate: grouped,
        itemLimit: limit,
        expandedGroups: expanded,
        onToggleGroup: (key) =>
          setExpanded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])),
      })}
    </>
  );
}

function mount(props: Parameters<typeof Harness>[0] = {}) {
  const view = render(<Harness {...props} />);
  const section = (title: string) =>
    [...view.container.querySelectorAll<HTMLElement>('.section-header__title')]
      .find((el) => el.textContent === title)!
      .closest<HTMLElement>('.section')!;
  return { ...view, section };
}

const titles = (root: ParentNode) => [...root.querySelectorAll('.task-title')].map((el) => el.textContent);
const dateGroups = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('.section .section')];
const headings = (root: ParentNode) =>
  dateGroups(root).map((group) => group.querySelector('.section-header__title')!.textContent);
const moreRow = (root: HTMLElement) => root.querySelector('.show-more-entry');

describe('ungrouped (Group by due date off)', () => {
  it('keeps Today, Overdue and Upcoming as flat lists in their existing order, with Unscheduled apart', () => {
    const { section } = mount({ limit: Infinity });

    expect(titles(section('Today'))).toEqual(['t1', 't2', 't3']);
    expect(titles(section('Overdue'))).toEqual(['c1', 'c2', 'c3', 'd1', 'd2']);
    expect(titles(section('Upcoming'))).toEqual(['u1', 'u2', 'u3', 'v1']);
    expect(dateGroups(section('Overdue'))).toHaveLength(0);
  });

  it('applies the limit to each section on its own, with "N more" only where a section is over it', () => {
    const { section } = mount({ limit: 2 });

    expect(titles(section('Today'))).toEqual(['t1', 't2']);
    expect(within(section('Today')).getByText('1 more')).toBeInTheDocument();
    expect(titles(section('Overdue'))).toEqual(['c1', 'c2']);
    expect(within(section('Overdue')).getByText('3 more')).toBeInTheDocument();
    expect(titles(section('Upcoming'))).toEqual(['u1', 'u2']);
    expect(within(section('Upcoming')).getByText('2 more')).toBeInTheDocument();
  });

  it('shows no "N more" row for a section at or under the limit', () => {
    const { section } = mount({ limit: 5 });

    expect(moreRow(section('Today'))).toBeNull();
    expect(moreRow(section('Overdue'))).toBeNull();
    expect(moreRow(section('Upcoming'))).toBeNull();
  });

  it('expands one section without expanding another', () => {
    const { section } = mount({ limit: 2 });

    fireEvent.click(within(section('Overdue')).getByText('3 more'));

    expect(titles(section('Overdue'))).toEqual(['c1', 'c2', 'c3', 'd1', 'd2']);
    expect(within(section('Overdue')).getByText('Show less')).toBeInTheDocument();
    expect(titles(section('Today'))).toEqual(['t1', 't2']);
    expect(titles(section('Upcoming'))).toEqual(['u1', 'u2']);
  });

  it('keeps each row’s due date in its trailing slot (Today’s date is never shown)', () => {
    const { section } = mount({ limit: Infinity });

    expect([...section('Overdue').querySelectorAll('.task__due-date')].map((el) => el.textContent)).toEqual([
      formatTaskDueDate('2026-07-28'),
      formatTaskDueDate('2026-07-28'),
      formatTaskDueDate('2026-07-28'),
      formatTaskDueDate('2026-08-01'),
      formatTaskDueDate('2026-08-01'),
    ]);
    expect(section('Upcoming').querySelectorAll('.task__due-date')).toHaveLength(4);
  });
});

describe('grouped (Group by due date on)', () => {
  it('keeps the top-level sections, and groups each one’s tasks by date, oldest first', () => {
    const { section } = mount({ grouped: true, limit: Infinity });

    expect(headings(section('Overdue'))).toEqual([formatTaskDueDateLong('2026-07-28'), formatTaskDueDateLong('2026-08-01')]);
    expect(dateGroups(section('Overdue')).map(titles)).toEqual([['c1', 'c2', 'c3'], ['d1', 'd2']]);
    expect(dateGroups(section('Upcoming')).map(titles)).toEqual([['u1', 'u2', 'u3'], ['v1']]);
    // Today is a single date, so it is not grouped: a flat list under its own title.
    expect(dateGroups(section('Today'))).toHaveLength(0);
    expect(titles(section('Today'))).toEqual(['t1', 't2', 't3']);
  });

  it('heads each group with the date in the app’s existing long labels', () => {
    const { section } = mount({ grouped: true, limit: Infinity });

    expect(headings(section('Overdue'))).toEqual(['28 July', '1 August']);
    expect(headings(section('Upcoming'))).toEqual(['10 August', '12 August']);
  });

  it('sorts the date groups chronologically even when a section’s own order interleaves dates', () => {
    // A completed, past-due task falls into Upcoming; Auto-sort completed would move it away from its same-date siblings.
    const tasks = [
      task('a', '2026-08-12'),
      task('b', '2026-08-10', { completed: true }),
      task('c', '2026-08-12'),
      task('d', '2026-08-10'),
    ];
    const { section } = mount({ grouped: true, limit: Infinity, tasks });

    expect(headings(section('Upcoming'))).toEqual(['10 August', '12 August']);
    expect(dateGroups(section('Upcoming')).map(titles)).toEqual([['b', 'd'], ['a', 'c']]);
  });

  it('applies the limit to each date group on its own, with "N more" only on a group over it', () => {
    const { section } = mount({ grouped: true, limit: 2 });
    const [jul28, aug1] = dateGroups(section('Overdue'));

    expect(titles(jul28!)).toEqual(['c1', 'c2']);
    expect(within(jul28!).getByText('1 more')).toBeInTheDocument();
    expect(titles(aug1!)).toEqual(['d1', 'd2']);
    expect(moreRow(aug1!)).toBeNull();
    // No section-level row either: the section's own list is its date groups.
    expect(section('Overdue').querySelectorAll(':scope > .section__content > .show-more-entry')).toHaveLength(0);
  });

  it('expands one date group without expanding another', () => {
    const { section } = mount({ grouped: true, limit: 2 });

    const [upcomingAug10, upcomingAug12] = dateGroups(section('Upcoming'));
    fireEvent.click(within(upcomingAug10!).getByText('1 more'));

    expect(titles(dateGroups(section('Upcoming'))[0]!)).toEqual(['u1', 'u2', 'u3']);
    expect(titles(upcomingAug12!)).toEqual(['v1']);
    // The same-numbered group in another section stays as it was.
    expect(titles(dateGroups(section('Overdue'))[0]!)).toEqual(['c1', 'c2']);
    expect(titles(section('Today'))).toEqual(['t1', 't2']);
  });

  it('leaves the redundant due date out of every grouped row, keeping the rest of the row', () => {
    const { section } = mount({ grouped: true, limit: Infinity });

    for (const name of ['Overdue', 'Upcoming']) {
      expect(section(name).querySelectorAll('.task__due-date')).toHaveLength(0);
    }
    expect(within(section('Overdue')).getAllByRole('checkbox')).toHaveLength(5);
  });

  it('does not group Today, which keeps its flat list and its own limit and "N more"', () => {
    const { section } = mount({ grouped: true, limit: 2 });

    expect(dateGroups(section('Today'))).toHaveLength(0);
    expect(titles(section('Today'))).toEqual(['t1', 't2']);
    fireEvent.click(within(section('Today')).getByText('1 more'));
    expect(titles(section('Today'))).toEqual(['t1', 't2', 't3']);
  });

  it('keeps tasks without a due date flat in Unscheduled, as before, capped by the same limit', () => {
    const tasks = [task('n1'), task('n2'), task('n3'), task('x', '2026-08-10')];
    const { section } = mount({ grouped: true, limit: 2, tasks });

    // Unscheduled is hidden by the app's default display config only when the caller passes it; here every group shows.
    expect(dateGroups(section('Unscheduled'))).toHaveLength(0);
    expect(titles(section('Unscheduled'))).toEqual(['n1', 'n2']);
    expect(within(section('Unscheduled')).getByText('1 more')).toBeInTheDocument();
    expect(headings(section('Upcoming'))).toEqual(['10 August']);
  });

  it('keeps Today, Overdue and Upcoming membership the same as ungrouped', () => {
    const flat = mount({ limit: Infinity });
    const flatSets = ['Today', 'Overdue', 'Upcoming'].map((name) => titles(flat.section(name)));
    cleanup();
    const grouped = mount({ grouped: true, limit: Infinity });

    expect(['Today', 'Overdue', 'Upcoming'].map((name) => titles(grouped.section(name)))).toEqual(flatSets);
  });
});

describe('task row interactions are unchanged by grouping', () => {
  it('completing a grouped task calls onToggleComplete with that task', () => {
    const onToggleComplete = vi.fn();
    const { section } = mount({ grouped: true, limit: Infinity, onToggleComplete });

    const [first] = dateGroups(section('Overdue'));
    act(() => {
      fireEvent.click(within(first!).getAllByRole('checkbox')[0]!);
    });

    expect(onToggleComplete).toHaveBeenCalledTimes(1);
    expect(onToggleComplete.mock.calls[0]![0]).toMatchObject({ text: 'c1', dueDate: '2026-07-28' });
  });
});
