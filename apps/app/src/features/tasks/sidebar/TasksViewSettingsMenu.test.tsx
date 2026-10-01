// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TasksViewSettingsMenu } from './TasksViewSettingsMenu';
import { DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from '../helpers/groupTasks';

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

function renderMenu(config: TaskDisplayConfig = DEFAULT_TASK_DISPLAY_CONFIG) {
  const onConfigChange = vi.fn();
  const onOpenChange = vi.fn();
  const utils = render(
    <TasksViewSettingsMenu
      config={config}
      onConfigChange={onConfigChange}
      open={false}
      onOpenChange={onOpenChange}
    />
  );
  const trigger = utils.container.querySelector('[aria-haspopup="menu"]')!;
  return { ...utils, trigger, onConfigChange, onOpenChange };
}

describe('TasksViewSettingsMenu — trigger', () => {
  it('renders a settings icon-only trigger button', () => {
    const { trigger } = renderMenu();

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    // Its always-visible placement is the All Tasks row's own concern
    // (Entry's `trailing` slot, see TasksShortcuts.tsx) — this component
    // only renders the trigger and its menu.
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('clicking the trigger asks the caller to open the menu, via onOpenChange — open state is caller-owned', () => {
    const { trigger, onOpenChange } = renderMenu();

    fireEvent.click(trigger);

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});

describe('TasksViewSettingsMenu — menu contents (open)', () => {
  function renderOpenMenu(config: TaskDisplayConfig = DEFAULT_TASK_DISPLAY_CONFIG) {
    const onConfigChange = vi.fn();
    const onOpenChange = vi.fn();
    const utils = render(
      <TasksViewSettingsMenu
        config={config}
        onConfigChange={onConfigChange}
        open
        onOpenChange={onOpenChange}
      />
    );
    return { ...utils, onConfigChange, onOpenChange };
  }

  it('shows exactly two actions: Show completed and Auto-sort completed', () => {
    const { getByText, getAllByRole } = renderOpenMenu();

    expect(getByText('Show completed')).toBeInTheDocument();
    expect(getByText('Auto-sort completed')).toBeInTheDocument();
    expect(getAllByRole('menuitem')).toHaveLength(2);
  });

  it('uses the tick-selection pattern — a trailing tick icon when enabled, no tick when disabled, nothing in the leading slot (never a checkbox/radio input)', () => {
    const { getByText, container } = renderOpenMenu({
      showCompleted: true,
      autoSortCompleted: false,
    });

    const showRow = getByText('Show completed').closest('.entry')!;
    const sortRow = getByText('Auto-sort completed').closest('.entry')!;

    expect(showRow.querySelector('.entry__meta svg')).toBeInTheDocument();
    expect(sortRow.querySelector('.entry__meta svg')).not.toBeInTheDocument();
    expect(showRow.querySelector('.entry__leading')).not.toBeInTheDocument();
    expect(sortRow.querySelector('.entry__leading')).not.toBeInTheDocument();
    expect(container.querySelectorAll('input[type="checkbox"], input[type="radio"]')).toHaveLength(0);
  });

  it('shows both ticked when both settings are enabled', () => {
    const { getByText } = renderOpenMenu({ showCompleted: true, autoSortCompleted: true });

    const showRow = getByText('Show completed').closest('.entry')!;
    const sortRow = getByText('Auto-sort completed').closest('.entry')!;

    expect(showRow.querySelector('.entry__meta svg')).toBeInTheDocument();
    expect(sortRow.querySelector('.entry__meta svg')).toBeInTheDocument();
  });

  it('shows neither ticked when both settings are disabled', () => {
    const { getByText } = renderOpenMenu({ showCompleted: false, autoSortCompleted: false });

    const showRow = getByText('Show completed').closest('.entry')!;
    const sortRow = getByText('Auto-sort completed').closest('.entry')!;

    expect(showRow.querySelector('.entry__meta svg')).not.toBeInTheDocument();
    expect(sortRow.querySelector('.entry__meta svg')).not.toBeInTheDocument();
  });

  it('clicking Show completed flips only that field, keeping Auto-sort completed intact', () => {
    const { getByText, onConfigChange } = renderOpenMenu({
      showCompleted: true,
      autoSortCompleted: true,
    });

    fireEvent.click(getByText('Show completed'));

    expect(onConfigChange).toHaveBeenCalledWith({ showCompleted: false, autoSortCompleted: true });
  });

  it('clicking Auto-sort completed flips only that field, keeping Show completed intact', () => {
    const { getByText, onConfigChange } = renderOpenMenu({
      showCompleted: false,
      autoSortCompleted: false,
    });

    fireEvent.click(getByText('Auto-sort completed'));

    expect(onConfigChange).toHaveBeenCalledWith({ showCompleted: false, autoSortCompleted: true });
  });

  it('selecting Show completed closes the menu', () => {
    const { getByText, onOpenChange } = renderOpenMenu();

    fireEvent.click(getByText('Show completed'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('selecting Auto-sort completed closes the menu', () => {
    const { getByText, onOpenChange } = renderOpenMenu();

    fireEvent.click(getByText('Auto-sort completed'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
