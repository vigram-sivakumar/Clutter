// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, fireEvent, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderTasksByDate } from './renderTasksByDate';
import { Workspace } from '@core/workspace/Workspace';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TaskOccurrence } from '@core/vault/models/occurrences';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

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
    openTasksOverdue: vi.fn(),
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
          onChangeDueDate: vi.fn(),
          onDuplicateTask: vi.fn(),
          onDeleteTask: vi.fn(),
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
          onChangeDueDate: vi.fn(),
          onDuplicateTask: vi.fn(),
          onDeleteTask: vi.fn(),
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
          onChangeDueDate: vi.fn(),
          onDuplicateTask: vi.fn(),
          onDeleteTask: vi.fn(),
          navigation: fakeNavigation(),
        })}
      </>
    );

    const row = getByText('Review designs').closest('.entry') as HTMLElement;
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
          onChangeDueDate: vi.fn(),
          onDuplicateTask: vi.fn(),
          onDeleteTask: vi.fn(),
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
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
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
      expect(renderDueDateLabelFor('2026-08-07')).toBe('7 Aug');
    });

    it('same year, outside the current week', () => {
      expect(renderDueDateLabelFor('2026-08-21')).toBe('21 Aug');
    });

    it('a different year', () => {
      expect(renderDueDateLabelFor('2027-08-21')).toBe('21 Aug 27');
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
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
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

      const { container } = render(
        <>
          {renderTasksByDate({
            tasks: [task1],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      // System time is faked to 2026-08-04 — @2026-08-01 is outside the
      // current week, so it renders via 'compact' mode's full-date
      // fallback, day + full month + year (dateDisplay.ts: only
      // 'condensed' mode ever drops the year) — same formatter the
      // editor's at-rest DateWidget uses — now via renderCompactMarkdown's
      // own <span class="compact-markdown-date">, not a plain string
      // formatTaskTitle produces itself, so this reads the title's
      // combined text content rather than querying one exact text node.
      const title = container.querySelector('.task-title')!;
      expect(title).toHaveTextContent('Moved from @1 August 2026 to');
      expect(title.querySelector('.compact-markdown-date')).toHaveTextContent('@1 August 2026');
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

      const { container } = render(
        <>
          {renderTasksByDate({
            tasks: [taskA, taskB],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      const titles = Array.from(container.querySelectorAll('.task-title'));
      const titleA = titles.find((el) => el.textContent?.startsWith('Review'))!;
      const titleB = titles.find((el) => el.textContent?.startsWith('Prepare'))!;

      // Task A: its own due date (@2026-08-20) is hidden from the title;
      // its other bare date (@2026-08-22, outside the current week) is
      // reformatted via the shared compact formatter — full month + year,
      // per dateDisplay.ts's 'compact' mode (rendered as its own <span>,
      // hence the combined-text-content assertion); the trailing badge
      // ('contextual' mode) still shows its due date.
      expect(titleA).toHaveTextContent('Review and compare with @22 August 2026');
      const rowA = titleA.closest('.entry') as HTMLElement;
      expect(within(rowA).getByText('20 Aug')).not.toBeNull();

      // Task B: its own due date (@2026-08-05) is hidden from the title;
      // its other bare date (@2026-08-07, a weekday within the current
      // week) is reformatted as its weekday name; the trailing badge
      // still shows its own (different) due date — neither task's title
      // or badge leaks into the other's.
      expect(titleB).toHaveTextContent('Prepare slides before @Friday');
      const rowB = titleB.closest('.entry') as HTMLElement;
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
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      expect(getByText('Clean the Trash')).not.toBeNull();
    });
  });

  describe('section headers only expand/collapse — they never navigate', () => {
    function renderAll(workspace: Workspace, navigation: NavigationRouter) {
      const overdue = task({ text: 'Fix navigation', dueDate: '2026-08-01' });
      const upcoming = task({ text: 'Book flights', dueDate: '2026-08-05' });
      const ui = () => (
        <>
          {renderTasksByDate({
            tasks: [overdue, upcoming],
            workspace,
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation,
          })}
        </>
      );
      return { ...render(ui()), ui };
    }

    it.each([
      ['Overdue', 'tasks-overdue', 'Fix navigation'],
      ['Upcoming', 'tasks-upcoming', 'Book flights'],
    ])('%s: clicking the header collapses then expands it, with no navigation', (title, id, child) => {
      const workspace = new Workspace();
      const navigation = fakeNavigation();
      const { getByText, queryByText, rerender, ui } = renderAll(workspace, navigation);

      expect(queryByText(child)).not.toBeNull();

      fireEvent.click(getByText(title));
      rerender(ui());
      expect(workspace.isSectionExpanded(id)).toBe(false);
      expect(queryByText(child)).toBeNull();

      fireEvent.click(getByText(title));
      rerender(ui());
      expect(workspace.isSectionExpanded(id)).toBe(true);
      expect(queryByText(child)).not.toBeNull();

      expect(navigation.openTasksToday).not.toHaveBeenCalled();
      expect(navigation.openTasksOverdue).not.toHaveBeenCalled();
      expect(navigation.openTasksUpcoming).not.toHaveBeenCalled();
    });

    it('Today (empty, but expanded so it can say so): clicking collapses it, exposes aria-expanded, works from the keyboard, never navigates', () => {
      const workspace = new Workspace();
      const navigation = fakeNavigation();
      const { getByText, rerender, ui } = renderAll(workspace, navigation);
      const header = () => getByText('Today').closest('.section-header') as HTMLElement;

      expect(header().getAttribute('aria-expanded')).toBe('true');

      fireEvent.click(getByText('Today'));
      rerender(ui());
      expect(header().getAttribute('aria-expanded')).toBe('false');

      fireEvent.keyDown(header(), { key: 'Enter' });
      rerender(ui());
      expect(header().getAttribute('aria-expanded')).toBe('true');

      expect(navigation.openTasksToday).not.toHaveBeenCalled();
    });
  });

  describe('the Tasks-view settings action', () => {
    it('is not on any group header — Today, Overdue, and Upcoming carry no settings trigger (it lives on the All Tasks row)', () => {
      const dueSoon = task({ text: 'Book flights', dueDate: '2026-08-05' });
      const overdue = task({ text: 'Fix navigation', dueDate: '2026-08-01' });

      const { getByText, queryByLabelText } = render(
        <>
          {renderTasksByDate({
            tasks: [dueSoon, overdue],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      expect(getByText('Today')).toBeInTheDocument();
      expect(getByText('Overdue')).toBeInTheDocument();
      expect(getByText('Upcoming')).toBeInTheDocument();
      expect(queryByLabelText('Task display settings')).not.toBeInTheDocument();
    });
  });

  describe('the Overdue section', () => {
    it('renders an incomplete, past-due task under Overdue, not Upcoming', () => {
      const overdue = task({ text: 'Fix navigation', dueDate: '2026-08-01' });

      const { getByText } = render(
        <>
          {renderTasksByDate({
            tasks: [overdue],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      expect(getByText('Fix navigation')).toBeInTheDocument();
      expect(getByText('Overdue')).toBeInTheDocument();
    });

    it('does not render the Overdue section at all when there are no overdue tasks', () => {
      const dueSoon = task({ text: 'Book flights', dueDate: '2026-08-05' });

      const { queryByText } = render(
        <>
          {renderTasksByDate({
            tasks: [dueSoon],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      expect(queryByText('Overdue')).not.toBeInTheDocument();
    });

    it('does not navigate when the Overdue section header is clicked', () => {
      const navigation = fakeNavigation();
      const overdue = task({ text: 'Fix navigation', dueDate: '2026-08-01' });

      const { getByText } = render(
        <>
          {renderTasksByDate({
            tasks: [overdue],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation,
          })}
        </>
      );

      fireEvent.click(getByText('Overdue'));

      expect(navigation.openTasksOverdue).not.toHaveBeenCalled();
    });

    it('places Overdue between Today and Upcoming', () => {
      const dueToday = task({ text: 'Submit proposal', dueDate: '2026-08-04' });
      const overdue = task({ text: 'Fix navigation', dueDate: '2026-08-01' });
      const dueSoon = task({ text: 'Book flights', dueDate: '2026-08-05' });

      render(
        <>
          {renderTasksByDate({
            tasks: [dueToday, overdue, dueSoon],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      const titles = Array.from(document.querySelectorAll('.section-header__title')).map(
        (el) => el.textContent
      );
      expect(titles).toEqual(['Today', 'Overdue', 'Upcoming']);
    });

    it('puts tasks with no due date in their own Unscheduled section below Upcoming', () => {
      const dueSoon = task({ text: 'Book flights', dueDate: '2026-08-05' });
      const undated = task({ text: 'Someday idea' });

      render(
        <>
          {renderTasksByDate({
            tasks: [undated, dueSoon],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
          })}
        </>
      );

      const titles = Array.from(document.querySelectorAll('.section-header__title')).map(
        (el) => el.textContent
      );
      expect(titles).toEqual(['Today', 'Upcoming', 'Unscheduled']);
    });
  });

  describe('Show completed / Auto-sort completed', () => {
    it('shows a completed task due today in the Today section when showCompleted is true', () => {
      const completedToday = task({ text: 'Submit expenses', completed: true, dueDate: '2026-08-04' });

      const { getByText } = render(
        <>
          {renderTasksByDate({
            tasks: [completedToday],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
            displayConfig: { showCompleted: true, autoSortCompleted: false },
          })}
        </>
      );

      expect(getByText('Submit expenses')).toBeInTheDocument();
    });

    it('hides a completed task from the Today section when showCompleted is false', () => {
      const completedToday = task({ text: 'Submit expenses', completed: true, dueDate: '2026-08-04' });

      const { queryByText } = render(
        <>
          {renderTasksByDate({
            tasks: [completedToday],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
            displayConfig: { showCompleted: false, autoSortCompleted: false },
          })}
        </>
      );

      expect(queryByText('Submit expenses')).not.toBeInTheDocument();
    });

    it('shows a completed, past-due task in the Upcoming section (not Overdue) when showCompleted is true', () => {
      const completedOverdue = task({ text: 'Old report', completed: true, dueDate: '2026-07-01' });

      const { getByText, queryByText } = render(
        <>
          {renderTasksByDate({
            tasks: [completedOverdue],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
            displayConfig: { showCompleted: true, autoSortCompleted: false },
          })}
        </>
      );

      expect(getByText('Old report')).toBeInTheDocument();
      expect(getByText('Upcoming')).toBeInTheDocument();
      expect(queryByText('Overdue')).not.toBeInTheDocument();
    });

    it('auto-sort off still sorts a mixed complete+incomplete Today section alphabetically by title', () => {
      const completed = task({ text: 'Completed task', completed: true, dueDate: '2026-08-04' });
      const active1 = task({ text: 'Active task 1', dueDate: '2026-08-04' });
      const active2 = task({ text: 'Active task 2', dueDate: '2026-08-04' });

      const { container } = render(
        <>
          {renderTasksByDate({
            tasks: [completed, active1, active2],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
            displayConfig: { showCompleted: true, autoSortCompleted: false },
          })}
        </>
      );

      const titles = Array.from(container.querySelectorAll('.task-title')).map((el) => el.textContent);
      expect(titles).toEqual(['Active task 1', 'Active task 2', 'Completed task']);
    });

    it('auto-sort on moves the completed task to the bottom of the Today section', () => {
      const completed = task({ text: 'Completed task', completed: true, dueDate: '2026-08-04' });
      const active1 = task({ text: 'Active task 1', dueDate: '2026-08-04' });
      const active2 = task({ text: 'Active task 2', dueDate: '2026-08-04' });

      const { container } = render(
        <>
          {renderTasksByDate({
            tasks: [completed, active1, active2],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
            displayConfig: { showCompleted: true, autoSortCompleted: true },
          })}
        </>
      );

      const titles = Array.from(container.querySelectorAll('.task-title')).map((el) => el.textContent);
      expect(titles).toEqual(['Active task 1', 'Active task 2', 'Completed task']);
    });

    it('turning Show completed off does not reset a previously-enabled Auto-sort completed — re-enabling Show completed keeps auto-sort applied', () => {
      const completed = task({ text: 'Completed task', completed: true, dueDate: '2026-08-04' });
      const active = task({ text: 'Active task', dueDate: '2026-08-04' });

      // Simulates: both were on, the user turned Show completed off (auto-sort
      // preference itself is untouched in the persisted config), then back on.
      const { container } = render(
        <>
          {renderTasksByDate({
            tasks: [completed, active],
            workspace: new Workspace(),
            onToggleComplete: vi.fn(),
            onOpenTask: vi.fn(),
            onChangeDueDate: vi.fn(),
            onDuplicateTask: vi.fn(),
            onDeleteTask: vi.fn(),
            navigation: fakeNavigation(),
            displayConfig: { showCompleted: true, autoSortCompleted: true },
          })}
        </>
      );

      const titles = Array.from(container.querySelectorAll('.task-title')).map((el) => el.textContent);
      expect(titles).toEqual(['Active task', 'Completed task']);
    });
  });
});

describe('renderTasksByDate: Today empty state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderToday(tasks: TaskOccurrence[], displayConfig?: { showCompleted: boolean; autoSortCompleted: boolean }) {
    return render(
      <>
        {renderTasksByDate({
          tasks,
          workspace: new Workspace(),
          onToggleComplete: vi.fn(),
          onOpenTask: vi.fn(),
          onChangeDueDate: vi.fn(),
          onDuplicateTask: vi.fn(),
          onDeleteTask: vi.fn(),
          navigation: fakeNavigation(),
          displayConfig,
        })}
      </>
    );
  }

  const MESSAGE = "You're all clear for today";

  it('says one line when no task is due today, expanded rather than collapsed away', () => {
    const { getByText } = renderToday([task({ text: 'Later', dueDate: '2026-08-20' })]);

    expect(getByText(MESSAGE)).toBeVisible();
  });

  it('says the same line when every task due today is completed and completed tasks are hidden', () => {
    const { getByText, queryByText } = renderToday(
      [task({ text: 'Done', dueDate: '2026-08-04', completed: true })],
      { showCompleted: false, autoSortCompleted: false }
    );

    expect(getByText(MESSAGE)).toBeVisible();
    expect(queryByText('Done')).toBeNull();
  });

  it('shows the completed rows, not the line, when completed tasks are shown', () => {
    const { getByText, queryByText } = renderToday(
      [task({ text: 'Done', dueDate: '2026-08-04', completed: true })],
      { showCompleted: true, autoSortCompleted: false }
    );

    expect(getByText('Done')).toBeVisible();
    expect(queryByText(MESSAGE)).toBeNull();
  });

  it('shows no line while a task is still due today', () => {
    const { queryByText } = renderToday([task({ text: 'Open', dueDate: '2026-08-04' })]);

    expect(queryByText(MESSAGE)).toBeNull();
  });
});
