// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ResourceTopBarActions } from './ResourceTopBarActions';
import type { TopBarMenuItemConfig } from './ResourceTopBarActions';

// Overlay's positioning logic observes anchor/surface size via
// ResizeObserver, which jsdom doesn't implement — stubbed the same way
// Overlay's own test suite already does.
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

const menu: TopBarMenuItemConfig[] = [
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'add-a-description', label: 'Add a description', icon: 'description' },
];

function openMenu() {
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[2]!);
}

describe('ResourceTopBarActions', () => {
  it('renders every configured menu item', () => {
    render(<ResourceTopBarActions menu={menu} />);
    openMenu();

    expect(screen.getByText('Archive')).toBeDefined();
    expect(screen.getByText('Add a description')).toBeDefined();
  });

  it('calls the handler matching the clicked item id', () => {
    const onArchive = vi.fn();
    render(<ResourceTopBarActions menu={menu} handlers={{ archive: onArchive }} />);
    openMenu();

    fireEvent.click(screen.getByText('Archive'));

    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it('does nothing but close the menu for an item with no matching handler', () => {
    const onArchive = vi.fn();
    render(<ResourceTopBarActions menu={menu} handlers={{ archive: onArchive }} />);
    openMenu();

    fireEvent.click(screen.getByText('Add a description'));

    expect(onArchive).not.toHaveBeenCalled();
  });

  it('renders with no handlers at all without throwing', () => {
    render(<ResourceTopBarActions menu={menu} />);
    openMenu();

    expect(() => fireEvent.click(screen.getByText('Archive'))).not.toThrow();
  });

  it('renders a disabled item but never invokes its handler on click', () => {
    const onArchive = vi.fn();
    const disabledMenu: TopBarMenuItemConfig[] = [
      { id: 'archive', label: 'Archive', icon: 'archive', disabled: true },
    ];
    render(<ResourceTopBarActions menu={disabledMenu} handlers={{ archive: onArchive }} />);
    openMenu();

    expect(screen.getByText('Archive')).toBeDefined();
    fireEvent.click(screen.getByText('Archive'));

    expect(onArchive).not.toHaveBeenCalled();
  });
});
