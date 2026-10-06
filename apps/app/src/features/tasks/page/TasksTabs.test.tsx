// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TasksTabs } from './TasksTabs';

afterEach(() => {
  cleanup();
});

describe('TasksTabs (presentation only)', () => {
  it('shows All Tasks, Today, Upcoming and Unscheduled, with All Tasks selected', () => {
    const { container } = render(<TasksTabs />);

    expect([...container.querySelectorAll('.tab')].map((tab) => tab.textContent)).toEqual([
      'All Tasks',
      'Today',
      'Upcoming',
      'Unscheduled',
    ]);
    expect(container.querySelector('.tab--active')).toHaveTextContent('All Tasks');
  });

  it('clicking a tab only moves its own highlight', () => {
    const { container, getByText } = render(<TasksTabs />);

    fireEvent.click(getByText('Upcoming'));

    expect(container.querySelector('.tab--active')).toHaveTextContent('Upcoming');
    expect(container.querySelectorAll('.tab--active')).toHaveLength(1);
  });

  it('hugs its tabs: it sits in a wrapper that does not stretch', () => {
    const { container } = render(<TasksTabs />);

    expect(container.firstElementChild).toHaveClass('tasks-tabs');
  });
});
