// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TASKS_TAB_VIEW, TasksTabs, resolveTasksTab } from './TasksTabs';

afterEach(() => {
  cleanup();
});

describe('TasksTabs', () => {
  it('shows Today, Upcoming, Unplanned and Completed, with the given tab selected', () => {
    const { container } = render(<TasksTabs value="today" onValueChange={vi.fn()} />);

    expect([...container.querySelectorAll('.tab')].map((tab) => tab.textContent)).toEqual([
      'Today',
      'Upcoming',
      'Unplanned',
      'Completed',
    ]);
    expect(container.querySelector('.tab--active')).toHaveTextContent('Today');
    expect(container.querySelectorAll('.tab--active')).toHaveLength(1);
  });

  it('clicking a tab reports it — the page owns the selection', () => {
    const onValueChange = vi.fn();
    const { container, getByText } = render(<TasksTabs value="today" onValueChange={onValueChange} />);

    fireEvent.click(getByText('Upcoming'));

    expect(onValueChange).toHaveBeenCalledWith('upcoming');
    // Controlled: it does not move its own highlight.
    expect(container.querySelector('.tab--active')).toHaveTextContent('Today');
  });

  it('maps each tab to the dataset it shows', () => {
    expect(TASKS_TAB_VIEW).toEqual({
      today: 'tasks-today',
      upcoming: 'tasks-upcoming',
      unscheduled: 'tasks-unscheduled',
      completed: 'tasks-completed',
    });
  });

  it('renders the Tabs component directly, with no wrapper element', () => {
    const { container } = render(<TasksTabs value="today" onValueChange={vi.fn()} />);

    expect(container.firstElementChild).toHaveClass('tabs', 'tabs--ghost');
  });

  it('resolveTasksTab keeps a known persisted tab and falls back to All tasks for anything else', () => {
    expect(resolveTasksTab('today')).toBe('today');
    expect(resolveTasksTab('completed')).toBe('completed');
    expect(resolveTasksTab('upcoming')).toBe('upcoming');
    expect(resolveTasksTab('unscheduled')).toBe('unscheduled');
    expect(resolveTasksTab(undefined)).toBe('today');
    expect(resolveTasksTab('all')).toBe('today');
    expect(resolveTasksTab('overdue')).toBe('today');
    expect(resolveTasksTab('done')).toBe('today');
    expect(resolveTasksTab('')).toBe('today');
  });
});
