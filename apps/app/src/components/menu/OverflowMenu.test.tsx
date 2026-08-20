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
});
