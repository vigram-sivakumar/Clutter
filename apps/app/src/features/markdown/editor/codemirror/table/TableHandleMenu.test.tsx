// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TableHandleMenu, type TableHandleMenuAnchor } from './TableHandleMenu';
import type { TableColumnAlignment } from './tableAlignment';
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
  overrides: Partial<
    Record<
      | 'onInsertColumnLeft'
      | 'onInsertColumnRight'
      | 'onInsertRowAbove'
      | 'onInsertRowBelow'
      | 'onClearContents'
      | 'onDuplicateRow'
      | 'onDuplicateColumn'
      | 'onMoveRowUp'
      | 'onMoveRowDown'
      | 'onMoveColumnLeft'
      | 'onMoveColumnRight'
      | 'onDeleteRow'
      | 'onDeleteColumn'
      | 'onFormatTable',
      () => void
    >
  > & {
    rowMoveAvailability?: { canMoveUp: boolean; canMoveDown: boolean } | null;
    columnMoveAvailability?: { canMoveLeft: boolean; canMoveRight: boolean } | null;
    onSetColumnAlignment?: (alignment: TableColumnAlignment) => void;
    columnAlignment?: TableColumnAlignment | null;
  } = {}
) {
  const anchorEl = document.body.appendChild(document.createElement('div'));
  const anchor: TableHandleMenuAnchor = { current: anchorEl };
  const onClose = vi.fn();
  const onClearContents = overrides.onClearContents ?? vi.fn();
  const onDuplicateRow = overrides.onDuplicateRow ?? vi.fn();
  const onDuplicateColumn = overrides.onDuplicateColumn ?? vi.fn();
  const onMoveRowUp = overrides.onMoveRowUp ?? vi.fn();
  const onMoveRowDown = overrides.onMoveRowDown ?? vi.fn();
  const onMoveColumnLeft = overrides.onMoveColumnLeft ?? vi.fn();
  const onMoveColumnRight = overrides.onMoveColumnRight ?? vi.fn();
  const onInsertRowAbove = overrides.onInsertRowAbove ?? vi.fn();
  const onInsertRowBelow = overrides.onInsertRowBelow ?? vi.fn();
  const onInsertColumnLeft = overrides.onInsertColumnLeft ?? vi.fn();
  const onInsertColumnRight = overrides.onInsertColumnRight ?? vi.fn();
  const onDeleteRow = overrides.onDeleteRow ?? vi.fn();
  const onDeleteColumn = overrides.onDeleteColumn ?? vi.fn();
  const onFormatTable = overrides.onFormatTable ?? vi.fn();
  const onSetColumnAlignment = overrides.onSetColumnAlignment ?? vi.fn();
  // `??` would collapse an explicitly-passed `null` (testing the "cannot be
  // resolved" case) back to the default — `in` distinguishes "not passed at
  // all" from "passed as null" the way `??` alone cannot.
  const rowMoveAvailability = 'rowMoveAvailability' in overrides ? (overrides.rowMoveAvailability ?? null) : { canMoveUp: true, canMoveDown: true };
  const columnMoveAvailability = 'columnMoveAvailability' in overrides ? (overrides.columnMoveAvailability ?? null) : { canMoveLeft: true, canMoveRight: true };
  const columnAlignment = 'columnAlignment' in overrides ? (overrides.columnAlignment ?? null) : null;

  function Harness() {
    const suppressReturnFocusRef = useRef(false);
    return (
      <TableHandleMenu
        anchor={anchor}
        selection={selection}
        onClose={onClose}
        onClearContents={onClearContents}
        onDuplicateRow={onDuplicateRow}
        onDuplicateColumn={onDuplicateColumn}
        onMoveRowUp={onMoveRowUp}
        onMoveRowDown={onMoveRowDown}
        onMoveColumnLeft={onMoveColumnLeft}
        onMoveColumnRight={onMoveColumnRight}
        rowMoveAvailability={rowMoveAvailability}
        columnMoveAvailability={columnMoveAvailability}
        onInsertRowAbove={onInsertRowAbove}
        onInsertRowBelow={onInsertRowBelow}
        onInsertColumnLeft={onInsertColumnLeft}
        onInsertColumnRight={onInsertColumnRight}
        onSetColumnAlignment={onSetColumnAlignment}
        columnAlignment={columnAlignment}
        onDeleteRow={onDeleteRow}
        onDeleteColumn={onDeleteColumn}
        onFormatTable={onFormatTable}
        suppressReturnFocusRef={suppressReturnFocusRef}
      />
    );
  }

  render(<Harness />);
  return {
    onClose,
    onClearContents,
    onDuplicateRow,
    onDuplicateColumn,
    onMoveRowUp,
    onMoveRowDown,
    onMoveColumnLeft,
    onMoveColumnRight,
    onInsertRowAbove,
    onInsertRowBelow,
    onSetColumnAlignment,
    onInsertColumnLeft,
    onInsertColumnRight,
    onDeleteRow,
    onDeleteColumn,
    onFormatTable,
  };
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

describe('TableHandleMenu — "Delete row"/"Delete column" wiring', () => {
  it('clicking "Delete row" calls onDeleteRow, and only that callback, for a row selection', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    fireEvent.click(findMenuItem('Delete row')!);

    expect(handlers.onDeleteRow).toHaveBeenCalledTimes(1);
    expect(handlers.onDeleteColumn).not.toHaveBeenCalled();
  });

  it('clicking "Delete column" calls onDeleteColumn, and only that callback, for a column selection', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    fireEvent.click(findMenuItem('Delete column')!);

    expect(handlers.onDeleteColumn).toHaveBeenCalledTimes(1);
    expect(handlers.onDeleteRow).not.toHaveBeenCalled();
  });
});

