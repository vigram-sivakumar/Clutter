// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksCollectionBody } from './TasksCollectionBody';
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

describe('TasksCollectionBody', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders incomplete tasks due today for the tasks-today view', () => {
    const dueToday = task({ text: 'Review designs', dueDate: '2026-08-04' });
    const dueTomorrow = task({ text: 'Book flights', dueDate: '2026-08-05' });

    const { getByText, queryByText } = render(
      <TasksCollectionBody
        view="tasks-today"
        tasks={[dueToday, dueTomorrow]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(getByText('Review designs')).not.toBeNull();
    expect(queryByText('Book flights')).toBeNull();
  });

  it('renders future/unscheduled tasks for the tasks-upcoming view, excluding overdue and today', () => {
    const dueTomorrow = task({ text: 'Book flights', dueDate: '2026-08-05' });
    const dueToday = task({ text: 'Review designs', dueDate: '2026-08-04' });
    const overdue = task({ text: 'Fix navigation', dueDate: '2026-08-01' });

    const { getByText, queryByText } = render(
      <TasksCollectionBody
        view="tasks-upcoming"
        tasks={[dueTomorrow, dueToday, overdue]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(getByText('Book flights')).not.toBeNull();
    expect(queryByText('Review designs')).toBeNull();
    expect(queryByText('Fix navigation')).toBeNull();
  });

  it('renders only incomplete, past-due tasks for the tasks-overdue view', () => {
    const overdue = task({ text: 'Fix navigation', dueDate: '2026-08-01' });
    const dueToday = task({ text: 'Review designs', dueDate: '2026-08-04' });
    const dueTomorrow = task({ text: 'Book flights', dueDate: '2026-08-05' });
    const completedOverdue = task({
      text: 'Old report',
      completed: true,
      dueDate: '2026-07-01',
    });

    const { getByText, queryByText } = render(
      <TasksCollectionBody
        view="tasks-overdue"
        tasks={[overdue, dueToday, dueTomorrow, completedOverdue]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(getByText('Fix navigation')).not.toBeNull();
    expect(queryByText('Review designs')).toBeNull();
    expect(queryByText('Book flights')).toBeNull();
    expect(queryByText('Old report')).toBeNull();
  });

  it('renders every completed task, newest-completed-first, for the tasks-completed view', () => {
    const oldCompleted = task({
      text: 'Old completed',
      completed: true,
      completedAt: '2026-07-01',
    });
    const recentCompleted = task({
      text: 'Recent completed',
      completed: true,
      completedAt: '2026-08-04',
    });
    const incomplete = task({ text: 'Still open' });

    const { getByText, queryByText } = render(
      <TasksCollectionBody
        view="tasks-completed"
        tasks={[oldCompleted, recentCompleted, incomplete]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(getByText('Old completed')).not.toBeNull();
    expect(getByText('Recent completed')).not.toBeNull();
    expect(queryByText('Still open')).toBeNull();
  });

  it('renders every task, incomplete and completed, for the tasks-all view', () => {
    const incomplete = task({ text: 'Still open' });
    const completed = task({
      text: 'Done already',
      completed: true,
      completedAt: '2026-08-01',
    });

    const { getByText } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[incomplete, completed]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(getByText('Still open')).not.toBeNull();
    expect(getByText('Done already')).not.toBeNull();
  });

  it('renders a dated tasks-all row with its due date as plain text in the trailing slot: no pill, no calendar button, no More actions', () => {
    const { getByText, queryByRole, container } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[task({ text: 'Plan trip', dueDate: '2026-08-20' })]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(getByText('Plan trip')).not.toBeNull();
    expect(container.querySelector('.collection__bottom-spacer')).not.toBeNull();
    expect(container.querySelector('.collection-row__metadata')).toHaveTextContent('20 Aug 2026');
    expect(container.querySelector('.pill')).toBeNull();
    expect(queryByRole('button', { name: 'Add due date' })).toBeNull();
    expect(queryByRole('button', { name: /more actions/i })).toBeNull();
  });

  it('shows the source note as a wiki-link-style link in the trailing slot and opens it on click', () => {
    const onOpenTask = vi.fn();
    const target = task({ text: 'Plan trip', dueDate: '2026-08-20' });

    const { getByRole, container } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[target]}
        onToggleComplete={vi.fn()}
        onOpenTask={onOpenTask}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
        getSource={() => ({ label: 'Trips', icon: 'note', emoji: '✈️' })}
      />
    );

    // Not a pill, and it sits in the metadata (trailing) slot.
    expect(container.querySelector('.pill')).toBeNull();
    const link = container.querySelector('.collection-row__metadata .task-row__source');
    expect(link).toHaveTextContent('Trips');
    // Identity emoji first, like a WikiLink in the editor.
    expect(link!.querySelector('.task-row__source-icon')).toHaveTextContent('✈️');

    fireEvent.click(getByRole('link', { name: 'Open Trips' }));
    expect(onOpenTask).toHaveBeenCalledTimes(1);
    expect(onOpenTask).toHaveBeenCalledWith(target);
  });

  it('gives an undated tasks-all row an icon-only outline-fill calendar button that opens the calendar and assigns a due date, without opening the note', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    const onChangeDueDate = vi.fn();
    const onOpenTask = vi.fn();
    const target = task({ text: 'Someday' });

    const { getByRole, getByText, container } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[target]}
        onToggleComplete={vi.fn()}
        onOpenTask={onOpenTask}
        onChangeDueDate={onChangeDueDate}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
        getSource={() => ({ label: 'Trips', icon: 'note', emoji: null })}
      />
    );

    const button = getByRole('button', { name: 'Add due date' });
    expect(button).toHaveClass('button--outline-fill', 'button--icon', 'task-row__due-button');
    expect(button).toHaveTextContent('');
    expect(container.querySelector('.pill')).toBeNull();

    // Trailing order: calendar button, then the wiki link.
    const trailing = container.querySelector('.collection-row__metadata')!;
    expect(trailing.firstElementChild).toBe(button);
    expect(trailing.lastElementChild).toHaveClass('task-row__source');

    fireEvent.click(button);
    expect(onOpenTask).not.toHaveBeenCalled();

    fireEvent.click(getByText('15'));
    expect(onChangeDueDate).toHaveBeenCalledTimes(1);
    expect(onChangeDueDate.mock.calls[0]![0]).toBe(target);
    expect(typeof onChangeDueDate.mock.calls[0]![1]).toBe('string');
    vi.unstubAllGlobals();
  });

  it('orders a dated row\'s trailing slot: due date, then the wiki link', () => {
    const { container } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[task({ text: 'Plan trip', dueDate: '2026-08-20' })]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
        getSource={() => ({ label: 'Trips', icon: 'note', emoji: null })}
      />
    );

    const trailing = container.querySelector('.collection-row__metadata')!;
    expect(trailing.firstElementChild).toHaveClass('task-row__due-date');
    expect(trailing.lastElementChild).toHaveClass('task-row__source');
  });

  it.each([
    'tasks-today',
    'tasks-overdue',
    'tasks-upcoming',
    'tasks-completed',
    'tasks-unscheduled',
    'tasks-all',
  ] as const)('%s ends with the shared collection__bottom-spacer, once', (view) => {
    const { container } = render(
      <TasksCollectionBody
        view={view}
        tasks={[task({ text: 'A task', dueDate: '2026-08-04' })]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    const spacers = container.querySelectorAll('.collection__content > .collection__bottom-spacer');
    expect(spacers).toHaveLength(1);
    expect(container.querySelector('.collection__content')!.lastElementChild).toBe(spacers[0]);
  });

  it('keeps the spacer on an empty tasks-all page too', () => {
    const { container } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(container.querySelectorAll('.collection__bottom-spacer')).toHaveLength(1);
  });

  it('shows the collection empty state for tasks-all with no tasks', () => {
    const { getByRole } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
      />
    );

    expect(getByRole('status')).toHaveTextContent('Tasks from your notes will appear here');
  });

  it('renders only incomplete tasks with no due date for the tasks-unscheduled view, regardless of displayConfig', () => {
    const unscheduled = task({ text: 'No due date' });
    const scheduled = task({ text: 'Has due date', dueDate: '2026-08-10' });
    const completedUnscheduled = task({
      text: 'Completed, no due date',
      completed: true,
      completedAt: '2026-08-01',
    });

    const { getByText, queryByText } = render(
      <TasksCollectionBody
        view="tasks-unscheduled"
        tasks={[unscheduled, scheduled, completedUnscheduled]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        onDuplicateTask={vi.fn()}
        onDeleteTask={vi.fn()}
        // Even with Show completed enabled, the Unscheduled view keeps its
        // pre-existing, unaffected behavior — it isn't one of the two
        // sections (Today/Everything else) the setting targets.
        displayConfig={{ showCompleted: true, autoSortCompleted: false }}
      />
    );

    expect(getByText('No due date')).not.toBeNull();
    expect(queryByText('Has due date')).toBeNull();
    expect(queryByText('Completed, no due date')).toBeNull();
  });

  describe('displayConfig', () => {
    it('hides completed tasks from tasks-today by default (DEFAULT_TASK_DISPLAY_CONFIG shows them, so this checks the explicit-off case)', () => {
      const completedToday = task({ text: 'Submit expenses', completed: true, dueDate: '2026-08-04' });

      const { queryByText } = render(
        <TasksCollectionBody
          view="tasks-today"
          tasks={[completedToday]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
          displayConfig={{ showCompleted: false, autoSortCompleted: false }}
        />
      );

      expect(queryByText('Submit expenses')).toBeNull();
    });

    it('shows a completed task due today in tasks-today when showCompleted is true', () => {
      const completedToday = task({ text: 'Submit expenses', completed: true, dueDate: '2026-08-04' });

      const { getByText } = render(
        <TasksCollectionBody
          view="tasks-today"
          tasks={[completedToday]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
          displayConfig={{ showCompleted: true, autoSortCompleted: false }}
        />
      );

      expect(getByText('Submit expenses')).not.toBeNull();
    });

    it('shows a completed, non-today task in tasks-upcoming when showCompleted is true', () => {
      const completedOverdue = task({ text: 'Old report', completed: true, dueDate: '2026-07-01' });

      const { getByText } = render(
        <TasksCollectionBody
          view="tasks-upcoming"
          tasks={[completedOverdue]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
          displayConfig={{ showCompleted: true, autoSortCompleted: false }}
        />
      );

      expect(getByText('Old report')).not.toBeNull();
    });

    it('auto-sort moves a completed task to the bottom of tasks-today', () => {
      const completed = task({ text: 'Completed task', completed: true, dueDate: '2026-08-04' });
      const active = task({ text: 'Active task', dueDate: '2026-08-04' });

      const { container } = render(
        <TasksCollectionBody
          view="tasks-today"
          tasks={[completed, active]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
          displayConfig={{ showCompleted: true, autoSortCompleted: true }}
        />
      );

      const titles = Array.from(container.querySelectorAll('.task-title')).map((el) => el.textContent);
      expect(titles).toEqual(['Active task', 'Completed task']);
    });
  });

  describe('compact Markdown title rendering, with resolvers threaded to every view', () => {
    it('renders WikiLink/Tag titles as compact Markdown in the tasks-today view, resolving through injected resolvers', () => {
      const dueToday = task({ text: '[[Project Alpha]] #urgent', dueDate: '2026-08-04' });
      const resolveWikiLink = vi.fn().mockReturnValue({
        status: 'resolved' as const,
        displayLabel: 'Resolved Link',
        activate: () => {},
      });
      const resolveTag = vi.fn().mockReturnValue({
        status: 'resolved' as const,
        displayLabel: 'Resolved Tag',
        activate: () => {},
      });

      const { container } = render(
        <TasksCollectionBody
          view="tasks-today"
          tasks={[dueToday]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
          resolveWikiLink={resolveWikiLink}
          resolveTag={resolveTag}
        />
      );

      expect(resolveWikiLink).toHaveBeenCalledWith('Project Alpha', null);
      expect(resolveTag).toHaveBeenCalledWith('urgent');
      const title = container.querySelector('.task-title')!;
      expect(title.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Resolved Link');
      expect(title.querySelector('.compact-markdown-tag')).toHaveTextContent('#Resolved Tag');
    });

    it('renders WikiLink/Tag titles through the injected resolvers in the tasks-upcoming view', () => {
      const dueTomorrow = task({ text: '[[Project Alpha]] #urgent', dueDate: '2026-08-05' });
      const resolveWikiLink = vi.fn().mockReturnValue({
        status: 'resolved' as const,
        displayLabel: 'Resolved Link',
        activate: () => {},
      });

      const { container } = render(
        <TasksCollectionBody
          view="tasks-upcoming"
          tasks={[dueTomorrow]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
          resolveWikiLink={resolveWikiLink}
        />
      );

      expect(resolveWikiLink).toHaveBeenCalledWith('Project Alpha', null);
      expect(container.querySelector('.compact-markdown-wikilink')).toHaveTextContent('Resolved Link');
    });

    it('renders bold/italic Markdown in the tasks-completed, tasks-unscheduled, and tasks-all views', () => {
      const completed = task({ text: '**Ship** it', completed: true, completedAt: '2026-08-01' });

      const completedResult = render(
        <TasksCollectionBody
          view="tasks-completed"
          tasks={[completed]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
        />
      );
      expect(completedResult.container.querySelector('strong')).toHaveTextContent('Ship');
      completedResult.unmount();

      const unscheduled = task({ text: '*urgent* work' });
      const unscheduledResult = render(
        <TasksCollectionBody
          view="tasks-unscheduled"
          tasks={[unscheduled]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
        />
      );
      expect(unscheduledResult.container.querySelector('em')).toHaveTextContent('urgent');
      unscheduledResult.unmount();

      const all = task({ text: '~~old~~ new' });
      const allResult = render(
        <TasksCollectionBody
          view="tasks-all"
          tasks={[all]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
        />
      );
      expect(allResult.container.querySelector('s')).toHaveTextContent('old');
    });

    it('falls back to unresolved raw-text rendering when no resolvers are passed', () => {
      const dueToday = task({ text: '[[Project Alpha]]', dueDate: '2026-08-04' });

      const { container } = render(
        <TasksCollectionBody
          view="tasks-today"
          tasks={[dueToday]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
          onDuplicateTask={vi.fn()}
          onDeleteTask={vi.fn()}
        />
      );

      const wikilink = container.querySelector('.compact-markdown-wikilink')!;
      expect(wikilink).toHaveTextContent('Project Alpha');
      expect(wikilink).toHaveAttribute('data-wikilink-status', 'unresolved');
    });
  });
});
