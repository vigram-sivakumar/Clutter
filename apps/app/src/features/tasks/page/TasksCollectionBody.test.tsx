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
        onOpenCompleted={vi.fn()}
      />
    );

    expect(getByText('Old completed')).not.toBeNull();
    expect(getByText('Recent completed')).not.toBeNull();
    expect(queryByText('Still open')).toBeNull();
  });
});
