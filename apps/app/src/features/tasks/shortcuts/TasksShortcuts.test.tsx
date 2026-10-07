// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TasksShortcuts } from './TasksShortcuts';
import { NewTaskDialog } from './NewTaskDialog';
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

// Stands in for Sidebar, which now hosts the New task dialog (so the top controls' New task can
// open it too): the row only requests it, the host renders it.
function SidebarHost({
  onCreateTask,
  ...rest
}: Omit<React.ComponentProps<typeof TasksShortcuts>, 'onRequestNewTask'> & {
  onCreateTask: React.ComponentProps<typeof NewTaskDialog>['onCreateTask'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TasksShortcuts {...rest} onRequestNewTask={() => setOpen(true)} />
      <NewTaskDialog open={open} onClose={() => setOpen(false)} onCreateTask={onCreateTask} />
    </>
  );
}

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
    <SidebarHost
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

  it('Create is disabled until a non-empty title is typed, and calls onCreateTask with no due date by default', async () => {
    const { onCreateTask } = renderTasksShortcuts();

    fireEvent.click(screen.getByText('New'));

    const createButton = screen.getByText('Create').closest('button')!;
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Buy milk' } });
    expect(createButton).not.toBeDisabled();

    fireEvent.click(createButton);

    await waitFor(() => {
      expect(onCreateTask).toHaveBeenCalledWith('Buy milk', undefined);
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
  ] as const)('invokes onShortcut with "%s" when clicked', (locationId, id) => {
    const { onShortcut } = renderTasksShortcuts();

    const title = getSystemLocationPresentation(locationId).label;
    fireEvent.click(screen.getByText(title));

    expect(onShortcut).toHaveBeenCalledWith(id);
  });

  describe('the Options row (Tasks-view settings)', () => {
    const optionsRow = () => screen.getByText('Options').closest('.entry') as HTMLElement;

    it('has no Completed quick-access row', () => {
      renderTasksShortcuts();

      expect(screen.queryByText(getSystemLocationPresentation('tasks-completed').label)).toBeNull();
    });

    it('is the last row, and All tasks carries no settings button any more', () => {
      renderTasksShortcuts();

      const rows = [...document.querySelectorAll('.entry')].map((row) => row.textContent ?? '');
      expect(rows[rows.length - 1]).toContain('Options');
      expect(screen.queryByLabelText('Task display settings')).toBeNull();
    });

    it('opens the menu (Groups, Display) without navigating, and keeps the row in the hover state (not selected) while open', () => {
      const { onShortcut } = renderTasksShortcuts();

      expect(screen.queryByText('Show completed')).not.toBeInTheDocument();
      expect(optionsRow()).not.toHaveClass('entry-force-hover');

      fireEvent.click(screen.getByText('Options'));

      expect(screen.getByText('Groups')).toBeInTheDocument();
      expect(screen.getByText('Display')).toBeInTheDocument();
      expect(screen.getByText('Show completed')).toBeInTheDocument();
      expect(screen.getByText('Sort completed')).toBeInTheDocument();
      expect(optionsRow()).toHaveClass('entry-force-hover');
      expect(onShortcut).not.toHaveBeenCalled();
    });

    it('writes the shared Tasks-view config and leaves the menu open when a setting is toggled', () => {
      const { onTasksViewConfigChange } = renderTasksShortcuts({
        tasksViewConfig: { showCompleted: true, autoSortCompleted: false },
      });

      fireEvent.click(screen.getByText('Options'));
      fireEvent.click(screen.getByText('Sort completed'));

      expect(onTasksViewConfigChange).toHaveBeenCalledWith({
        showCompleted: true,
        autoSortCompleted: true,
      });
      expect(screen.getByText('Sort completed')).toBeInTheDocument();
    });
  });
});
