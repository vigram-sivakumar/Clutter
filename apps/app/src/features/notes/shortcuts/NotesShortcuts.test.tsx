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

  describe('counts', () => {
    const rowOf = (title: string) => screen.getByText(title).closest('.entry') as HTMLElement;

    it('shows a CountBadge in the Inbox row’s trailing slot, marked to show only on sidebar hover', () => {
      render(<NotesShortcuts onShortcut={vi.fn()} counts={{ inbox: 7 }} />);

      const badge = rowOf('Inbox').querySelector('.entry__meta .count-badge') as HTMLElement;
      expect(badge.textContent).toBe('7');
      expect(badge.classList.contains('count-badge--small')).toBe(true);
      expect(badge.classList.contains('count-badge--on-sidebar-hover')).toBe(true);
    });

    it('shows no badge for a count of zero, or for entries given no count', () => {
      render(<NotesShortcuts onShortcut={vi.fn()} counts={{ inbox: 0 }} />);

      expect(document.querySelector('.count-badge')).toBeNull();
      expect(rowOf('Templates').querySelector('.count-badge')).toBeNull();
    });

    it('without counts, renders exactly as before: no badge anywhere', () => {
      render(<NotesShortcuts onShortcut={vi.fn()} />);

      expect(document.querySelector('.count-badge')).toBeNull();
    });

    it('leaves the row’s label and click behaviour alone', () => {
      const onShortcut = vi.fn();
      const { container, rerender } = render(<NotesShortcuts onShortcut={onShortcut} />);
      const without = container.querySelector('.sidebar__navigation .entry__content')!.outerHTML;

      rerender(<NotesShortcuts onShortcut={onShortcut} counts={{ inbox: 7 }} />);
      expect(rowOf('Inbox').querySelector('.entry__content')!.textContent).toBe('Inbox');
      expect(container.querySelector('.sidebar__navigation .entry__content')!.outerHTML).toBe(without);

      fireEvent.click(screen.getByText('Inbox'));
      expect(onShortcut).toHaveBeenCalledWith('inbox');
    });
  });
});

