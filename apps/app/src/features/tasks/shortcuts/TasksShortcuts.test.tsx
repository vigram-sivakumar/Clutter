// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TasksShortcuts } from './TasksShortcuts';

describe('TasksShortcuts', () => {
  it('renders "Create task" disabled and never invokes onShortcut when clicked', () => {
    const onShortcut = vi.fn();
    render(<TasksShortcuts onShortcut={onShortcut} />);

    const entry = screen.getByText('Create task').closest('[aria-disabled]');
    expect(entry?.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByText('Create task'));

    expect(onShortcut).not.toHaveBeenCalled();
  });
});
