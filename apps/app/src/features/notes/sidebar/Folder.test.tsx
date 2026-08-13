// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Folder } from './Folder';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';

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
  { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
];

const destinations: FolderPickerItem[] = [
  { id: 'folder-dest', title: 'Elsewhere', level: 0, parentId: null },
];

function FolderHarness({
  onMenuSelect,
  moveDestinations,
  onMove,
}: {
  onMenuSelect: (id: string) => void;
  moveDestinations?: FolderPickerItem[];
  onMove?: (destinationFolderId: string | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Folder
      title="Projects"
      menuItems={menuWithMove}
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onMenuSelect={onMenuSelect}
      moveDestinations={moveDestinations}
      onMove={onMove}
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
