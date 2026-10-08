// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksCollectionBody } from './TasksCollectionBody';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';
import { TASKS_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
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
      />
    );

    expect(getByText('Review designs')).not.toBeNull();
    expect(queryByText('Book flights')).toBeNull();
  });

  it('renders only explicitly-future tasks for the tasks-upcoming view — never overdue, today or unscheduled ones', () => {
    const dueTomorrow = task({ text: 'Book flights', dueDate: '2026-08-05' });
    const dueToday = task({ text: 'Review designs', dueDate: '2026-08-04' });
    const overdue = task({ text: 'Fix navigation', dueDate: '2026-08-01' });
    const unscheduled = task({ text: 'Someday maybe' });

    const { getByText, queryByText } = render(
      <TasksCollectionBody
        view="tasks-upcoming"
        tasks={[dueTomorrow, dueToday, overdue, unscheduled]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
      />
    );

    expect(getByText('Book flights')).not.toBeNull();
    expect(queryByText('Review designs')).toBeNull();
    expect(queryByText('Fix navigation')).toBeNull();
    expect(queryByText('Someday maybe')).toBeNull();
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
      />
    );

    expect(getByText('Still open')).not.toBeNull();
    expect(getByText('Done already')).not.toBeNull();
  });

  it('renders a dated tasks-all row with its due date as a button in the trailing slot: no pill, no add-due-date icon button, no More actions', () => {
    const { getByText, queryByRole, container } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[task({ text: 'Plan trip', dueDate: '2026-08-20' })]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
      />
    );

    expect(getByText('Plan trip')).not.toBeNull();
    expect(container.querySelector('.collection__bottom-spacer')).not.toBeNull();
    expect(container.querySelector('.collection-entry__trailing')).toHaveTextContent('20 Aug 2026');
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
        getSource={() => ({ label: 'Trips', icon: 'note', emoji: '✈️' })}
      />
    );

    // Not a pill, and it sits in the metadata (trailing) slot.
    expect(container.querySelector('.pill')).toBeNull();
    const link = container.querySelector('.collection-entry__trailing .collection-entry-properties--wiki');
    expect(link).toHaveTextContent('Trips');
    // Identity emoji first, like a WikiLink in the editor.
    expect(link!.querySelector('.collection-entry-properties__leading')).toHaveTextContent('✈️');

    fireEvent.click(getByRole('link', { name: 'Open Trips' }));
    expect(onOpenTask).toHaveBeenCalledTimes(1);
    expect(onOpenTask).toHaveBeenCalledWith(target);
  });

  it('an undated tasks-all row has no due-date control at all — only the wiki link trails the title', () => {
    const { container, queryByRole } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[task({ text: 'Someday' })]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
        getSource={() => ({ label: 'Trips', icon: 'note', emoji: null })}
      />
    );

    expect(queryByRole('button', { name: 'Add due date' })).toBeNull();
    expect(container.querySelector('.task-row__due')).toBeNull();
    expect(container.querySelector('.task-row-title')!.firstElementChild).toHaveClass('task-title');
    const trailing = container.querySelector('.collection-entry-properties')!;
    expect(trailing.children).toHaveLength(1);
    expect(trailing.firstElementChild).toHaveClass('collection-entry-properties--wiki');
  });

  it('the due-date button of a dated row opens the calendar to change or clear the date, without opening the note', () => {
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
    const target = task({ text: 'Plan trip', dueDate: '2026-08-20' });

    const { getByRole, getByText } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[target]}
        onToggleComplete={vi.fn()}
        onOpenTask={onOpenTask}
        onChangeDueDate={onChangeDueDate}
      />
    );

    fireEvent.click(getByRole('button', { name: '20 Aug 2026' }));
    expect(onOpenTask).not.toHaveBeenCalled();

    fireEvent.click(getByText('Clear date'));
    expect(onChangeDueDate).toHaveBeenLastCalledWith(target, null);

    fireEvent.click(getByRole('button', { name: '20 Aug 2026' }));
    fireEvent.click(getByText('15'));
    expect(onChangeDueDate).toHaveBeenCalledTimes(2);
    expect(onChangeDueDate.mock.calls[1]![0]).toBe(target);
    expect(typeof onChangeDueDate.mock.calls[1]![1]).toBe('string');
    expect(onOpenTask).not.toHaveBeenCalled();
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
        getSource={() => ({ label: 'Trips', icon: 'note', emoji: null })}
      />
    );

    const trailing = container.querySelector('.collection-entry-properties')!;
    expect(trailing.firstElementChild).toHaveClass('collection-entry-properties--action', 'task-row__due');
    expect(trailing.firstElementChild).toHaveTextContent('20 Aug 2026');
    expect(trailing.lastElementChild).toHaveClass('collection-entry-properties--wiki');
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
      />
    );

    expect(container.querySelectorAll('.collection__bottom-spacer')).toHaveLength(1);
  });

  describe('the All Tasks collection follows the shared Configure state', () => {
    const noop = {
      onToggleComplete: vi.fn(),
      onOpenTask: vi.fn(),
      onChangeDueDate: vi.fn(),
    };
    const source = (task: { sourcePageId: string }) => ({
      label: task.sourcePageId === 'p-b' ? 'Beta note' : 'Alpha note',
      icon: 'note' as const,
      emoji: null,
    });

    it('draws the Table layout through the generic table: Name (checkbox + title), Due date and Source columns', () => {
      const view = resolveCollectionView(TASKS_COLLECTION, { layout: 'table' });
      const { container, getAllByRole } = render(
        <TasksCollectionBody
          view="tasks-all"
          tasks={[task({ text: 'Plan trip', dueDate: '2026-08-20' })]}
          collectionView={view}
          getSource={source}
          {...noop}
        />
      );

      expect(container.querySelector('.collection-table')).not.toBeNull();
      expect(container.querySelector('.collection-list')).toBeNull();
      expect([...container.querySelectorAll('.collection-table__header-cell')].map((cell) => cell.textContent)).toEqual([
        'Name',
        'Due date',
        'Source',
      ]);
      const row = container.querySelector('.collection-table-row:not(.collection-table__header)') ?? container.querySelectorAll('.collection-table-row')[1];
      expect(row).toHaveTextContent('Plan trip');
      // The same controls as the List's trailing slot: the due-date button, and the source as the wiki link.
      expect(row!.querySelector('.collection-table-row__dueDate .task-row__due')).toHaveTextContent('20 Aug 2026');
      const link = row!.querySelector('.collection-table-row__source .collection-entry-properties--wiki');
      expect(link).toHaveAttribute('role', 'link');
      expect(link).toHaveTextContent('Alpha note');
      expect(getAllByRole('checkbox')).toHaveLength(1);
    });

    it('Table completion still works: the checkbox toggles the task without opening it', () => {
      const onToggleComplete = vi.fn();
      const onOpenTask = vi.fn();
      const target = task({ text: 'Plan trip' });
      const { getByRole } = render(
        <TasksCollectionBody
          view="tasks-all"
          tasks={[target]}
          collectionView={resolveCollectionView(TASKS_COLLECTION, { layout: 'table' })}
          {...noop}
          onToggleComplete={onToggleComplete}
          onOpenTask={onOpenTask}
        />
      );

      fireEvent.click(getByRole('checkbox'));
      expect(onToggleComplete).toHaveBeenCalledWith(target);
    });

    it('a hidden property reserves nothing: Due date and Source off removes their table columns', () => {
      const view = resolveCollectionView(TASKS_COLLECTION, {
        layout: 'table',
        propertyOverrides: { dueDate: false, source: false },
      });
      const { container } = render(
        <TasksCollectionBody
          view="tasks-all"
          tasks={[task({ text: 'Plan trip', dueDate: '2026-08-20' })]}
          collectionView={view}
          getSource={source}
          {...noop}
        />
      );

      expect([...container.querySelectorAll('.collection-table__header-cell')].map((cell) => cell.textContent)).toEqual(['Name']);
    });

    it('List layout: the Due date and Source properties drive the due-date controls and the source link', () => {
      const view = resolveCollectionView(TASKS_COLLECTION, { propertyOverrides: { dueDate: false, source: false } });
      const { container } = render(
        <TasksCollectionBody
          view="tasks-all"
          tasks={[task({ text: 'Plan trip', dueDate: '2026-08-20' }), task({ text: 'Someday' })]}
          collectionView={view}
          getSource={source}
          {...noop}
        />
      );

      expect(container.querySelector('.task-row__due')).toBeNull();
      expect(container.querySelector('.collection-entry-properties--wiki')).toBeNull();
      expect(container.querySelectorAll('.collection-entry')).toHaveLength(2);
    });

    it('sorts by the chosen property with the shared engine; with Auto-sort completed on, incomplete tasks come before completed ones', () => {
      const tasks = [
        task({ text: 'Banana', startOffset: 0 }),
        task({ text: 'Apple', startOffset: 1 }),
        task({ text: 'Cherry (done)', completed: true, completedAt: '2026-08-01', startOffset: 2 }),
        task({ text: 'Avocado (done)', completed: true, completedAt: '2026-08-02', startOffset: 3 }),
      ];
      const titles = (sort: { property: 'name' | 'dueDate' | 'source'; direction: 'down' | 'up' }) => {
        const { container, unmount } = render(
          <TasksCollectionBody
            view="tasks-all"
            tasks={tasks}
            collectionView={resolveCollectionView(TASKS_COLLECTION, { sort })}
            displayConfig={{ showCompleted: true, autoSortCompleted: true }}
            {...noop}
          />
        );
        const result = [...container.querySelectorAll('.collection-entry .task-title')].map((el) => el.textContent);
        unmount();
        return result;
      };

      expect(titles({ property: 'name', direction: 'down' })).toEqual(['Apple', 'Banana', 'Avocado (done)', 'Cherry (done)']);
      expect(titles({ property: 'name', direction: 'up' })).toEqual(['Banana', 'Apple', 'Cherry (done)', 'Avocado (done)']);
    });

    describe('the Tasks-view display preference (Show completed / Auto-sort completed)', () => {
      const tasks = [
        task({ text: 'Banana', startOffset: 0 }),
        task({ text: 'Apple (done)', completed: true, completedAt: '2026-08-02', startOffset: 1 }),
        task({ text: 'Cherry', startOffset: 2 }),
      ];
      const titles = (displayConfig: { showCompleted: boolean; autoSortCompleted: boolean }) => {
        const { container, unmount } = render(
          <TasksCollectionBody view="tasks-all" tasks={tasks} displayConfig={displayConfig} {...noop} />
        );
        const result = [...container.querySelectorAll('.collection-entry .task-title')].map((el) => el.textContent);
        unmount();
        return result;
      };

      it('Show completed off drops completed tasks', () => {
        expect(titles({ showCompleted: false, autoSortCompleted: false })).toEqual(['Banana', 'Cherry']);
      });

      it('Auto-sort completed off leaves completed tasks in their sorted place; on moves them last', () => {
        expect(titles({ showCompleted: true, autoSortCompleted: false })).toEqual(['Apple (done)', 'Banana', 'Cherry']);
        expect(titles({ showCompleted: true, autoSortCompleted: true })).toEqual(['Banana', 'Cherry', 'Apple (done)']);
      });

      it('shows the empty state when Show completed hides every task', () => {
        const { getByRole } = render(
          <TasksCollectionBody
            view="tasks-all"
            tasks={[task({ text: 'Done', completed: true, completedAt: '2026-08-01' })]}
            displayConfig={{ showCompleted: false, autoSortCompleted: false }}
            {...noop}
          />
        );

        expect(getByRole('status')).toHaveTextContent('Tasks from your notes will appear here');
      });
    });

    it('sorts by Due date: dated tasks in date order, undated ones last', () => {
      const tasks = [
        task({ text: 'No date', startOffset: 0 }),
        task({ text: 'Later', dueDate: '2026-09-01', startOffset: 1 }),
        task({ text: 'Sooner', dueDate: '2026-08-10', startOffset: 2 }),
      ];
      const { container } = render(
        <TasksCollectionBody
          view="tasks-all"
          tasks={tasks}
          // 'up' on a date property is oldest first (its arrow semantics: 'down' is newest first).
          collectionView={resolveCollectionView(TASKS_COLLECTION, { sort: { property: 'dueDate', direction: 'up' } })}
          {...noop}
        />
      );

      expect([...container.querySelectorAll('.collection-entry .task-title')].map((el) => el.textContent)).toEqual([
        'Sooner',
        'Later',
        'No date',
      ]);
    });
  });

  it('does not draw the tab strip in the page body — it lives in the page header', () => {
    for (const view of ['tasks-all', 'tasks-today', 'tasks-overdue', 'tasks-upcoming', 'tasks-completed', 'tasks-unscheduled'] as const) {
      const { container, unmount } = render(
        <TasksCollectionBody
          view={view}
          tasks={[task({ text: 'Plan trip' })]}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onChangeDueDate={vi.fn()}
        />
      );
      expect(container.querySelector('.tabs'), view).toBeNull();
      unmount();
    }
  });

  describe('the actions beside each task\'s title (Edit and the due-date picker)', () => {
    const edit = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('button[aria-label="Edit task"]');
    const calendar = (container: HTMLElement) =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Set due date"], button[aria-label="Change due date"]');

    const renderBody = (
      layout: 'list' | 'table',
      { onEditTask, onChangeDueDate = vi.fn(), onOpenTask = vi.fn(), dueDate }: {
        onEditTask?: (task: TaskOccurrence) => void;
        onChangeDueDate?: ReturnType<typeof vi.fn<(task: TaskOccurrence, date: string | null) => void>>;
        onOpenTask?: (task: TaskOccurrence) => void;
        dueDate?: string;
      } = {}
    ) => {
      const target = task({ text: 'Plan trip', dueDate });
      const utils = render(
        <TasksCollectionBody
          view="tasks-all"
          tasks={[target]}
          collectionView={resolveCollectionView(TASKS_COLLECTION, { layout })}
          onToggleComplete={vi.fn()}
          onOpenTask={onOpenTask}
          onChangeDueDate={onChangeDueDate}
          onEditTask={onEditTask}
        />
      );

      return { ...utils, target, onOpenTask, onChangeDueDate };
    };

    it.each(['list', 'table'] as const)('%s: both actions are the shared Button, wrapped in one collection-entry__actions div that is the title\'s SIBLING under the content', (layout) => {
      const { container } = renderBody(layout, { onEditTask: vi.fn() });
      const actions = container.querySelector('.collection-entry__actions')!;
      const title = container.querySelector('.collection-entry__title')!;
      const content = container.querySelector('.collection-entry__content')!;

      expect(container.querySelectorAll('.collection-entry__actions')).toHaveLength(1);
      // Siblings directly under the content — the actions are not inside the title.
      expect(title.parentElement).toBe(content);
      expect(actions.parentElement).toBe(content);
      expect(title.nextElementSibling).toBe(actions);
      expect(title.contains(actions)).toBe(false);
      expect(title).toHaveTextContent('Plan trip');
      expect(title.querySelector('.task-row-title')!.firstElementChild).toHaveClass('task-title');
      expect([...actions.children]).toEqual([edit(container), calendar(container)]);
      for (const button of [edit(container)!, calendar(container)!]) {
        expect(button).toHaveClass('button', 'button--icon');
        expect(button.getAttribute('title')).toBe(button.getAttribute('aria-label'));
        expect(button.querySelector('svg')).not.toBeNull();
      }
    });

    it('the due-date button reads "Set due date" for an undated task and "Change due date" for a dated one', () => {
      expect(calendar(renderBody('list').container)).toHaveAttribute('aria-label', 'Set due date');
      cleanup();
      expect(calendar(renderBody('list', { dueDate: '2026-08-20' }).container)).toHaveAttribute('aria-label', 'Change due date');
    });

    it.each(['list', 'table'] as const)('%s: clicking Edit reports that task and does not open the task\'s note', (layout) => {
      const onEditTask = vi.fn();
      const { container, target, onOpenTask } = renderBody(layout, { onEditTask });

      fireEvent.click(edit(container)!);

      expect(onEditTask).toHaveBeenCalledTimes(1);
      expect(onEditTask).toHaveBeenCalledWith(target);
      expect(onOpenTask).not.toHaveBeenCalled();
    });

    it('without onEditTask there is no Edit button (and never an overflow menu) — the due-date button remains', () => {
      const { container } = renderBody('list');

      expect(edit(container)).toBeNull();
      expect(calendar(container)).not.toBeNull();
      expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull();
    });

    it.each(['list', 'table'] as const)('%s: the due-date button opens the existing picker; choosing a day updates THAT task through onChangeDueDate, without opening the note', (layout) => {
      vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
      const { container, getByText, target, onChangeDueDate, onOpenTask } = renderBody(layout, { onEditTask: vi.fn() });

      fireEvent.click(calendar(container)!);
      expect(calendar(container)).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(getByText('15'));

      expect(onChangeDueDate).toHaveBeenCalledTimes(1);
      expect(onChangeDueDate.mock.calls[0]![0]).toBe(target);
      expect(onChangeDueDate.mock.calls[0]![1]).toMatch(/^\d{4}-\d{2}-15$/);
      expect(onOpenTask).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('for a dated task the picker can clear the date', () => {
      vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
      const { container, getByText, target, onChangeDueDate } = renderBody('list', { dueDate: '2026-08-20' });

      fireEvent.click(calendar(container)!);
      fireEvent.click(getByText('Clear date'));

      expect(onChangeDueDate).toHaveBeenCalledWith(target, null);
      vi.unstubAllGlobals();
    });
  });

  describe('one Task Collection: all six views render through the shared collection renderer', () => {
    const VIEWS = ['tasks-all', 'tasks-today', 'tasks-overdue', 'tasks-upcoming', 'tasks-unscheduled', 'tasks-completed'] as const;
    const noop = { onToggleComplete: vi.fn(), onOpenTask: vi.fn(), onChangeDueDate: vi.fn() };
    // 2026-08-04 is "today" (the file's fake clock); one task per dataset.
    const everyDataset = [
      task({ text: 'T-unscheduled', startOffset: 0 }),
      task({ text: 'T-today', dueDate: '2026-08-04', startOffset: 1 }),
      task({ text: 'T-overdue', dueDate: '2026-08-01', startOffset: 2 }),
      task({ text: 'T-upcoming', dueDate: '2026-08-09', startOffset: 3 }),
      task({ text: 'T-done', completed: true, completedAt: '2026-08-02', startOffset: 4 }),
    ];
    const expected: Record<(typeof VIEWS)[number], string[]> = {
      'tasks-all': ['T-done', 'T-overdue', 'T-today', 'T-unscheduled', 'T-upcoming'],
      'tasks-today': ['T-today'],
      'tasks-overdue': ['T-overdue'],
      'tasks-upcoming': ['T-upcoming'],
      'tasks-unscheduled': ['T-unscheduled'],
      'tasks-completed': ['T-done'],
    };
    const titlesIn = (container: HTMLElement) =>
      [...container.querySelectorAll('.collection-entry .task-title')].map((el) => el.textContent);

    it.each(VIEWS)('%s: draws its dataset as generic CollectionDataList rows, with the bottom spacer', (view) => {
      const { container } = render(<TasksCollectionBody view={view} tasks={everyDataset} {...noop} />);

      expect(container.querySelector('.collection-list')).not.toBeNull();
      expect(titlesIn(container)).toEqual(expected[view]);
      expect(container.querySelectorAll('.collection__bottom-spacer')).toHaveLength(1);
    });

    it.each(VIEWS)('%s: switches to the generic CollectionDataTable when the shared layout says Table', (view) => {
      const { container } = render(
        <TasksCollectionBody
          view={view}
          tasks={everyDataset}
          collectionView={resolveCollectionView(TASKS_COLLECTION, { layout: 'table' })}
          {...noop}
        />
      );

      expect(container.querySelector('.collection-list')).toBeNull();
      expect(container.querySelector('.collection-table')).not.toBeNull();
      expect(container.querySelectorAll('.collection-table .task-title').length).toBe(expected[view].length);
    });

    it.each(VIEWS)('%s: follows the SAME shared properties and sort', (view) => {
      const { container } = render(
        <TasksCollectionBody
          view={view}
          tasks={everyDataset}
          collectionView={resolveCollectionView(TASKS_COLLECTION, {
            layout: 'table',
            propertyOverrides: { source: false },
            sort: { property: 'name', direction: 'up' },
          })}
          {...noop}
        />
      );

      expect([...container.querySelectorAll('.collection-table__header-cell')].map((c) => c.textContent)).toEqual(['Name', 'Due date']);
      const shown = [...container.querySelectorAll('.collection-table .task-title')].map((el) => el.textContent);
      // Name Z→A for every view — except Done, whose newest-completed-first order is its own.
      expect(shown).toEqual(view === 'tasks-completed' ? expected[view] : [...expected[view]].sort().reverse());
    });

    it('Done keeps newest-completed-first whatever the shared sort says', () => {
      const completed = [
        task({ text: 'Alpha (oldest)', completed: true, completedAt: '2026-08-01', startOffset: 0 }),
        task({ text: 'Zulu (newest)', completed: true, completedAt: '2026-08-03', startOffset: 1 }),
        task({ text: 'Mike (middle)', completed: true, completedAt: '2026-08-02', startOffset: 2 }),
      ];

      for (const sort of [
        { property: 'name', direction: 'down' },
        { property: 'name', direction: 'up' },
        { property: 'dueDate', direction: 'down' },
      ] as const) {
        const { container, unmount } = render(
          <TasksCollectionBody
            view="tasks-completed"
            tasks={completed}
            collectionView={resolveCollectionView(TASKS_COLLECTION, { sort })}
            {...noop}
          />
        );
        expect(titlesIn(container)).toEqual(['Zulu (newest)', 'Mike (middle)', 'Alpha (oldest)']);
        unmount();
      }
    });

    it.each(VIEWS)('%s: uses the canonical collection row — none of the legacy sidebar-task row UI', (view) => {
      const { container, queryByRole } = render(
        <TasksCollectionBody view={view} tasks={everyDataset} getSource={() => ({ label: 'Src', icon: 'note', emoji: null })} {...noop} />
      );

      expect(container.querySelector('.collection-entry')).not.toBeNull();
      expect(container.querySelector('.entry')).toBeNull();
      expect(container.querySelector('.task__due-date')).toBeNull();
      expect(container.querySelector('.pill')).toBeNull();
      expect(queryByRole('button', { name: /more actions/i })).toBeNull();
      // the canonical trailing UX: the source link and a due-date control are still there
      expect(container.querySelector('.collection-entry-properties--wiki')).not.toBeNull();
    });

    it('a view\'s empty dataset shows the collection empty state, not an empty list', () => {
      const { getByRole, container } = render(<TasksCollectionBody view="tasks-today" tasks={[task({ text: 'Later', dueDate: '2026-09-01' })]} {...noop} />);

      expect(getByRole('status')).toBeInTheDocument();
      expect(container.querySelector('.collection-list')).toBeNull();
    });
  });

  it('shows the collection empty state for tasks-all with no tasks', () => {
    const { getByRole } = render(
      <TasksCollectionBody
        view="tasks-all"
        tasks={[]}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onChangeDueDate={vi.fn()}
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
          displayConfig={{ showCompleted: true, autoSortCompleted: false }}
        />
      );

      expect(getByText('Submit expenses')).not.toBeNull();
    });

    it('Upcoming honours Show completed: a completed future task shows when on, not when off', () => {
      const completedFuture = task({ text: 'Booked already', completed: true, dueDate: '2026-08-20' });
      const renderUpcoming = (showCompleted: boolean) =>
        render(
          <TasksCollectionBody
            view="tasks-upcoming"
            tasks={[completedFuture]}
            onToggleComplete={vi.fn()}
            onOpenTask={vi.fn()}
            onChangeDueDate={vi.fn()}
            displayConfig={{ showCompleted, autoSortCompleted: false }}
          />
        );

      const on = renderUpcoming(true);
      expect(on.queryByText('Booked already')).not.toBeNull();
      on.unmount();

      const off = renderUpcoming(false);
      expect(off.queryByText('Booked already')).toBeNull();
    });

    it('a completed task that was due before today is in neither Overdue nor Upcoming, whatever Show completed says', () => {
      const completedOverdue = task({ text: 'Old report', completed: true, dueDate: '2026-07-01' });

      for (const view of ['tasks-overdue', 'tasks-upcoming'] as const) {
        const { queryByText, unmount } = render(
          <TasksCollectionBody
            view={view}
            tasks={[completedOverdue]}
            onToggleComplete={vi.fn()}
            onOpenTask={vi.fn()}
            onChangeDueDate={vi.fn()}
            displayConfig={{ showCompleted: true, autoSortCompleted: false }}
          />
        );
        expect(queryByText('Old report'), view).toBeNull();
        unmount();
      }
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
        />
      );

      const wikilink = container.querySelector('.compact-markdown-wikilink')!;
      expect(wikilink).toHaveTextContent('Project Alpha');
      expect(wikilink).toHaveAttribute('data-wikilink-status', 'unresolved');
    });
  });
});
