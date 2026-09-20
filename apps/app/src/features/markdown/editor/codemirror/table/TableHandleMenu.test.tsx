// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TableHandleMenu, type TableHandleMenuAnchor } from './TableHandleMenu';
import type { TableHandleMenuSelection } from './tableHandleMenuSync';

/**
 * Focused coverage for `TableHandleMenu`'s own `handleSelect` routing —
 * the one piece of the column-insertion menu wiring not already exercised
 * by `tableColumnInsertion.test.ts` (the real CM6 operations) or by manual
 * live verification (full mouse-driven handle click → menu → item click,
 * which jsdom's lack of real layout can't faithfully reproduce for the
 * handle's own positioning — see `tableHandleOverlay.test.ts`'s own
 * precedent for testing that half at the extension level instead). This
 * file mounts `TableHandleMenu` directly, the same "test the component in
 * isolation, not the whole editor" choice `ImageOptionsMenu`-style menus
 * elsewhere in this codebase make when there's no positioning/DOM-layout
 * concern to exercise — only "does clicking this item call the right
 * prop."
 */

function findMenuItem(label: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) => el.textContent === label) ?? null;
}

beforeEach(() => {
  // jsdom has no real ResizeObserver — needed by Overlay's own positioning
  // hook (`useOverlayPosition.ts`), same stub this codebase's other menu
  // integration tests already establish for exactly this gap.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
});

afterEach(() => {
  cleanup();
});

function renderMenu(
  selection: TableHandleMenuSelection,
  overrides: Partial<Record<'onInsertColumnLeft' | 'onInsertColumnRight' | 'onInsertRowAbove' | 'onInsertRowBelow' | 'onClearContents' | 'onDeleteRow', () => void>> = {}
) {
  const anchorEl = document.body.appendChild(document.createElement('div'));
  const anchor: TableHandleMenuAnchor = { current: anchorEl };
  const onClose = vi.fn();
  const onClearContents = overrides.onClearContents ?? vi.fn();
  const onInsertRowAbove = overrides.onInsertRowAbove ?? vi.fn();
  const onInsertRowBelow = overrides.onInsertRowBelow ?? vi.fn();
  const onInsertColumnLeft = overrides.onInsertColumnLeft ?? vi.fn();
  const onInsertColumnRight = overrides.onInsertColumnRight ?? vi.fn();
  const onDeleteRow = overrides.onDeleteRow ?? vi.fn();

  function Harness() {
    const suppressReturnFocusRef = useRef(false);
    return (
      <TableHandleMenu
        anchor={anchor}
        selection={selection}
        onClose={onClose}
        onClearContents={onClearContents}
        onInsertRowAbove={onInsertRowAbove}
        onInsertRowBelow={onInsertRowBelow}
        onInsertColumnLeft={onInsertColumnLeft}
        onInsertColumnRight={onInsertColumnRight}
        onDeleteRow={onDeleteRow}
        suppressReturnFocusRef={suppressReturnFocusRef}
      />
    );
  }

  render(<Harness />);
  return { onClose, onClearContents, onInsertRowAbove, onInsertRowBelow, onInsertColumnLeft, onInsertColumnRight, onDeleteRow };
}

describe('TableHandleMenu — column item wiring', () => {
  it('lists Insert left/right for a column selection', () => {
    renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    expect(findMenuItem('Insert left')).not.toBeNull();
    expect(findMenuItem('Insert right')).not.toBeNull();
    expect(findMenuItem('Insert above')).toBeNull();
    expect(findMenuItem('Insert below')).toBeNull();
  });

  it('clicking "Insert left" calls onInsertColumnLeft, and only that callback', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    fireEvent.click(findMenuItem('Insert left')!);

    expect(handlers.onInsertColumnLeft).toHaveBeenCalledTimes(1);
    expect(handlers.onInsertColumnRight).not.toHaveBeenCalled();
    expect(handlers.onClearContents).not.toHaveBeenCalled();
  });

  it('clicking "Insert right" calls onInsertColumnRight, and only that callback', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    fireEvent.click(findMenuItem('Insert right')!);

    expect(handlers.onInsertColumnRight).toHaveBeenCalledTimes(1);
    expect(handlers.onInsertColumnLeft).not.toHaveBeenCalled();
    expect(handlers.onClearContents).not.toHaveBeenCalled();
  });

  it('a row selection never renders the column items, and vice versa', () => {
    renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 0 });

    expect(findMenuItem('Insert above')).not.toBeNull();
    expect(findMenuItem('Insert below')).not.toBeNull();
    expect(findMenuItem('Insert left')).toBeNull();
    expect(findMenuItem('Insert right')).toBeNull();
  });
});

describe('TableHandleMenu — "Delete row" wiring', () => {
  it('clicking "Delete row" calls onDeleteRow for a row selection', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    fireEvent.click(findMenuItem('Delete row')!);

    expect(handlers.onDeleteRow).toHaveBeenCalledTimes(1);
  });

  it('clicking "Delete column" never calls onDeleteRow — deletion stays inert for a column selection', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    fireEvent.click(findMenuItem('Delete column')!);

    expect(handlers.onDeleteRow).not.toHaveBeenCalled();
  });
});
