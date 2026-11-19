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

describe('completed-task settings', () => {
  it('renders Show completed and Auto-sort completed as separate entries after the other sidebar settings', () => {
    const { source } = createSource();
    render(<Settings tasksViewConfig={source} />);
    fireEvent.click(screen.getByText('Tasks'));

    const group = screen.getByText('Sidebar appearance', { selector: '.settings-group__title' }).closest('.settings-group')!;
    const titles = [...group.querySelectorAll('.settings-entry__title')].map((entry) => entry.textContent);

    expect(titles).toEqual([
      'Group by due date',
      'Show',
      'Show completed',
      'Auto-sort completed',
    ]);
    expect(titles).not.toContain('Overdue');
    expect(titles).not.toContain('Upcoming');
    expect(titles).not.toContain('Unscheduled');
    expect(group.querySelectorAll('.settings-group__divider')).toHaveLength(3);
  });

  it('keeps Auto-sort completed enabled when Show completed is off', () => {
    const { source, read } = createSource({ showCompleted: false, autoSortCompleted: false });
    render(<Settings tasksViewConfig={source} />);
    fireEvent.click(screen.getByText('Tasks'));

    const showCompleted = screen.getByRole('switch', { name: 'Show completed' });
    const autoSortCompleted = screen.getByRole('switch', { name: 'Auto-sort completed' });

    expect(showCompleted).not.toBeChecked();
    expect(autoSortCompleted).toBeEnabled();

    fireEvent.click(autoSortCompleted);
    expect(read().autoSortCompleted).toBe(true);
    expect(autoSortCompleted).toBeChecked();

    fireEvent.click(showCompleted);
    expect(read().showCompleted).toBe(true);
    expect(autoSortCompleted).toBeEnabled();
    expect(read().autoSortCompleted).toBe(true);
  });
});
