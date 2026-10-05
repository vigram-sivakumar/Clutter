// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotesShortcuts } from './NotesShortcuts';

afterEach(() => {
  cleanup();
});

describe('NotesShortcuts', () => {
  it('renders every configured shortcut and invokes onShortcut with its id when clicked', () => {
    const onShortcut = vi.fn();
    render(<NotesShortcuts onShortcut={onShortcut} />);

    fireEvent.click(screen.getByText('Inbox'));

    expect(onShortcut).toHaveBeenCalledWith('inbox');
  });

  it('renders the Assets shortcut and invokes onShortcut with its id when clicked', () => {
    const onShortcut = vi.fn();
    render(<NotesShortcuts onShortcut={onShortcut} />);

    fireEvent.click(screen.getByText('Assets'));

    expect(onShortcut).toHaveBeenCalledWith('assets');
  });

  it('renders none of its shortcuts as disabled today (no entry declares disabled)', () => {
    const onShortcut = vi.fn();
    render(<NotesShortcuts onShortcut={onShortcut} />);

    const entry = screen.getByText('New').closest('[aria-disabled]');
    expect(entry?.getAttribute('aria-disabled')).not.toBe('true');

    fireEvent.click(screen.getByText('New'));
    expect(onShortcut).toHaveBeenCalledWith('new-note');
  });
});
