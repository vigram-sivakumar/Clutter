// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksCollectionBody } from './TasksCollectionBody';
import { Workspace } from '@core/workspace/Workspace';
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
        workspace={new Workspace()}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onOpenCompleted={vi.fn()}
      />
    );

    expect(getByText('Review designs')).not.toBeNull();
    expect(queryByText('Book flights')).toBeNull();
  });

  it('renders overdue/future/unscheduled tasks for the tasks-upcoming view', () => {
    const dueTomorrow = task({ text: 'Book flights', dueDate: '2026-08-05' });
    const dueToday = task({ text: 'Review designs', dueDate: '2026-08-04' });

    const { getByText, queryByText } = render(
      <TasksCollectionBody
        view="tasks-upcoming"
        tasks={[dueTomorrow, dueToday]}
        workspace={new Workspace()}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onOpenCompleted={vi.fn()}
      />
    );

    expect(getByText('Book flights')).not.toBeNull();
    expect(queryByText('Review designs')).toBeNull();
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
        workspace={new Workspace()}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onOpenCompleted={vi.fn()}
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
        workspace={new Workspace()}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onOpenCompleted={vi.fn()}
      />
    );

    expect(getByText('Still open')).not.toBeNull();
    expect(getByText('Done already')).not.toBeNull();
  });

  it('renders only incomplete tasks with no due date for the tasks-unscheduled view', () => {
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
        workspace={new Workspace()}
        onToggleComplete={vi.fn()}
        onOpenTask={vi.fn()}
        onOpenCompleted={vi.fn()}
      />
    );

    expect(getByText('No due date')).not.toBeNull();
    expect(queryByText('Has due date')).toBeNull();
    expect(queryByText('Completed, no due date')).toBeNull();
  });
});