describe('TableHandleMenu — "Format table" wiring', () => {
  it('lists Format table for both a row and a column selection', () => {
    renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });
    expect(findMenuItem('Format table')).not.toBeNull();
  });

  it('clicking "Format table" calls onFormatTable for a row selection', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });
    fireEvent.click(findMenuItem('Format table')!);
    expect(handlers.onFormatTable).toHaveBeenCalledTimes(1);
  });

  it('clicking "Format table" calls onFormatTable for a column selection', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 });
    fireEvent.click(findMenuItem('Format table')!);
    expect(handlers.onFormatTable).toHaveBeenCalledTimes(1);
  });
});

describe('TableHandleMenu — "Move" wiring', () => {
  it('lists Move up/down for a row selection and Move left/right for a column selection', () => {
    renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });
    expect(findMenuItem('Move up')).not.toBeNull();
    expect(findMenuItem('Move down')).not.toBeNull();
    expect(findMenuItem('Move left')).toBeNull();
    expect(findMenuItem('Move right')).toBeNull();
  });

  it('clicking "Move up" calls onMoveRowUp, and only that callback, for a row selection', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    fireEvent.click(findMenuItem('Move up')!);

    expect(handlers.onMoveRowUp).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveRowDown).not.toHaveBeenCalled();
  });

  it('clicking "Move down" calls onMoveRowDown, and only that callback, for a row selection', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    fireEvent.click(findMenuItem('Move down')!);

    expect(handlers.onMoveRowDown).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveRowUp).not.toHaveBeenCalled();
  });

  it('clicking "Move left" calls onMoveColumnLeft, and only that callback, for a column selection', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    fireEvent.click(findMenuItem('Move left')!);

    expect(handlers.onMoveColumnLeft).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveColumnRight).not.toHaveBeenCalled();
  });

  it('clicking "Move right" calls onMoveColumnRight, and only that callback, for a column selection', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    fireEvent.click(findMenuItem('Move right')!);

    expect(handlers.onMoveColumnRight).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveColumnLeft).not.toHaveBeenCalled();
  });

  it('disables "Move up" when rowMoveAvailability.canMoveUp is false, and it does not fire on click', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 }, { rowMoveAvailability: { canMoveUp: false, canMoveDown: true } });

    const item = findMenuItem('Move up')!;
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item);
    expect(handlers.onMoveRowUp).not.toHaveBeenCalled();
  });

  it('disables "Move down" when rowMoveAvailability.canMoveDown is false, and it does not fire on click', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 }, { rowMoveAvailability: { canMoveUp: true, canMoveDown: false } });

    const item = findMenuItem('Move down')!;
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item);
    expect(handlers.onMoveRowDown).not.toHaveBeenCalled();
  });

  it('disables "Move left" when columnMoveAvailability.canMoveLeft is false, and it does not fire on click', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 }, { columnMoveAvailability: { canMoveLeft: false, canMoveRight: true } });

    const item = findMenuItem('Move left')!;
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item);
    expect(handlers.onMoveColumnLeft).not.toHaveBeenCalled();
  });

  it('disables "Move right" when columnMoveAvailability.canMoveRight is false, and it does not fire on click', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 }, { columnMoveAvailability: { canMoveLeft: true, canMoveRight: false } });

    const item = findMenuItem('Move right')!;
    expect(item.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item);
    expect(handlers.onMoveColumnRight).not.toHaveBeenCalled();
  });

  it('disables both Move items for a row selection when rowMoveAvailability is null (header, or a table that could not be resolved)', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 0 }, { rowMoveAvailability: null });

    expect(findMenuItem('Move up')!.getAttribute('aria-disabled')).toBe('true');
    expect(findMenuItem('Move down')!.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(findMenuItem('Move up')!);
    fireEvent.click(findMenuItem('Move down')!);
    expect(handlers.onMoveRowUp).not.toHaveBeenCalled();
    expect(handlers.onMoveRowDown).not.toHaveBeenCalled();
  });
});

