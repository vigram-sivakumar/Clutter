// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Folder } from './Folder';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import type { PickerListItem } from '@components/picker-list/PickerList.types';

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

const menuWithMove: OverflowMenuItemConfig[] = [
  { id: 'rename', label: 'Rename', icon: 'notePencil' },
  { id: 'change-icon', label: 'Change icon', icon: 'notePencil' },
  { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
];

const destinations: PickerListItem[] = [
  { id: 'folder-dest', title: 'Elsewhere', level: 0, parentId: null },
];

function FolderHarness({
  onMenuSelect,
  moveDestinations,
  onMove,
  onChangeIcon,
  emoji,
}: {
  onMenuSelect: (id: string) => void;
  moveDestinations?: PickerListItem[];
  onMove?: (destinationFolderId: string | null) => void;
  onChangeIcon?: (emoji: string | null) => void;
  emoji?: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Folder
      title="Projects"
      emoji={emoji}
      menuItems={menuWithMove}
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onMenuSelect={onMenuSelect}
      moveDestinations={moveDestinations}
      onMove={onMove}
      onChangeIcon={onChangeIcon}
    />
  );
}

function openMenu() {
  fireEvent.click(screen.getAllByRole('button').at(-1)!);
}

describe('Folder — sidebar Move wiring', () => {
  it("selecting 'Move to…' opens the same MoveDestinationPicker the topbar uses, not a plain menu handler", () => {
    const onMenuSelect = vi.fn();
    const onMove = vi.fn();
    render(<FolderHarness onMenuSelect={onMenuSelect} moveDestinations={destinations} onMove={onMove} />);

    openMenu();
    fireEvent.click(screen.getByText('Move to…'));

    expect(onMenuSelect).not.toHaveBeenCalled();
    expect(screen.getByText('Elsewhere')).toBeDefined();
    expect(screen.queryByText('Vault root')).toBeNull();

    fireEvent.click(screen.getByText('Elsewhere'));

    expect(onMove).toHaveBeenCalledWith('folder-dest');
  });

  it('renders no picker when moveDestinations is absent — move-to falls through to onMenuSelect', () => {
    const onMenuSelect = vi.fn();
    render(<FolderHarness onMenuSelect={onMenuSelect} />);

    openMenu();
    fireEvent.click(screen.getByText('Move to…'));

    expect(onMenuSelect).toHaveBeenCalledWith('move-to');
  });
});

describe('Folder — sidebar Change icon wiring', () => {
  it("selecting 'Change icon' opens ChangeIconPicker, not a plain menu handler", () => {
    const onMenuSelect = vi.fn();
    const onChangeIcon = vi.fn();
    render(<FolderHarness onMenuSelect={onMenuSelect} onChangeIcon={onChangeIcon} />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));

    expect(onMenuSelect).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Search emoji')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'grinning face' }));

    expect(onChangeIcon).toHaveBeenCalledWith('😀');
  });

  it('renders no picker when onChangeIcon is absent — change-icon falls through to onMenuSelect', () => {
    const onMenuSelect = vi.fn();
    render(<FolderHarness onMenuSelect={onMenuSelect} />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));

    expect(onMenuSelect).toHaveBeenCalledWith('change-icon');
  });

  it('disables the remove button when the folder has no icon', () => {
    render(<FolderHarness onMenuSelect={vi.fn()} onChangeIcon={vi.fn()} />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));

    expect(screen.getByRole('button', { name: 'Remove icon' })).toBeDisabled();
  });

  it('removes the icon when the remove button is clicked', () => {
    const onChangeIcon = vi.fn();
    render(<FolderHarness onMenuSelect={vi.fn()} onChangeIcon={onChangeIcon} emoji="📁" />);

    openMenu();
    fireEvent.click(screen.getByText('Change icon'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove icon' }));

    expect(onChangeIcon).toHaveBeenCalledWith(null);
  });
});

describe('Folder — title truncation', () => {
  it('marks the title .truncate, explicitly rather than via Entry.css', () => {
    render(<FolderHarness onMenuSelect={vi.fn()} />);

    expect(document.querySelector('.folder__title')).toHaveClass('truncate');
  });
});

describe('Folder — count badge', () => {
  it('shows a CountBadge in the trailing slot when given a count, marked to show only on sidebar hover', () => {
    render(<Folder title="Projects" count={4} />);

    const badge = screen.getByText('Projects').closest('.entry')!.querySelector('.entry__meta .count-badge')!;
    expect(badge.textContent).toBe('4');
    expect(badge.classList.contains('count-badge--small')).toBe(true);
    expect(badge.classList.contains('count-badge--on-sidebar-hover')).toBe(true);
  });

  it('shows nothing for a count of zero', () => {
    render(<Folder title="Projects" count={0} />);

    expect(document.querySelector('.count-badge')).toBeNull();
  });

  it('caps a large count the way every badge does', () => {
    render(<Folder title="Projects" count={250} />);

    expect(document.querySelector('.count-badge')!.textContent).toBe('99+');
  });

  it('without a count, adds no badge and leaves the caller’s own trailing content alone', () => {
    render(<Folder title="Projects" trailing={<span data-testid="mine">x</span>} />);

    expect(document.querySelector('.count-badge')).toBeNull();
    expect(screen.getByTestId('mine')).not.toBeNull();
  });

  it('does not change the label: the title is the same with or without the badge', () => {
    const { container, rerender } = render(<Folder title="Projects" />);
    const without = container.querySelector('.folder__title')!.outerHTML;

    rerender(<Folder title="Projects" count={4} />);

    expect(container.querySelector('.folder__title')!.outerHTML).toBe(without);
  });
});

