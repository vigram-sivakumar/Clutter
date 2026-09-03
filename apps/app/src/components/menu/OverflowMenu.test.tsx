// @vitest-environment jsdom

import { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { OverflowMenu } from './OverflowMenu';
import type { OverflowMenuItemConfig } from './OverflowMenu';

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

const items: OverflowMenuItemConfig[] = [
  { id: 'rename', label: 'Rename', icon: 'notePencil' },
  { id: 'delete', label: 'Delete', icon: 'trash' },
];

function Harness({
  onSelect,
  itemsOverride,
}: {
  onSelect: (id: string) => void;
  itemsOverride?: OverflowMenuItemConfig[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <OverflowMenu
      items={itemsOverride ?? items}
      open={open}
      onOpenChange={setOpen}
      onSelect={onSelect}
    />
  );
}

describe('OverflowMenu', () => {
  it('is closed until the trigger is clicked', () => {
    render(<Harness onSelect={vi.fn()} />);

    expect(screen.queryByText('Rename')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Rename')).toBeInTheDocument();
  });

  it('the trigger exposes aria-haspopup/aria-expanded — a stable selector independent of a row\'s other buttons', () => {
    render(<Harness onSelect={vi.fn()} />);
    const trigger = screen.getByRole('button');

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders nothing at all for an empty item list (no trigger button)', () => {
    render(<Harness onSelect={vi.fn()} itemsOverride={[]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('anchors the menu to the trigger button', () => {
    render(<Harness onSelect={vi.fn()} />);
    const trigger = screen.getByRole('button');

    fireEvent.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closing via outside click hides the menu', () => {
    render(
      <div>
        <Harness onSelect={vi.fn()} />
        <div data-testid="outside" />
      </div>
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Rename')).toBeInTheDocument();

    const backdrop = document.querySelector('.overlay__backdrop');
    if (!backdrop) {
      throw new Error('expected a backdrop element for outside-click handling');
    }
    fireEvent.click(backdrop);

    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('Escape closes the menu', () => {
    render(<Harness onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Rename')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('selecting an item calls onSelect with its id and closes the menu', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Rename'));

    expect(onSelect).toHaveBeenCalledWith('rename');
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('ArrowDown then Enter selects the first item — same useMenuKeyboard the page topbar menu uses', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button'));
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('rename');
  });

  it('a disabled item never invokes onSelect', () => {
    const onSelect = vi.fn();
    render(
      <Harness
        onSelect={onSelect}
        itemsOverride={[{ id: 'delete', label: 'Delete', icon: 'trash', disabled: true }]}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Delete'));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking the trigger does not bubble to an ancestor click handler', () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <Harness onSelect={vi.fn()} />
      </div>
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('selecting a menu item does not bubble to an ancestor click handler, even though the menu renders through a DOM portal', () => {
    // Overlay renders the menu via createPortal(document.body) — not a
    // descendant in the DOM, but still one in the React tree, so React
    // still bubbles a click on a menu item up through this wrapping div
    // unless the item itself stops propagation. Regression test for
    // exactly that: a sidebar row's own click handler (Entry) was
    // incorrectly firing whenever any overflow-menu item was selected,
    // since Entry's nested-interactive-element guard walks the real DOM
    // and can never see a portaled element as its own descendant.
    const onRowClick = vi.fn();
    const onSelect = vi.fn();
    render(
      <div onClick={onRowClick}>
        <Harness onSelect={onSelect} />
      </div>
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Rename'));

    expect(onSelect).toHaveBeenCalledWith('rename');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('focuses the menu container when the menu opens', () => {
    render(<Harness onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button'));

    expect(document.activeElement).toBe(screen.getByRole('menu'));
  });

  describe('focus after closing', () => {
    it('selecting an ordinary item (no opensInlineEdit) restores focus to the trigger — unchanged default behavior', async () => {
      render(<Harness onSelect={vi.fn()} />);
      const trigger = screen.getByRole('button');

      fireEvent.click(trigger);
      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(document.activeElement).toBe(trigger);
      });
    });

    it('Escape still restores focus to the trigger — unaffected by opensInlineEdit items existing in the menu', async () => {
      render(<Harness onSelect={vi.fn()} />);
      const trigger = screen.getByRole('button');

      fireEvent.click(trigger);
      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(document.activeElement).toBe(trigger);
      });
    });

    it('an outside click still restores focus to the trigger', async () => {
      render(
        <div>
          <Harness onSelect={vi.fn()} />
        </div>
      );
      const trigger = screen.getByRole('button');

      fireEvent.click(trigger);
      const backdrop = document.querySelector('.overlay__backdrop');
      if (!backdrop) {
        throw new Error('expected a backdrop element for outside-click handling');
      }
      fireEvent.click(backdrop);

      await waitFor(() => {
        expect(document.activeElement).toBe(trigger);
      });
    });

    it('selecting an opensInlineEdit item does NOT restore focus to the trigger — the caller\'s own element keeps it', () => {
      // No EditableText involved here — this isolates OverflowMenu's own
      // contract (does it skip the restore?) from the full Note/Folder/Tag
      // row behavior, which has its own dedicated tests
      // (Sidebar.Notes.test.tsx, Sidebar.Tags.test.tsx).
      const onSelect = vi.fn();
      render(
        <Harness
          onSelect={onSelect}
          itemsOverride={[{ id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true }]}
        />
      );
      const trigger = screen.getByRole('button');

      fireEvent.click(trigger);
      fireEvent.click(screen.getByText('Rename'));

      // Focus moved off the (now-removed) menu and did NOT return to the
      // trigger — the suppression held. Exactly where it lands next is the
      // caller's own concern (e.g. EditableText's autoFocus).
      expect(document.activeElement).not.toBe(trigger);
    });
  });

  describe('submenu', () => {
    const itemsWithSubmenu: OverflowMenuItemConfig[] = [
      { id: 'rename', label: 'Rename', icon: 'notePencil' },
      {
        id: 'copy-path',
        label: 'Copy path',
        icon: 'copy',
        submenu: [
          { id: 'at-vault', label: 'From vault' },
          { id: 'full-path', label: 'Full path' },
        ],
      },
      { id: 'archive', label: 'Archive', icon: 'archive' },
    ];

    it('opens on hover, without needing a click', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      expect(screen.queryByText('From vault')).not.toBeInTheDocument();

      fireEvent.mouseEnter(screen.getByText('Copy path'));

      expect(screen.getByText('From vault')).toBeInTheDocument();
      expect(screen.getByText('Full path')).toBeInTheDocument();
    });

    it('also opens on click, for a mouse user who clicks without hovering first', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('Copy path'));

      expect(screen.getByText('From vault')).toBeInTheDocument();
    });

    it('the parent menu stays open and visible while the submenu is open', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.mouseEnter(screen.getByText('Copy path'));

      expect(screen.getByText('Rename')).toBeInTheDocument();
      expect(screen.getByText('Archive')).toBeInTheDocument();
      expect(screen.getByText('Copy path')).toBeInTheDocument();
    });

    it('hovering a different top-level item closes the open submenu', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.mouseEnter(screen.getByText('Copy path'));
      expect(screen.getByText('From vault')).toBeInTheDocument();

      fireEvent.mouseEnter(screen.getByText('Archive'));

      expect(screen.queryByText('From vault')).not.toBeInTheDocument();
    });

    it('selecting a submenu leaf calls onSelect with the leaf id and closes the whole menu', () => {
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.mouseEnter(screen.getByText('Copy path'));
      fireEvent.click(screen.getByText('From vault'));

      expect(onSelect).toHaveBeenCalledWith('at-vault');
      expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    });

    it('closing the parent menu closes any open submenu — it does not stay open the next time the menu opens', () => {
      render(
        <div>
          <Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />
        </div>
      );

      const trigger = screen.getByRole('button');
      fireEvent.click(trigger);
      fireEvent.mouseEnter(screen.getByText('Copy path'));
      expect(screen.getByText('From vault')).toBeInTheDocument();

      // An outside click closes everything in one shot (the parent's own
      // backdrop covers this submenu too) — unlike Escape, see below, which
      // is scoped to the innermost open overlay.
      const backdrop = document.querySelector('.overlay__backdrop');
      if (!backdrop) {
        throw new Error('expected a backdrop element for outside-click handling');
      }
      fireEvent.click(backdrop);
      expect(screen.queryByText('Rename')).not.toBeInTheDocument();

      fireEvent.click(trigger);

      expect(screen.getByText('Rename')).toBeInTheDocument();
      expect(screen.queryByText('From vault')).not.toBeInTheDocument();
    });

    it('Escape closes only the open submenu first, then the parent menu on a second press — standard nested-menu behavior', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      const trigger = screen.getByRole('button');
      fireEvent.click(trigger);
      fireEvent.mouseEnter(screen.getByText('Copy path'));
      expect(screen.getByText('From vault')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('From vault')).not.toBeInTheDocument();
      expect(screen.getByText('Rename')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    });

    it('opening the submenu does not move keyboard ownership to whatever is behind the menu — focus stays inside the menu system', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      const parentMenu = screen.getByRole('menu');

      fireEvent.mouseEnter(screen.getByText('Copy path'));

      const menus = screen.getAllByRole('menu');
      expect(menus).toHaveLength(2);
      expect(document.activeElement).not.toBe(document.body);
      expect(menus).toContain(document.activeElement);
      expect(document.activeElement).not.toBe(parentMenu);
    });

    it('ArrowDown while the submenu is focused navigates only the submenu — it does not also move the parent menu\'s own active item', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      const parentMenu = screen.getByRole('menu');
      fireEvent.mouseEnter(screen.getByText('Copy path'));

      const parentActiveBefore = parentMenu.getAttribute('aria-activedescendant');

      const submenu = screen
        .getAllByRole('menu')
        .find((menu) => menu !== parentMenu)!;
      fireEvent.keyDown(submenu, { key: 'ArrowDown' });

      expect(submenu.getAttribute('aria-activedescendant')).not.toBeNull();
      // The parent's own active item (still "Copy path", from the hover)
      // must be untouched by a keystroke the submenu already owns and
      // handled — this is the regression test for the bug where a single
      // ArrowDown, while the submenu had focus, silently also advanced the
      // parent's own activeId via React's fiber-tree event bubbling.
      expect(parentMenu.getAttribute('aria-activedescendant')).toBe(
        parentActiveBefore
      );
    });

    it('Right Arrow on a submenu-trigger item opens and focuses its submenu', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      const parentMenu = screen.getByRole('menu');

      fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Rename
      fireEvent.keyDown(parentMenu, { key: 'ArrowDown' }); // Copy path
      expect(screen.queryByText('From vault')).not.toBeInTheDocument();

      fireEvent.keyDown(parentMenu, { key: 'ArrowRight' });

      expect(screen.getByText('From vault')).toBeInTheDocument();
      const submenu = screen
        .getAllByRole('menu')
        .find((menu) => menu !== parentMenu)!;
      expect(document.activeElement).toBe(submenu);
    });

    it('Left Arrow in the submenu closes it and returns focus to the parent menu', () => {
      render(<Harness onSelect={vi.fn()} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      const parentMenu = screen.getByRole('menu');
      fireEvent.mouseEnter(screen.getByText('Copy path'));

      const submenu = screen
        .getAllByRole('menu')
        .find((menu) => menu !== parentMenu)!;
      fireEvent.keyDown(submenu, { key: 'ArrowLeft' });

      expect(screen.queryByText('From vault')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(parentMenu);
    });

    it('Enter selects the currently focused submenu item', () => {
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} itemsOverride={itemsWithSubmenu} />);

      fireEvent.click(screen.getByRole('button'));
      const parentMenu = screen.getByRole('menu');
      fireEvent.mouseEnter(screen.getByText('Copy path'));

      const submenu = screen
        .getAllByRole('menu')
        .find((menu) => menu !== parentMenu)!;
      fireEvent.keyDown(submenu, { key: 'ArrowDown' });
      fireEvent.keyDown(submenu, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith('at-vault');
      expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    });

    it('existing non-submenu menus are unaffected — ArrowLeft/ArrowRight do nothing without a submenu present', () => {
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} />);

      fireEvent.click(screen.getByRole('button'));
      const menu = screen.getByRole('menu');

      fireEvent.keyDown(menu, { key: 'ArrowDown' });
      fireEvent.keyDown(menu, { key: 'ArrowRight' });
      fireEvent.keyDown(menu, { key: 'ArrowLeft' });
      fireEvent.keyDown(menu, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledWith('rename');
    });
  });
});