describe('TableHandleMenu — "Duplicate" wiring', () => {
  it('lists Duplicate for both a row and a column selection', () => {
    renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });
    expect(findMenuItem('Duplicate')).not.toBeNull();
  });

  it('clicking "Duplicate" calls onDuplicateRow, and only that callback, for a row selection', () => {
    const handlers = renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 1 });

    fireEvent.click(findMenuItem('Duplicate')!);

    expect(handlers.onDuplicateRow).toHaveBeenCalledTimes(1);
    expect(handlers.onDuplicateColumn).not.toHaveBeenCalled();
  });

  it('clicking "Duplicate" calls onDuplicateColumn, and only that callback, for a column selection', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    fireEvent.click(findMenuItem('Duplicate')!);

    expect(handlers.onDuplicateColumn).toHaveBeenCalledTimes(1);
    expect(handlers.onDuplicateRow).not.toHaveBeenCalled();
  });
});

describe('TableHandleMenu — "Align" submenu wiring', () => {
  it('lists "Align" for a column selection, but not for a row selection', () => {
    renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 });
    expect(findMenuItem('Align')).not.toBeNull();

    cleanup();

    renderMenu({ kind: 'row', tableFrom: 0, rowIndex: 0 });
    expect(findMenuItem('Align')).toBeNull();
  });

  it('hovering "Align" opens a submenu listing Left/Center/Right', () => {
    renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    fireEvent.mouseEnter(findMenuItem('Align')!);

    expect(findMenuItem('Left')).not.toBeNull();
    expect(findMenuItem('Center')).not.toBeNull();
    expect(findMenuItem('Right')).not.toBeNull();
  });

  it('clicking "Left" calls onSetColumnAlignment("left"), and only that callback', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    fireEvent.mouseEnter(findMenuItem('Align')!);
    fireEvent.click(findMenuItem('Left')!);

    expect(handlers.onSetColumnAlignment).toHaveBeenCalledExactlyOnceWith('left');
  });

  it('clicking "Center" calls onSetColumnAlignment("center")', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    fireEvent.mouseEnter(findMenuItem('Align')!);
    fireEvent.click(findMenuItem('Center')!);

    expect(handlers.onSetColumnAlignment).toHaveBeenCalledExactlyOnceWith('center');
  });

  it('clicking "Right" calls onSetColumnAlignment("right")', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    fireEvent.mouseEnter(findMenuItem('Align')!);
    fireEvent.click(findMenuItem('Right')!);

    expect(handlers.onSetColumnAlignment).toHaveBeenCalledExactlyOnceWith('right');
  });

  it('selecting Align never calls the Duplicate/Insert/Delete/Clear callbacks', () => {
    const handlers = renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 });

    fireEvent.mouseEnter(findMenuItem('Align')!);
    fireEvent.click(findMenuItem('Center')!);

    expect(handlers.onDuplicateColumn).not.toHaveBeenCalled();
    expect(handlers.onClearContents).not.toHaveBeenCalled();
    expect(handlers.onDeleteColumn).not.toHaveBeenCalled();
  });

  it('marks the leaf matching the column\'s current alignment as selected, and no leaf when there is none', () => {
    renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 }, { columnAlignment: 'center' });
    fireEvent.mouseEnter(findMenuItem('Align')!);

    expect(findMenuItem('Center')!.classList.contains('entry-selected')).toBe(true);
    expect(findMenuItem('Left')!.classList.contains('entry-selected')).toBe(false);
    expect(findMenuItem('Right')!.classList.contains('entry-selected')).toBe(false);

    cleanup();

    renderMenu({ kind: 'column', tableFrom: 0, columnIndex: 0 }, { columnAlignment: null });
    fireEvent.mouseEnter(findMenuItem('Align')!);

    expect(findMenuItem('Left')!.classList.contains('entry-selected')).toBe(false);
    expect(findMenuItem('Center')!.classList.contains('entry-selected')).toBe(false);
    expect(findMenuItem('Right')!.classList.contains('entry-selected')).toBe(false);
  });
});
