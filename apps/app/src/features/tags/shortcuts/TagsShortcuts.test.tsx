// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagsShortcuts } from './TagsShortcuts';

describe('TagsShortcuts', () => {
  it('renders "New" disabled and never invokes onShortcut when clicked', () => {
    const onShortcut = vi.fn();
    render(<TagsShortcuts onShortcut={onShortcut} />);

    const entry = screen.getByText('New').closest('[aria-disabled]');
    expect(entry?.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByText('New'));

    expect(onShortcut).not.toHaveBeenCalled();
  });
});
