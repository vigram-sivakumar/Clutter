// @vitest-environment jsdom

import { cleanup, render, fireEvent, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderTasksByDate } from './renderTasksByDate';
import { Workspace } from '@core/workspace/Workspace';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TaskOccurrence } from '@core/vault/models/occurrences';

afterEach(() => {
  cleanup();
});

function task(overrides: Partial<TaskOccurrence>): TaskOccurrence {
  return {
    sourcePageId: 'page-1',
    text: 'task',
    completed: false,
    ...overrides,
  };
}

function fakeNavigation(): NavigationRouter {
  return {
    openTasksToday: vi.fn(),
    openTasksUpcoming: vi.fn(),
    openTasksCompleted: vi.fn(),
  } as unknown as NavigationRouter;
}

describe('renderTasksByDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onToggleComplete with the clicked task when its checkbox is clicked', () => {
    const dueToday = task({ text: 'Review designs', dueDate: '2026-08-04' });
    const onToggleComplete = vi.fn();
    const onOpenTask = vi.fn();

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [dueToday],
          workspace: new Workspace(),
          onToggleComplete,
          onOpenTask,
          navigation: fakeNavigation(),
        })}
      </>
    );

    const row = getByText('Review designs').closest('.entry') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox'));

    expect(onToggleComplete).toHaveBeenCalledWith(dueToday);
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it('calls onOpenTask, not onToggleComplete, when the task row itself is clicked', () => {
    const dueToday = task({ text: 'Review designs', dueDate: '2026-08-04' });
    const onToggleComplete = vi.fn();
    const onOpenTask = vi.fn();

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [dueToday],
          workspace: new Workspace(),
          onToggleComplete,
          onOpenTask,
          navigation: fakeNavigation(),
        })}
      </>
    );

    fireEvent.click(getByText('Review designs'));

    expect(onOpenTask).toHaveBeenCalledWith(dueToday);
    expect(onToggleComplete).not.toHaveBeenCalled();
  });

  it('does not render a trailing due-date label on a Today-section row', () => {
    const dueToday = task({ text: 'Review designs', dueDate: '2026-08-04' });

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [dueToday],
          workspace: new Workspace(),
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation: fakeNavigation(),
        })}
      </>
    );

    const row = getByText('Review designs').closest('.entry') as HTMLElement;
    expect(within(row).queryByText(/Today|Tomorrow|Yesterday|\d/)).toBeNull();
  });

  it('shows the completed-today accordion header with a count', () => {
    const completedToday = task({
      text: 'Submit expenses',
      completed: true,
      completedAt: '2026-08-04',
    });

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [completedToday],
          workspace: new Workspace(),
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation: fakeNavigation(),
        })}
      </>
    );

    // "Completed" (the accordion row's own label) and the count (a
    // separate CountBadge in its trailing slot) are two distinct DOM
    // nodes, not one "1 Completed" text node — assert both independently
    // within the same row rather than a single combined-text query.
    const header = getByText('Completed').closest('.entry') as HTMLElement;
    expect(within(header).getByText('1')).not.toBeNull();
  });

  it('shows the due date for a completed-today task whose due date is not today', () => {
    const completedToday = task({
      text: 'Submit expenses',
      completed: true,
      completedAt: '2026-08-04',
      dueDate: '2026-08-01',
    });

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [completedToday],
          workspace: new Workspace(),
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation: fakeNavigation(),
        })}
      </>
    );

    const row = getByText('Submit expenses').closest('.entry') as HTMLElement;
    expect(within(row).getByText('1 Aug')).not.toBeNull();
  });

  it('does not render a due-date label for a completed-today task whose due date is also today', () => {
    const completedToday = task({
      text: 'Submit expenses',
      completed: true,
      completedAt: '2026-08-04',
      dueDate: '2026-08-04',
    });

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [completedToday],
          workspace: new Workspace(),
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation: fakeNavigation(),
        })}
      </>
    );

    const row = getByText('Submit expenses').closest('.entry') as HTMLElement;
    expect(within(row).queryByText(/Today|Tomorrow|Yesterday|\d/)).toBeNull();
  });

  it('renders a due-date label in the Upcoming section', () => {
    const dueSoon = task({ text: 'Book flights', dueDate: '2026-08-05' });

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [dueSoon],
          workspace: new Workspace(),
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation: fakeNavigation(),
        })}
      </>
    );

    expect(getByText('Tomorrow')).not.toBeNull();
  });

  /**
   * Component-level coverage for every relative-label case, through the
   * real render path (renderTasksByDate -> renderTaskRow ->
   * formatTaskDueDate -> formatDateDisplay) rather than only the isolated
   * formatTaskDueDate unit tests — closing the gap this file only
   * previously covered for "Tomorrow" and the different-year case.
   * System time is faked to Tuesday, 2026-08-04.
   */
  describe('relative due-date labels, through the full render path', () => {
    function renderDueDateLabelFor(dueDate: string): string {
      const { getByText } = render(
        <>
          {renderTasksByDate({
            tasks: [task({ text: 'Some task', dueDate })],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      const row = getByText('Some task').closest('.entry') as HTMLElement;
      // The due-date label is the only text besides the task's own title
      // inside the row's trailing metadata slot.
      return within(row).getByText(/./, { selector: '.task__due-date' }).textContent ?? '';
    }

    it('yesterday', () => {
      expect(renderDueDateLabelFor('2026-08-03')).toBe('Yesterday');
    });

    it('a weekday within the current week (Friday)', () => {
      expect(renderDueDateLabelFor('2026-08-07')).toBe('Friday');
    });

    it('same year, outside the current week', () => {
      expect(renderDueDateLabelFor('2026-08-21')).toBe('21 Aug');
    });

    it('a different year', () => {
      expect(renderDueDateLabelFor('2027-08-21')).toBe('21 Aug 2027');
    });
  });

  describe('inline bare-date deduplication in the title, through the full render path', () => {
    it('removes the bare date matching dueDate from the title, leaving the trailing label as the only date shown', () => {
      const task1 = task({
        text: 'Clean the Trash @2026-08-21',
        dueDate: '2026-08-21',
      });

      const { getByText, queryByText } = render(
        <>
          {renderTasksByDate({
            tasks: [task1],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      expect(getByText('Clean the Trash')).not.toBeNull();
      expect(queryByText(/@2026-08-21/)).toBeNull();

      const row = getByText('Clean the Trash').closest('.entry') as HTMLElement;
      expect(within(row).getByText('21 Aug')).not.toBeNull();
    });

    it('only removes the bare date matching dueDate when the title has multiple dates, formatting the other one semantically', () => {
      const task1 = task({
        text: 'Moved from @2026-08-01 to @2026-08-21',
        dueDate: '2026-08-21',
      });

      const { getByText } = render(
        <>
          {renderTasksByDate({
            tasks: [task1],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      // System time is faked to 2026-08-04 — @2026-08-01 is outside the
      // current week, so it renders as "@1 August" (compact mode, same
      // formatter the editor's at-rest DateWidget uses).
      expect(getByText('Moved from @1 August to')).not.toBeNull();
    });

    it('formats two tasks with different bare dates independently in the same render, without cross-contamination', () => {
      // System time is faked to 2026-08-04 (Tuesday).
      const taskA = task({
        text: 'Review @2026-08-20 and compare with @2026-08-22',
        dueDate: '2026-08-20',
      });
      const taskB = task({
        text: 'Prepare slides @2026-08-05 before @2026-08-07',
        dueDate: '2026-08-05',
      });

      const { getByText } = render(
        <>
          {renderTasksByDate({
            tasks: [taskA, taskB],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      // Task A: its own due date (@2026-08-20) is hidden from the title;
      // its other bare date (@2026-08-22, outside the current week, same
      // year) is reformatted via the shared compact formatter; the
      // trailing badge (condensed mode) still shows its due date.
      const rowA = getByText(
        'Review and compare with @22 August'
      ).closest('.entry') as HTMLElement;
      expect(within(rowA).getByText('20 Aug')).not.toBeNull();

      // Task B: its own due date (@2026-08-05) is hidden from the title;
      // its other bare date (@2026-08-07, a weekday within the current
      // week) is reformatted as its weekday name; the trailing badge
      // still shows its own (different) due date — neither task's title
      // or badge leaks into the other's.
      const rowB = getByText('Prepare slides before @Friday').closest(
        '.entry'
      ) as HTMLElement;
      expect(within(rowB).getByText('Tomorrow')).not.toBeNull();
    });

    it('leaves the title unchanged when there is no inline bare date to remove', () => {
      const task1 = task({
        text: 'Clean the Trash',
        dueDate: '2026-08-21',
      });

      const { getByText } = render(
        <>
          {renderTasksByDate({
            tasks: [task1],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      expect(getByText('Clean the Trash')).not.toBeNull();
    });
  });

  it('navigates to Today when the Today section header is clicked', () => {
    const navigation = fakeNavigation();

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [],
          workspace: new Workspace(),
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation,
        })}
      </>
    );

    fireEvent.click(getByText('Today'));

    expect(navigation.openTasksToday).toHaveBeenCalled();
  });

  it('navigates to Upcoming when the Upcoming section header is clicked', () => {
    const navigation = fakeNavigation();
    // The Upcoming section (renderTasksByDate's `upcoming.length > 0` guard)
    // only renders at all once there's an upcoming task — an empty tasks
    // list never produces an "Everything else" header to click.
    const dueSoon = task({ text: 'Book flights', dueDate: '2026-08-05' });

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [dueSoon],
          workspace: new Workspace(),
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation,
        })}
      </>
    );

    fireEvent.click(getByText('Everything else'));

    expect(navigation.openTasksUpcoming).toHaveBeenCalled();
  });

  it('navigates to Completed when the completed-today accordion row is clicked, without toggling it', () => {
    const navigation = fakeNavigation();
    const completedToday = task({
      text: 'Submit expenses',
      completed: true,
      completedAt: '2026-08-04',
    });
    const workspace = new Workspace();

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [completedToday],
          workspace,
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation,
        })}
      </>
    );

    // See the "shows the completed-today accordion header with a count"
    // test above — "Completed" and its count are separate DOM nodes.
    const header = getByText('Completed').closest('.entry') as HTMLElement;
    fireEvent.click(header);

    expect(navigation.openTasksCompleted).toHaveBeenCalled();
    expect(workspace.isSectionExpanded('tasks-today-completed')).toBe(true);
  });

  it('toggles the completed-today accordion when its caret is clicked, without navigating', () => {
    const navigation = fakeNavigation();
    const completedToday = task({
      text: 'Submit expenses',
      completed: true,
      completedAt: '2026-08-04',
    });
    const workspace = new Workspace();

    const { getByText } = render(
      <>
        {renderTasksByDate({
          tasks: [completedToday],
          workspace,
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          navigation,
        })}
      </>
    );

    // See the "shows the completed-today accordion header with a count"
    // test above — "Completed" and its count are separate DOM nodes.
    const header = getByText('Completed').closest('.entry') as HTMLElement;
    fireEvent.click(within(header).getByRole('button'));

    expect(navigation.openTasksCompleted).not.toHaveBeenCalled();
    expect(workspace.isSectionExpanded('tasks-today-completed')).toBe(false);
  });
});
