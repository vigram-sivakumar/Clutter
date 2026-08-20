// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
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
          workspace={new Workspace()}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onOpenCompleted={vi.fn()}
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
          workspace={new Workspace()}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onOpenCompleted={vi.fn()}
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
          workspace={new Workspace()}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onOpenCompleted={vi.fn()}
        />
      );
      expect(completedResult.container.querySelector('strong')).toHaveTextContent('Ship');
      completedResult.unmount();

      const unscheduled = task({ text: '*urgent* work' });
      const unscheduledResult = render(
        <TasksCollectionBody
          view="tasks-unscheduled"
          tasks={[unscheduled]}
          workspace={new Workspace()}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onOpenCompleted={vi.fn()}
        />
      );
      expect(unscheduledResult.container.querySelector('em')).toHaveTextContent('urgent');
      unscheduledResult.unmount();

      const all = task({ text: '~~old~~ new' });
      const allResult = render(
        <TasksCollectionBody
          view="tasks-all"
          tasks={[all]}
          workspace={new Workspace()}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onOpenCompleted={vi.fn()}
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
          workspace={new Workspace()}
          onToggleComplete={vi.fn()}
          onOpenTask={vi.fn()}
          onOpenCompleted={vi.fn()}
        />
      );

      const wikilink = container.querySelector('.compact-markdown-wikilink')!;
      expect(wikilink).toHaveTextContent('Project Alpha');
      expect(wikilink).toHaveAttribute('data-wikilink-status', 'unresolved');
    });
  });
});
