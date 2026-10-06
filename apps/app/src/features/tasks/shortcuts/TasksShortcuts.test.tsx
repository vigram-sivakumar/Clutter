// @vitest-environment jsdom

import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TasksShortcuts } from './TasksShortcuts';
import type { TasksShortcutId } from './tasksShortcuts.config';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from '../helpers/groupTasks';

// Overlay's anchored positioning (useOverlayPosition) observes the anchor/
// surface elements via ResizeObserver, which jsdom doesn't implement — same
// stub PageHeaderMoreActionsMenu.test.tsx uses for the same reason.
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

// A resolved-by-default stub — every test that doesn't care about
// onCreateTask's own behavior still needs a well-typed prop to render at
// all (TasksShortcutsProps.onCreateTask is required, no default).
function renderTasksShortcuts(overrides?: {
  onShortcut?: ReturnType<typeof vi.fn<(id: TasksShortcutId) => void>>;
  onCreateTask?: ReturnType<
    typeof vi.fn<(title: string, dueDate: string | undefined) => Promise<void>>
  >;
  tasksViewConfig?: TaskDisplayConfig;
}) {
  const onShortcut = overrides?.onShortcut ?? vi.fn();
  const onCreateTask = overrides?.onCreateTask ?? vi.fn().mockResolvedValue(undefined);
  const onTasksViewConfigChange = vi.fn<(next: TaskDisplayConfig) => void>();

  render(
    <TasksShortcuts
      onShortcut={onShortcut}
      onCreateTask={onCreateTask}
      tasksViewConfig={overrides?.tasksViewConfig ?? DEFAULT_TASK_DISPLAY_CONFIG}
      onTasksViewConfigChange={onTasksViewConfigChange}
    />
  );

  return { onShortcut, onCreateTask, onTasksViewConfigChange };
}

describe('TasksShortcuts', () => {
  it('opens a task-creation overlay on "New" click without invoking onShortcut', () => {
    const { onShortcut } = renderTasksShortcuts();

    // Clicking opens the overlay at all only if Entry's disabled guard lets
    // the click through — a stronger signal than asserting the attribute
    // directly, and the one the earlier (now removed) "renders disabled"
    // test cared about in practice.
    fireEvent.click(screen.getByText('New'));

    expect(onShortcut).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('focuses the title field on open, and Escape does not dismiss it', () => {
    renderTasksShortcuts();

    fireEvent.click(screen.getByText('New'));

    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();

    // dismissible={false} on the Dialog — auto-dismiss is off; only the
    // explicit close button (below) may close it.
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('dismisses the overlay via the close button', () => {
    renderTasksShortcuts();

    fireEvent.click(screen.getByText('New'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close'));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('a backdrop click does not dismiss the overlay', () => {
    renderTasksShortcuts();

    fireEvent.click(screen.getByText('New'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    const backdrop = document.querySelector('.overlay__backdrop');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('Create is disabled until a non-empty title is typed, and calls onCreateTask with today as the default due date', async () => {
    const { onCreateTask } = renderTasksShortcuts();

    fireEvent.click(screen.getByText('New'));

    const createButton = screen.getByText('Create').closest('button')!;
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Buy milk' } });
    expect(createButton).not.toBeDisabled();

    fireEvent.click(createButton);

    await waitFor(() => {
      expect(onCreateTask).toHaveBeenCalledWith('Buy milk', toISODate(new Date()));
    });

    // Closes itself once creation resolves.
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  it('keeps the overlay open and shows the error when onCreateTask rejects', async () => {
    const onCreateTask = vi.fn().mockRejectedValue(new Error('Could not reach the Daily Note'));
    renderTasksShortcuts({ onCreateTask });

    fireEvent.click(screen.getByText('New'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Buy milk' } });
    fireEvent.click(screen.getByText('Create').closest('button')!);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the Daily Note');
    });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it.each([
    ['tasks-all', 'all-tasks'],
    ['tasks-unscheduled', 'unscheduled'],
    ['tasks-completed', 'completed'],
  ] as const)('invokes onShortcut with "%s" when clicked', (locationId, id) => {
    const { onShortcut } = renderTasksShortcuts();

    const title = getSystemLocationPresentation(locationId).label;
    fireEvent.click(screen.getByText(title));

    expect(onShortcut).toHaveBeenCalledWith(id);
  });

  describe('the Tasks-view settings action on All Tasks', () => {
    const allTasksRow = () =>
      screen
        .getByText(getSystemLocationPresentation('tasks-all').label)
        .closest('.entry') as HTMLElement;

    it('lives only on the All Tasks row, in its always-visible trailing slot (not the hover-only actions slot)', () => {
      renderTasksShortcuts();

      const trigger = screen.getByLabelText('Task display settings');
      expect(screen.getAllByLabelText('Task display settings')).toHaveLength(1);
      expect(allTasksRow().querySelector('.entry__meta')).toContainElement(
        trigger
      );
      expect(allTasksRow().querySelector('.entry__actions')).toBeNull();
      expect(allTasksRow()).not.toHaveClass('entry-hide-trailing-on-hover');
    });

    it('opens the menu without navigating to All Tasks', () => {
      const { onShortcut } = renderTasksShortcuts();

      expect(screen.queryByText('Show completed')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Task display settings'));

      expect(screen.getByText('Show completed')).toBeInTheDocument();
      expect(screen.getByText('Auto-sort completed')).toBeInTheDocument();
      expect(onShortcut).not.toHaveBeenCalled();
    });

    it('writes the shared Tasks-view config and closes the menu when a setting is toggled', () => {
      const { onTasksViewConfigChange } = renderTasksShortcuts({
        tasksViewConfig: { showCompleted: true, autoSortCompleted: false },
      });

      fireEvent.click(screen.getByLabelText('Task display settings'));
      fireEvent.click(screen.getByText('Auto-sort completed'));

      expect(onTasksViewConfigChange).toHaveBeenCalledWith({
        showCompleted: true,
        autoSortCompleted: true,
      });
      expect(screen.queryByText('Auto-sort completed')).not.toBeInTheDocument();
    });
  });
});
