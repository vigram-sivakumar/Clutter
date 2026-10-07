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
    onNewTask: vi.fn(),
    onNewFolder: vi.fn(),
    onNewTag: vi.fn(),
    onNewTemplate: vi.fn(),
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
      handlers.onNewTask,
      handlers.onNewFolder,
      handlers.onNewTag,
      handlers.onNewTemplate,
    ]) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('lists the creation types in order, template after a divider', () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['New note', 'New task', 'New folder', 'New tag', 'New template']);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it.each([
    ['New note', 'onNewNote'],
    ['New task', 'onNewTask'],
    ['New folder', 'onNewFolder'],
    ['New tag', 'onNewTag'],
    ['New template', 'onNewTemplate'],
  ] as const)('choosing "%s" calls %s once and closes the menu', (label, handlerName) => {
    const handlers = renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
