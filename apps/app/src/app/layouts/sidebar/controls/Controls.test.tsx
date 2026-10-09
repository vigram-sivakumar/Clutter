// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Controls } from './Controls';

// Overlay positioning observes elements via ResizeObserver, which jsdom lacks.
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

function renderControls() {
  const handlers = {
    onNewNote: vi.fn(),
    onOpenDailyNote: vi.fn(),
    onNewTask: vi.fn(),
    onNewFolder: vi.fn(),
    onNewTag: vi.fn(),
    onNewTemplate: vi.fn(),
    onUpload: vi.fn(),
  };
  const view = render(<Controls {...handlers} />);

  return { ...view, ...handlers };
}

describe('Controls no longer renders navigation history (relocated to PageTopBar)', () => {
  it('renders no history-controls group — the arrows live in the topbar now', () => {
    const { container } = renderControls();

    expect(container.querySelector('.history-controls')).toBeNull();
  });

  it('leaves the create buttons enabled, no longer gated on navigation history', () => {
    const { container } = renderControls();

    const buttons = container.querySelectorAll<HTMLButtonElement>(
      '.create-controls button'
    );
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.disabled).toBe(false);
    }
  });
});

describe('Controls no longer renders the sidebar-toggle button (moved to SidebarToggle)', () => {
  it('renders no .sidebar-toggle — that control lives in AppLayout now', () => {
    const { container } = renderControls();

    expect(container.querySelector('.sidebar-toggle')).toBeNull();
  });
});

describe('Controls creation launcher', () => {
  it('+ creates a note immediately, without opening the menu', () => {
    const { onNewNote } = renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'New note' }));

    expect(onNewNote).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('the chevron opens the menu without creating anything', () => {
    const handlers = renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toHaveClass('button--active');
    for (const handler of [
      handlers.onNewNote,
      handlers.onOpenDailyNote,
      handlers.onNewTask,
      handlers.onNewFolder,
      handlers.onNewTag,
      handlers.onNewTemplate,
      handlers.onUpload,
    ]) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('lists the creation types in order under a Create New title, template after a divider', () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Create New')).toBeInTheDocument();

    const items = screen
      .getAllByRole('menuitem')
      // The calendar-today icon draws the current day number as text — not part of the label.
      .map((item) => item.textContent?.replace(/^\d+/, ''));
    // Daily Note carries its muted trailing metadata ("Today") in the same row.
    expect(items).toEqual(['Note', 'Daily NoteToday', 'Task', 'Folder', 'Tag', 'Template', 'Upload']);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it.each([
    ['Note', 'onNewNote'],
    ['Daily Note', 'onOpenDailyNote'],
    ['Task', 'onNewTask'],
    ['Folder', 'onNewFolder'],
    ['Tag', 'onNewTag'],
    ['Template', 'onNewTemplate'],
    ['Upload', 'onUpload'],
  ] as const)('choosing "%s" calls %s once and closes the menu', (label, handlerName) => {
    const handlers = renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${label}`) }));

    expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows "Today" as muted trailing metadata on Daily Note, using the shared entry meta slot', () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const row = screen.getByRole('menuitem', { name: /^Daily Note/ });
    expect(row.querySelector('.entry__meta')).toHaveTextContent('Today');
  });
});
