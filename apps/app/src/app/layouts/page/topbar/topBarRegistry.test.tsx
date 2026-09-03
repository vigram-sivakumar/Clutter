// @vitest-environment jsdom

// No global jest-dom setup exists in this project's vitest config yet —
// imported locally, same as FolderTree.test.tsx/ResourceTopBarActions.test.tsx.
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderTopBarActions } from './topBarRegistry';
import type { TopBarMenuItemConfig } from './ResourceTopBarActions';

// ADR-026: renderFolderActions now forwards options.menu (mirroring
// renderPageActions) instead of a hardcoded constant, since the folder
// menu's 'archive' item is status-dependent (buildFolderTopBarMenu, called
// upstream in buildTopBarActions.tsx — not exercised by this file, which
// tests topBarRegistry's dispatch/forwarding in isolation).
const folderMenu: TopBarMenuItemConfig[] = [
  { id: 'delete', label: 'Delete', icon: 'trash' },
];

// Overlay's positioning logic observes anchor/surface size via
// ResizeObserver, which jsdom doesn't implement — stubbed the same way
// ResourceTopBarActions' own test suite already does.
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

function openOverflowMenu() {
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[buttons.length - 1]!);
}

describe('topBarRegistry — folder resource type (ADR-024)', () => {
  it("wires onDelete to the folder menu's Delete item", () => {
    const onDelete = vi.fn();

    render(<>{renderTopBarActions('folder', { menu: folderMenu, onDelete })}</>);
    openOverflowMenu();

    fireEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders Delete even when onDelete is not supplied — it stays present, just inert (matching every other unwired menu item)', () => {
    render(<>{renderTopBarActions('folder', { menu: folderMenu })}</>);
    openOverflowMenu();

    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it("wires onArchive to the folder menu's Archive item, gated by confirmation when archiveConfirmationMessage is set (ADR-026)", () => {
    const onArchive = vi.fn();
    const menuWithArchive: TopBarMenuItemConfig[] = [
      { id: 'archive', label: 'Archive', icon: 'archive' },
      ...folderMenu,
    ];

    render(
      <>
        {renderTopBarActions('folder', {
          menu: menuWithArchive,
          onArchive,
          archiveConfirmationMessage: 'Archive this folder and everything inside it?',
        })}
      </>
    );
    openOverflowMenu();
    fireEvent.click(screen.getByText('Archive'));

    // Gated: confirmation shown first, handler not yet called.
    expect(onArchive).not.toHaveBeenCalled();
    expect(screen.getByText('Archive this folder and everything inside it?')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Archive' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("wires onDelete to the folder menu's Delete item, gated by confirmation when deleteConfirmationMessage is set", () => {
    const onDelete = vi.fn();

    render(
      <>
        {renderTopBarActions('folder', {
          menu: folderMenu,
          onDelete,
          deleteConfirmationMessage: 'Delete this folder and everything inside it?',
        })}
      </>
    );
    openOverflowMenu();
    fireEvent.click(screen.getByText('Delete'));

    // Gated: confirmation shown first, handler not yet called — this is
    // the fix for the previous stub (the dialog used to show but Confirm
    // never called the real onDelete).
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this folder and everything inside it?')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("a reserved folder renders ReservedFolderTopBarActions instead, with no Delete option", () => {
    render(<>{renderTopBarActions('reserved-folder')}</>);

    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});

describe('topBarRegistry — resource type (Image/PDF Resource Page)', () => {
  const activeResourceMenu: TopBarMenuItemConfig[] = [
    { id: 'rename', label: 'Rename', icon: 'notePencil' },
    { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
    { id: 'archive', label: 'Archive', icon: 'archive' },
  ];

  const archivedResourceMenu: TopBarMenuItemConfig[] = [
    { id: 'restore', label: 'Restore', icon: 'restore' },
    { id: 'delete', label: 'Delete permanently', icon: 'trash' },
  ];

  it("wires onRename to the resource menu's Rename item", () => {
    const onRename = vi.fn();

    render(<>{renderTopBarActions('resource', { menu: activeResourceMenu, onRename })}</>);
    openOverflowMenu();
    fireEvent.click(screen.getByText('Rename'));

    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("wires onArchive to the resource menu's Archive item, with no confirmation (unlike folder/page archive with descendants)", () => {
    const onArchive = vi.fn();

    render(<>{renderTopBarActions('resource', { menu: activeResourceMenu, onArchive })}</>);
    openOverflowMenu();
    fireEvent.click(screen.getByText('Archive'));

    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("wires onRestore to the archived resource menu's Restore item", () => {
    const onRestore = vi.fn();

    render(<>{renderTopBarActions('resource', { menu: archivedResourceMenu, onRestore })}</>);
    openOverflowMenu();
    fireEvent.click(screen.getByText('Restore'));

    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("wires onDelete to the archived resource menu's Delete item, gated by confirmation when deleteConfirmationMessage is set", () => {
    const onDelete = vi.fn();

    render(
      <>
        {renderTopBarActions('resource', {
          menu: archivedResourceMenu,
          onDelete,
          deleteConfirmationMessage: 'Delete this resource permanently?',
        })}
      </>
    );
    openOverflowMenu();
    fireEvent.click(screen.getByText('Delete permanently'));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this resource permanently?')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("wires onMove through the move-to item, same as a note/folder row's Move flow", () => {
    const onMove = vi.fn();

    render(
      <>
        {renderTopBarActions('resource', {
          menu: activeResourceMenu,
          moveDestinations: [{ id: 'folder-1', title: 'Projects', level: 0, parentId: null }],
          onMove,
        })}
      </>
    );
    openOverflowMenu();
    fireEvent.click(screen.getByText('Move to…'));
    fireEvent.click(screen.getByText('Projects'));

    expect(onMove).toHaveBeenCalledWith('folder-1');
  });
});
