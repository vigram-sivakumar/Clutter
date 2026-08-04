// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TasksShortcuts } from './TasksShortcuts';

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
    ['All Tasks', 'all-tasks'],
    ['Unscheduled', 'unscheduled'],
    ['Completed', 'completed'],
  ] as const)('invokes onShortcut with "%s" when clicked', (title, id) => {
    const onShortcut = vi.fn();
    render(<TasksShortcuts onShortcut={onShortcut} />);

    fireEvent.click(screen.getByText(title));

    expect(onShortcut).toHaveBeenCalledWith(id);
  });
});
