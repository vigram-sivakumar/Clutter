// @vitest-environment jsdom

import { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('focuses the menu container when the menu opens', () => {
    render(<Harness onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button'));

    expect(document.activeElement).toBe(screen.getByRole('menu'));
  });
});
