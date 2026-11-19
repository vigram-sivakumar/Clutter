// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Settings } from '../Settings';
import type { PersistedTasksViewConfig } from '@core/application/task/TasksViewConfigStore';
import type { TasksViewConfigSource } from './TasksViewDisplaySetting';

function createSource(initial: PersistedTasksViewConfig = {}) {
  let value = initial;
  const listeners = new Set<() => void>();
  const source: TasksViewConfigSource = {
    get: () => value,
    update: (patch) => {
      value = { ...value, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, read: () => value };
}

afterEach(() => cleanup());

describe('TasksViewDisplaySetting', () => {
  it('places the task display and group visibility controls in Tasks → Sidebar appearance', () => {
    const { source } = createSource();
    render(<Settings tasksViewConfig={source} />);
    fireEvent.click(screen.getByText('Tasks'));

    const group = screen.getByText('Sidebar appearance', { selector: '.settings-group__title' }).closest('.settings-group')!;
    const titles = [...group.querySelectorAll('.settings-entry__title')].map((entry) => entry.textContent);

    expect(titles).toContain('Show completed');
    expect(titles).toContain('Auto-sort completed');
    expect(titles).toContain('Overdue');
    expect(titles).toContain('Upcoming');
    expect(titles).toContain('Unscheduled');
  });

  it('updates Show completed and disables Sort completed while preserving its saved choice', () => {
    const { source, read } = createSource({ showCompleted: true, autoSortCompleted: false });
    render(<Settings tasksViewConfig={source} />);
    fireEvent.click(screen.getByText('Tasks'));

    const showCompleted = screen.getByRole('switch', { name: 'Show completed' });
    const sortCompleted = screen.getByRole('switch', { name: 'Auto-sort completed' });

    expect(showCompleted).toBeChecked();
    expect(sortCompleted).toBeEnabled();
    fireEvent.click(sortCompleted);
    expect(read().autoSortCompleted).toBe(true);
    expect(sortCompleted).toBeChecked();

    fireEvent.click(showCompleted);
    expect(read().showCompleted).toBe(false);
    expect(sortCompleted).toBeDisabled();
    expect(read().autoSortCompleted).toBe(true);
  });

  it('keeps the existing group visibility preferences and lets Settings change them', () => {
    const { source, read } = createSource({ hiddenGroups: ['unscheduled'] });
    render(<Settings tasksViewConfig={source} />);
    fireEvent.click(screen.getByText('Tasks'));

    const overdue = screen.getByRole('switch', { name: 'Show Overdue section' });
    const unscheduled = screen.getByRole('switch', { name: 'Show Unscheduled section' });

    expect(overdue).toBeChecked();
    expect(unscheduled).not.toBeChecked();
    fireEvent.click(unscheduled);
    expect(read().hiddenGroups).toEqual([]);
  });
});
