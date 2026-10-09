// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TASKS_TAB_VIEW, TasksTabs } from './TasksTabs';

afterEach(() => {
  cleanup();
});

describe('TasksTabs', () => {
  it('shows All Tasks, Today, Upcoming and Unscheduled, with the given tab selected', () => {
    const { container } = render(<TasksTabs value="today" onValueChange={vi.fn()} />);

    expect([...container.querySelectorAll('.tab')].map((tab) => tab.textContent)).toEqual([
      'All Tasks',
      'Today',
      'Upcoming',
      'Unscheduled',
    ]);
    expect(container.querySelector('.tab--active')).toHaveTextContent('Today');
    expect(container.querySelectorAll('.tab--active')).toHaveLength(1);
  });

  it('clicking a tab reports it — the page owns the selection', () => {
    const onValueChange = vi.fn();
    const { container, getByText } = render(<TasksTabs value="all" onValueChange={onValueChange} />);

    fireEvent.click(getByText('Upcoming'));

    expect(onValueChange).toHaveBeenCalledWith('upcoming');
    // Controlled: it does not move its own highlight.
    expect(container.querySelector('.tab--active')).toHaveTextContent('All Tasks');
  });

  it('maps each tab to the dataset it shows', () => {
    expect(TASKS_TAB_VIEW).toEqual({
      all: 'tasks-all',
      today: 'tasks-today',
      upcoming: 'tasks-upcoming',
      unscheduled: 'tasks-unscheduled',
    });
  });

  it('hugs its tabs: it sits in a wrapper that does not stretch', () => {
    const { container } = render(<TasksTabs value="all" onValueChange={vi.fn()} />);

    expect(container.firstElementChild).toHaveClass('tasks-tabs');
  });
});
