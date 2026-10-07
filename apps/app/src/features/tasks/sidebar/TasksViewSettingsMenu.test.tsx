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

  it('shows a Groups section (Today, Overdue, Upcoming, Unscheduled), a divider, then a Display section with Show completed and Sort completed', () => {
    const { getByText, getAllByRole } = renderOpenMenu();

    expect(getByText('Groups')).toBeInTheDocument();
    expect(getByText('Display')).toBeInTheDocument();
    expect(// The Today calendar icon renders the current date's number as text — strip it.
    getAllByRole('menuitem').map((el) => (el.textContent ?? '').replace(/^\d+/, ''))).toEqual([
      'Today',
      'Overdue',
      'Upcoming',
      'Unscheduled',
      'Show completed',
      'Sort completed',
    ]);
    expect(getAllByRole('separator')).toHaveLength(1);
  });

  it('toggling a group writes it into hiddenGroups (and back out) without closing the menu', () => {
    const { getByText, onConfigChange, onOpenChange } = renderOpenMenu();

    fireEvent.click(getByText('Overdue'));

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ hiddenGroups: ['overdue'] })
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('uses the tick-selection pattern — a trailing tick icon when enabled, no tick when disabled, an icon in the leading slot (never a checkbox/radio input)', () => {
    const { getByText, container } = renderOpenMenu({
      showCompleted: true,
      autoSortCompleted: false,
    });

    const showRow = getByText('Show completed').closest('.entry')!;
    const sortRow = getByText('Sort completed').closest('.entry')!;

    expect(showRow.querySelector('.entry__meta svg')).toBeInTheDocument();
    expect(sortRow.querySelector('.entry__meta svg')).not.toBeInTheDocument();
    // Every item carries a leading icon; the tick (trailing) is the only on/off signal.
    expect(showRow.querySelector('.entry__leading svg')).toBeInTheDocument();
    expect(sortRow.querySelector('.entry__leading svg')).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="checkbox"], input[type="radio"]')).toHaveLength(0);
  });

  it('shows both ticked when both settings are enabled', () => {
    const { getByText } = renderOpenMenu({ showCompleted: true, autoSortCompleted: true });

    const showRow = getByText('Show completed').closest('.entry')!;
    const sortRow = getByText('Sort completed').closest('.entry')!;

    expect(showRow.querySelector('.entry__meta svg')).toBeInTheDocument();
    expect(sortRow.querySelector('.entry__meta svg')).toBeInTheDocument();
  });

  it('shows neither ticked when both settings are disabled', () => {
    const { getByText } = renderOpenMenu({ showCompleted: false, autoSortCompleted: false });

    const showRow = getByText('Show completed').closest('.entry')!;
    const sortRow = getByText('Sort completed').closest('.entry')!;

    expect(showRow.querySelector('.entry__meta svg')).not.toBeInTheDocument();
    expect(sortRow.querySelector('.entry__meta svg')).not.toBeInTheDocument();
  });

  it('clicking Show completed flips only that field, keeping Sort completed intact', () => {
    const { getByText, onConfigChange } = renderOpenMenu({
      showCompleted: true,
      autoSortCompleted: true,
    });

    fireEvent.click(getByText('Show completed'));

    expect(onConfigChange).toHaveBeenCalledWith({ showCompleted: false, autoSortCompleted: true });
  });

  it('clicking Sort completed flips only that field, keeping Show completed intact', () => {
    const { getByText, onConfigChange } = renderOpenMenu({
      showCompleted: false,
      autoSortCompleted: false,
    });

    fireEvent.click(getByText('Sort completed'));

    expect(onConfigChange).toHaveBeenCalledWith({ showCompleted: false, autoSortCompleted: true });
  });

  it('selecting Show completed leaves the menu open', () => {
    const { getByText, onOpenChange } = renderOpenMenu();

    fireEvent.click(getByText('Show completed'));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('selecting Sort completed leaves the menu open', () => {
    const { getByText, onOpenChange } = renderOpenMenu();

    fireEvent.click(getByText('Sort completed'));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
