// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TasksShortcuts } from './TasksShortcuts';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';

afterEach(() => {
  cleanup();
});

describe('TasksShortcuts', () => {
  it('renders "New" disabled and never invokes onShortcut when clicked', () => {
    const onShortcut = vi.fn();
    render(<TasksShortcuts onShortcut={onShortcut} />);

    const entry = screen.getByText('New').closest('[aria-disabled]');
    expect(entry?.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByText('New'));

    expect(onShortcut).not.toHaveBeenCalled();
  });

  it.each([
    ['tasks-all', 'all-tasks'],
    ['tasks-unscheduled', 'unscheduled'],
    ['tasks-completed', 'completed'],
  ] as const)('invokes onShortcut with "%s" when clicked', (locationId, id) => {
    const onShortcut = vi.fn();
    render(<TasksShortcuts onShortcut={onShortcut} />);

    const title = getSystemLocationPresentation(locationId).label;
    fireEvent.click(screen.getByText(title));

    expect(onShortcut).toHaveBeenCalledWith(id);
  });
});
