// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagsShortcuts } from './TagsShortcuts';

describe('TagsShortcuts', () => {
  it('renders "Create tag" disabled and never invokes onShortcut when clicked', () => {
    const onShortcut = vi.fn();
    render(<TagsShortcuts onShortcut={onShortcut} />);

    const entry = screen.getByText('Create tag').closest('[aria-disabled]');
    expect(entry?.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByText('Create tag'));

    expect(onShortcut).not.toHaveBeenCalled();
  });
});
