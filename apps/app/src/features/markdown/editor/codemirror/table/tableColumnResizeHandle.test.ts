// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { attachTableColumnResizeHandles } from './tableColumnResizeHandle';
import { MIN_TABLE_COLUMN_WIDTH, resolveTableColumnWidths } from './tableColumnWidthMetadata';
import { findAllTables } from './tableGeometry';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
  document.body.classList.remove('cm-table-column-resizing-active');
});

function mountRootView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), history()] }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

/** A minimal `.cm-table-wrapper > .cm-table-scroll > table > colgroup/thead` — everything `attachTableColumnResizeHandles` actually reads (it never touches body rows). */
function buildWrapper(columns: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'cm-table-wrapper';
  const scroll = document.createElement('div');
  scroll.className = 'cm-table-scroll';
  wrapper.appendChild(scroll);
  const table = document.createElement('table');
  scroll.appendChild(table);

  const colgroup = document.createElement('colgroup');
  for (let i = 0; i < columns; i++) {
    colgroup.appendChild(document.createElement('col'));
  }
  table.appendChild(colgroup);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (let c = 0; c < columns; c++) {
    headerRow.appendChild(document.createElement('th'));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  document.body.appendChild(wrapper);
  return wrapper;
}

function pointer(type: string, el: EventTarget, x: number): void {
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: 0, button: 0, bubbles: true, cancelable: true }));
}

function cols(wrapper: HTMLElement): HTMLTableColElement[] {
  return Array.from(wrapper.querySelectorAll<HTMLTableColElement>('col'));
}

function widthsFor(view: EditorView): readonly number[] | undefined {
  const table = findAllTables(view.state)[0];
  if (!table) {
    return undefined;
  }
  return resolveTableColumnWidths(view.state, table)?.widths;
}

const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | UI | Chennai |';
const ONE_COLUMN_TABLE = '| Name |\n| --- |\n| Vik |';

describe('attachTableColumnResizeHandles — hit-target setup', () => {
  it('creates columnCount resize hit-strips — one per column, including the last column\'s own right edge', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    expect(wrapper.querySelectorAll('.cm-table-column-resize-hit')).toHaveLength(3);
  });

  it('creates exactly one hit-strip (its own right edge) for a single-column table', () => {
    const view = mountRootView(ONE_COLUMN_TABLE);
    const wrapper = buildWrapper(1);
    attachTableColumnResizeHandles(wrapper, 0, view, 1, null);
    expect(wrapper.querySelectorAll('.cm-table-column-resize-hit')).toHaveLength(1);
  });

  it('is a distinct hit target from the column select/reorder handle — never shares a class', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    for (const hit of wrapper.querySelectorAll('.cm-table-column-resize-hit')) {
      expect(hit.classList.contains('cm-table-column-handle-hit')).toBe(false);
    }
  });
});

describe('attachTableColumnResizeHandles — cursor and live tracking', () => {
  it('adds the resize cursor class to <body> once dragging starts, and removes it on release', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 100);
    expect(document.body.classList.contains('cm-table-column-resizing-active')).toBe(true);

    pointer('pointerup', document, 150);
    expect(document.body.classList.contains('cm-table-column-resizing-active')).toBe(false);
  });

  it('updates only the dragged column\'s own <col> width live, with no document change, during the drag', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;
    const before = view.state.doc.toString();

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 180);

    const colElements = cols(wrapper);
    expect(colElements[0]!.style.width).toBe('280px'); // 200 default + 80 delta
    expect(view.state.doc.toString()).toBe(before); // no transaction mid-drag

    pointer('pointermove', document, 220);
    expect(colElements[0]!.style.width).toBe('320px');
    expect(view.state.doc.toString()).toBe(before);

    pointer('pointerup', document, 220);
  });

  it('does NOT switch the wrapper into explicit-widths mode on pointerdown alone, before any movement', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 100);

    expect(wrapper.classList.contains('cm-table-wrapper--explicit-widths')).toBe(false);
    expect(cols(wrapper).every((col) => col.style.width === '')).toBe(true);
    pointer('pointerup', document, 100);
  });

  it('switches the wrapper into explicit-widths mode once real movement (the first pointermove) begins, not only on commit', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 180);

    expect(wrapper.classList.contains('cm-table-wrapper--explicit-widths')).toBe(true);
    pointer('pointerup', document, 180);
  });
});

describe('attachTableColumnResizeHandles — click without dragging (the reported bug)', () => {
  it('click resize handle without dragging does not modify the table or create width metadata', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;
    const before = view.state.doc.toString();

    pointer('pointerdown', hit, 100);
    pointer('pointerup', document, 100); // released at the exact same position — no movement at all

    expect(view.state.doc.toString()).toBe(before); // no Markdown transaction
    expect(undoDepth(view.state)).toBe(0); // no history entry
    expect(widthsFor(view)).toBeUndefined(); // no metadata materialization
    expect(wrapper.classList.contains('cm-table-wrapper--explicit-widths')).toBe(false); // no table width change
    for (const col of cols(wrapper)) {
      expect(col.style.width).toBe('');
    }
    expect(document.body.classList.contains('cm-table-column-resizing-active')).toBe(false);
  });

  it('click-without-dragging on an already-explicit table leaves its persisted widths and DOM completely untouched', () => {
    const doc = `${TABLE}\n{table-col-widths="120,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!;

    pointer('pointerdown', hit, 100);
    pointer('pointerup', document, 100);

    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(0);
    expect(widthsFor(view)).toEqual([120, 80, 240]);
    for (const col of cols(wrapper)) {
      expect(col.style.width).toBe('');
    }
  });
});

describe('attachTableColumnResizeHandles — commit, first resize', () => {
  it('materializes the full width array, DEFAULT_TABLE_COLUMN_WIDTH for every untouched column', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!; // boundary right of column 0

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 220); // +120px
    pointer('pointerup', document, 220);

    expect(widthsFor(view)).toEqual([320, 200, 200]);
  });

  it('persists the attribute line immediately after the table', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 100);
    pointer('pointerup', document, 220);

    const lines = view.state.doc.toString().split('\n');
    expect(lines[lines.length - 1]).toBe('{table-col-widths="320,200,200"}');
  });

  it('a real first resize preserves each untouched column\'s own current rendered width, not a hardcoded 200px, when the table had no metadata yet', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    // The table's own actual current rendered split — deliberately NOT
    // 200/200/200, so a regression back to the hardcoded default would be
    // caught by this test rather than silently matching by coincidence.
    const measuredWidths = [150, 300, 150];
    const headerCells = Array.from(wrapper.querySelectorAll('th'));
    headerCells.forEach((cell, i) => {
      (cell as HTMLElement).getBoundingClientRect = () =>
        ({ width: measuredWidths[i]!, left: 0, right: measuredWidths[i]!, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    });
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!; // resizing column 0 (measured 150)

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 220); // +120 -> 150 + 120 = 270
    pointer('pointerup', document, 220);

    expect(widthsFor(view)).toEqual([270, 300, 150]);
  });

  it('resizing the right boundary (last column) also materializes correctly', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!; // boundary right of column 1

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 50); // -50px, shrinking column 1
    pointer('pointerup', document, 50);

    expect(widthsFor(view)).toEqual([200, 150, 200]);
  });
});

describe('attachTableColumnResizeHandles — commit, subsequent resize', () => {
  const ALREADY_EXPLICIT = `${TABLE}\n{table-col-widths="120,80,240"}`;

  it('changes only the resized column, preserving every other explicit width exactly', () => {
    const view = mountRootView(ALREADY_EXPLICIT);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!; // column index 1, currently 80

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 140); // +40
    pointer('pointerup', document, 140);

    expect(widthsFor(view)).toEqual([120, 120, 240]);
  });
});

describe('attachTableColumnResizeHandles — minimum width', () => {
  it('clamps the committed width to MIN_TABLE_COLUMN_WIDTH', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 500);
    pointer('pointermove', document, -1000); // huge negative delta
    pointer('pointerup', document, -1000);

    expect(widthsFor(view)![0]).toBe(MIN_TABLE_COLUMN_WIDTH);
  });

  it('clamps the live DOM width during the drag too, not only on commit', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 500);
    pointer('pointermove', document, -1000);

    expect(cols(wrapper)[0]!.style.width).toBe(`${MIN_TABLE_COLUMN_WIDTH}px`);
    pointer('pointerup', document, -1000);
  });
});

describe('attachTableColumnResizeHandles — undo/redo', () => {
  it('undo restores the exact previous (absent) width metadata in one step', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;
    const before = view.state.doc.toString();

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 220);
    pointer('pointerup', document, 220);
    expect(widthsFor(view)).toEqual([320, 200, 200]);

    undo(view);
    expect(view.state.doc.toString()).toBe(before);
    expect(widthsFor(view)).toBeUndefined();

    redo(view);
    expect(widthsFor(view)).toEqual([320, 200, 200]);
  });

  it('undo restores the exact previous explicit widths for a subsequent resize', () => {
    const doc = `${TABLE}\n{table-col-widths="120,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!;

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 140);
    pointer('pointerup', document, 140);
    expect(widthsFor(view)).toEqual([120, 120, 240]);

    undo(view);
    expect(widthsFor(view)).toEqual([120, 80, 240]);
  });
});

describe('attachTableColumnResizeHandles — cancel', () => {
  it('pointercancel restores the original (no metadata) state with no document change and no history entry', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;
    const before = view.state.doc.toString();

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 220);
    document.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(before);
    expect(undoDepth(view.state)).toBe(0);
    expect(wrapper.classList.contains('cm-table-wrapper--explicit-widths')).toBe(false);
    expect(cols(wrapper)[0]!.style.width).toBe('');
    expect(document.body.classList.contains('cm-table-column-resizing-active')).toBe(false);
  });

  it('Escape restores the original state with no document change and no history entry', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;
    const before = view.state.doc.toString();

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 220);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(before);
    expect(undoDepth(view.state)).toBe(0);
    expect(cols(wrapper)[0]!.style.width).toBe('');
  });

  it('cancelling an already-explicit table\'s resize restores its own prior explicit widths, not blank', () => {
    const doc = `${TABLE}\n{table-col-widths="120,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    // Mirrors what `TableWidget.toDOM()` itself does for a table that
    // already has valid metadata (`columnWidths !== null`) — this test's
    // synthetic wrapper must start in that same state for `wasAlreadyExplicit`
    // to be computed correctly, the same way a real rebuild would leave it.
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!;

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 300);
    document.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(doc);
    expect(cols(wrapper)[1]!.style.width).toBe('80px');
    expect(wrapper.classList.contains('cm-table-wrapper--explicit-widths')).toBe(true);
  });
});

/**
 * The last column's own right-edge handle — `boundaries[columnCount - 1]`,
 * the one strip this milestone adds. Reuses every mechanism the internal
 * boundary handles already exercise (materialization, min-width clamp,
 * commit, undo, cancel) — these tests exist to confirm the *same* behavior
 * actually reaches the edge case, not to re-test the underlying mechanism
 * a second time from scratch.
 */
describe('attachTableColumnResizeHandles — last-column (right-edge) handle', () => {
  it('exists as the final hit-strip, in addition to the internal boundaries', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);

    const hits = wrapper.querySelectorAll('.cm-table-column-resize-hit');
    expect(hits).toHaveLength(3);
  });

  it('dragging it changes only the last column\'s own width, not any other column', () => {
    const doc = `${TABLE}\n{table-col-widths="120,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const lastHit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!; // column index 2, the last column

    pointer('pointerdown', lastHit, 100);
    pointer('pointermove', document, 160); // +60
    pointer('pointerup', document, 160);

    expect(widthsFor(view)).toEqual([120, 80, 300]);
  });

  it('materializes the full width array on first resize, defaulting every other column to 200', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const lastHit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;

    pointer('pointerdown', lastHit, 100);
    pointer('pointermove', document, 220); // +120
    pointer('pointerup', document, 220);

    expect(widthsFor(view)).toEqual([200, 200, 320]);
  });

  it('clamps to MIN_TABLE_COLUMN_WIDTH, both live during the drag and on commit', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const lastHit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;

    pointer('pointerdown', lastHit, 500);
    pointer('pointermove', document, -1000);
    expect(cols(wrapper)[2]!.style.width).toBe(`${MIN_TABLE_COLUMN_WIDTH}px`);

    pointer('pointerup', document, -1000);
    expect(widthsFor(view)![2]).toBe(MIN_TABLE_COLUMN_WIDTH);
  });

  it('undo restores the exact previous widths in one step, redo reapplies the edge resize', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const lastHit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    const before = view.state.doc.toString();

    pointer('pointerdown', lastHit, 100);
    pointer('pointermove', document, 220);
    pointer('pointerup', document, 220);
    expect(widthsFor(view)).toEqual([200, 200, 320]);

    undo(view);
    expect(view.state.doc.toString()).toBe(before);
    expect(widthsFor(view)).toBeUndefined();

    redo(view);
    expect(widthsFor(view)).toEqual([200, 200, 320]);
  });

  it('Escape restores the original state with no document change and no history entry', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const lastHit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    const before = view.state.doc.toString();

    pointer('pointerdown', lastHit, 100);
    pointer('pointermove', document, 220);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(before);
    expect(undoDepth(view.state)).toBe(0);
    expect(cols(wrapper)[2]!.style.width).toBe('');
    expect(wrapper.classList.contains('cm-table-wrapper--explicit-widths')).toBe(false);
  });

  it('pointercancel restores the original state with no document change and no history entry', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const lastHit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    const before = view.state.doc.toString();

    pointer('pointerdown', lastHit, 100);
    pointer('pointermove', document, 220);
    document.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(before);
    expect(undoDepth(view.state)).toBe(0);
    expect(cols(wrapper)[2]!.style.width).toBe('');
  });

  it('does not affect the internal boundary handles\' own hit-testing/order — they remain hits [0] and [1] of 3', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hits = wrapper.querySelectorAll('.cm-table-column-resize-hit');
    expect(hits).toHaveLength(3);

    // Internal boundary 0 (columns 0/1) still resizes column 0 only.
    pointer('pointerdown', hits[0]!, 100);
    pointer('pointermove', document, 220); // +120
    pointer('pointerup', document, 220);
    expect(widthsFor(view)).toEqual([320, 200, 200]);
  });

  it('the existing internal-boundary resize tests (columns 0 and 1) remain unaffected by the new edge handle', () => {
    const doc = `${TABLE}\n{table-col-widths="120,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const boundary1 = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!; // column index 1

    pointer('pointerdown', boundary1, 100);
    pointer('pointermove', document, 140); // +40
    pointer('pointerup', document, 140);

    expect(widthsFor(view)).toEqual([120, 120, 240]);
  });
});

/**
 * Regression coverage for the duplicate-metadata-line bug and its
 * fractional-pixel root cause (see `tableColumnWidthMetadata.ts`'s own
 * `resolveExistingAttributeLineRange` doc comment for the full
 * reproduction). `Math.round` semantics used throughout these test
 * comments: JS rounds a `.5` value up (toward +Infinity) — `120.5` → `121`,
 * `-2300.7` → `-2301` — matching `clampedWidthFromPointer`'s own
 * "round, then clamp" order exactly.
 */
describe('attachTableColumnResizeHandles — duplicate-metadata and rounding regression', () => {
  it('resizing an already-explicit table replaces the existing metadata line — exactly one line, never two', () => {
    const doc = `${TABLE}\n{table-col-widths="120,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 150);
    pointer('pointerup', document, 150);

    const lines = view.state.doc.toString().split('\n').filter((l) => l.startsWith('{table-col-widths'));
    expect(lines).toHaveLength(1);
  });

  it('resizing the same column three times in sequence still leaves exactly one metadata line', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    for (const target of [220, 250, 90]) {
      pointer('pointerdown', hit, 100);
      pointer('pointermove', document, target);
      pointer('pointerup', document, target);
      const lines = view.state.doc.toString().split('\n').filter((l) => l.startsWith('{table-col-widths'));
      expect(lines).toHaveLength(1);
    }
  });

  it('a column at ~71px can be dragged down to exactly the 60px minimum', () => {
    const doc = `${TABLE}\n{table-col-widths="71,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [71, 80, 240]);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    // delta = 89.5 - 100.25 = -10.75; raw = 71 - 10.75 = 60.25; rounds to 60.
    pointer('pointerdown', hit, 100.25);
    pointer('pointermove', document, 89.5);
    pointer('pointerup', document, 89.5);

    expect(widthsFor(view)).toEqual([60, 80, 240]);
  });

  it('dragging well below the minimum still persists exactly 60px, never a fractional or negative value', () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 500);
    pointer('pointermove', document, -2000.7);
    pointer('pointerup', document, -2000.7);

    expect(widthsFor(view)![0]).toBe(60);
    const lines = view.state.doc.toString().split('\n').filter((l) => l.startsWith('{table-col-widths'));
    expect(lines).toHaveLength(1);
  });

  it('resizing the second column updates only that column, and still exactly one metadata line', () => {
    const doc = `${TABLE}\n{table-col-widths="120,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!; // column index 1

    // delta = 140.8 - 100.3 = 40.5; raw = 80 + 40.5 = 120.5; rounds to 121.
    pointer('pointerdown', hit, 100.3);
    pointer('pointermove', document, 140.8);
    pointer('pointerup', document, 140.8);

    expect(widthsFor(view)).toEqual([120, 121, 240]);
    const lines = view.state.doc.toString().split('\n').filter((l) => l.startsWith('{table-col-widths'));
    expect(lines).toHaveLength(1);
  });

  it('undo/redo still works as one history step after the fix', () => {
    const doc = `${TABLE}\n{table-col-widths="120,80,240"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [120, 80, 240]);
    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[0]!;

    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 220); // +120 -> 240, no rounding ambiguity
    pointer('pointerup', document, 220);
    expect(widthsFor(view)).toEqual([240, 80, 240]);

    undo(view);
    expect(view.state.doc.toString()).toBe(doc);
    expect(widthsFor(view)).toEqual([120, 80, 240]);

    redo(view);
    expect(widthsFor(view)).toEqual([240, 80, 240]);
  });
});

/**
 * Regression coverage for `positionBoundaries`' own `scrollLeft` conversion
 * — for a wide, explicit-width table that scrolls horizontally inside
 * `.cm-table-scroll`, each strip's `left` was computed as
 * `cellRect.right - scrollRect.left`, a *viewport*-relative reading, with
 * no `+ scrollContainer.scrollLeft` term to convert it into the
 * *content*-relative space `left` on an absolutely positioned child of an
 * `overflow-x: auto` container is actually interpreted in. At
 * `scrollLeft === 0` the two spaces coincide, so this was invisible until
 * the container was genuinely scrolled — exactly the scenario these tests
 * force by setting `scroll.scrollLeft` before the deferred
 * `positionBoundaries()` call fires, mirroring `tableSelectionOverlay.ts`'s
 * own already-correct `positionColumnSelectionOverlay` conversion (that
 * function's own "Coordinate space" doc comment).
 */
describe('attachTableColumnResizeHandles — scrollLeft-aware positioning', () => {
  /**
   * Gives `wrapper`'s `.cm-table-scroll` a real, fixed mockable viewport
   * rect, a settable `scrollLeft` (jsdom doesn't implement real scrolling,
   * but the property itself is a plain, assignable field on every
   * element), and every header `<th>` a rect that **reacts to the current
   * `scrollLeft`** — `columnWidth` apart in the table's own unscrolled
   * content space, reported at `contentLeft - scrollLeft` in viewport
   * space, exactly how a real scrolled `getBoundingClientRect()` would
   * report it. A *fixed* mock rect that never moves with `scrollLeft`
   * (this file's own first, since-corrected attempt) would make the
   * scrolled test below pass or fail for the wrong reason — it has to
   * actually emulate scrolling shifting the cell leftward on screen for
   * the assertions below to prove anything about the conversion formula.
   */
  function mockScrollGeometry(wrapper: HTMLElement, columnWidth: number, viewportLeft = 0): HTMLElement {
    const scroll = wrapper.querySelector('.cm-table-scroll') as HTMLElement;
    scroll.getBoundingClientRect = () => ({ left: viewportLeft, right: viewportLeft + 300, width: 300, top: 0, bottom: 100, height: 100, x: viewportLeft, y: 0, toJSON: () => ({}) }) as DOMRect;
    let scrollLeftValue = 0;
    Object.defineProperty(scroll, 'scrollLeft', {
      get: () => scrollLeftValue,
      set: (v: number) => {
        scrollLeftValue = v;
      },
      configurable: true,
    });
    const headerCells = Array.from(wrapper.querySelectorAll('th'));
    headerCells.forEach((cell, i) => {
      const contentLeft = i * columnWidth; // this column's true, scroll-independent position
      (cell as HTMLElement).getBoundingClientRect = () => {
        const onScreenLeft = viewportLeft + contentLeft - scrollLeftValue;
        return { left: onScreenLeft, right: onScreenLeft + columnWidth, width: columnWidth, top: 0, bottom: 40, height: 40, x: onScreenLeft, y: 0, toJSON: () => ({}) } as DOMRect;
      };
    });
    return scroll;
  }

  it('at scrollLeft 0, a strip lands exactly on its column\'s right edge (baseline, unaffected by the fix)', async () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    mockScrollGeometry(wrapper, 100, 0); // columns at [0,100), [100,200), [200,300) in content space
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    await Promise.resolve();

    const hits = wrapper.querySelectorAll<HTMLElement>('.cm-table-column-resize-hit');
    expect(hits[0]!.style.left).toBe('100px');
    expect(hits[1]!.style.left).toBe('200px');
    expect(hits[2]!.style.left).toBe('300px'); // last column's own right/outer edge
  });

  it('while the container is scrolled, a strip still lands exactly on its column\'s real content-space boundary — the fix makes the result scroll-position-invariant', async () => {
    const view = mountRootView(TABLE);
    const wrapper = buildWrapper(3);
    const scroll = mockScrollGeometry(wrapper, 100, 0);
    scroll.scrollLeft = 250; // scrolled well past where these columns would render on screen
    attachTableColumnResizeHandles(wrapper, 0, view, 3, null);
    await Promise.resolve();

    const hits = wrapper.querySelectorAll<HTMLElement>('.cm-table-column-resize-hit');
    // Same content-space values as the unscrolled baseline above — the
    // whole point of the `+ scrollLeft` conversion. Without it (the bug:
    // `cellRect.right - scrollRect.left` alone), these would read -150,
    // -50, 50 — the raw *on-screen* position at this scroll offset,
    // drifting by exactly -scrollLeft(250) from the true boundary, and
    // (being negative) actually placing two strips off-screen entirely.
    expect(hits[0]!.style.left).toBe('100px');
    expect(hits[1]!.style.left).toBe('200px');
    expect(hits[2]!.style.left).toBe('300px');
  });

  it('the last column\'s own strip stays on the intrinsic table\'s real right edge while scrolled, for a wide explicit-width table', async () => {
    const view = mountRootView(`${TABLE}\n{table-col-widths="400,400,400"}`);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const scroll = mockScrollGeometry(wrapper, 400, 0); // columns at [0,400), [400,800), [800,1200) in content space
    scroll.scrollLeft = 900; // deep into the scrolled-right region
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [400, 400, 400]);
    await Promise.resolve();

    const hits = wrapper.querySelectorAll<HTMLElement>('.cm-table-column-resize-hit');
    expect(hits[2]!.style.left).toBe('1200px'); // the table's own true intrinsic right edge, regardless of scroll
  });
});

/**
 * Regression coverage for live scroll-position reconciliation during a
 * resize drag — without it, shrinking a column while scrolled right left
 * the viewport pinned at its old `scrollLeft` until pointer-up (the next
 * full widget rebuild was the only thing that ever re-clamped it), which
 * read as "the table stays scrolled too far right while I'm actively
 * dragging it narrower." `reconcileScrollPosition` runs after every
 * `<col>` width write in `handlePointerMove` and clamps
 * `tableScroll.scrollLeft` to `min(current, maxScrollLeft)` — DOM-only, no
 * `view.dispatch`, so it can run on every `pointermove` without creating
 * undo-history noise or interfering with the single commit transaction
 * still dispatched on `pointerup`.
 *
 * **`maxScrollLeft` comes from `table.getBoundingClientRect().width`, not
 * `tableScroll.scrollWidth` — this is itself the fix a second iteration of
 * this milestone required, and `mockScrollDimensions` below is written to
 * prove it, not just to support it.** The first iteration used
 * `tableScroll.scrollWidth - tableScroll.clientWidth`, which is what the
 * doc comment above still describes conceptually — but live-measured in
 * the real app, `tableScroll.scrollWidth` was confirmed to lag behind an
 * immediately-preceding `<col>` width mutation for the entire drag (even
 * after deliberately forcing a reflow by reading `table.offsetWidth`
 * first), while `table.getBoundingClientRect().width` updated correctly on
 * every single tick — a genuine engine-level staleness specific to an
 * `overflow: auto` container's own scrollable-overflow recomputation, not
 * a timing/ordering bug in this file's own code. `mockScrollDimensions`
 * makes `scrollWidth` throw if ever read, so any regression back to that
 * property fails loudly here instead of silently reintroducing the exact
 * "no movement until pointer-up" bug this describe block exists to guard
 * against.
 */
describe('attachTableColumnResizeHandles — live scroll reconciliation during drag (no clamp-only-on-commit)', () => {
  /**
   * Gives `wrapper`'s `.cm-table-scroll` a real, mockable `clientWidth`
   * (fixed — the viewport itself never resizes during a column drag) and
   * gives `table` a `getBoundingClientRect()` whose `width` tracks the
   * *live sum* of every `<col>`'s own current inline width, recomputed on
   * every read — exactly how a real `table-layout: fixed` table's
   * intrinsic width responds to a `<col>` width change mid-drag, and
   * exactly what `reconcileScrollPosition` now reads. `scroll.scrollWidth`
   * is deliberately left throwing rather than mocked at all: this file's
   * own regression proof that the implementation no longer depends on it
   * (see this describe block's own top doc comment). `scrollLeft` clamps
   * incoming writes to `>= 0`, mirroring genuine `HTMLElement.scrollLeft`
   * semantics (a real browser never lets it go negative) — the mechanism
   * the "returns to 0 when the table now fits" test below relies on, not
   * an extra `Math.max(0, ...)` in the reconciliation code itself.
   */
  function mockScrollDimensions(wrapper: HTMLElement, clientWidth: number): HTMLElement {
    const scroll = wrapper.querySelector('.cm-table-scroll') as HTMLElement;
    const table = scroll.querySelector('table') as HTMLElement;
    Object.defineProperty(scroll, 'clientWidth', { get: () => clientWidth, configurable: true });
    Object.defineProperty(scroll, 'scrollWidth', {
      get: () => {
        throw new Error('reconcileScrollPosition must not read tableScroll.scrollWidth — confirmed live to lag behind a <col> mutation for the whole drag; use table.getBoundingClientRect().width instead.');
      },
      configurable: true,
    });
    Object.defineProperty(table, 'getBoundingClientRect', {
      value: () => {
        const colEls = Array.from(table.querySelectorAll('col')) as HTMLElement[];
        const width = colEls.reduce((sum, c) => sum + (Number.parseFloat(c.style.width) || 0), 0);
        return { width, left: 0, right: width, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      },
      configurable: true,
    });
    let scrollLeftValue = 0;
    Object.defineProperty(scroll, 'scrollLeft', {
      get: () => scrollLeftValue,
      set: (v: number) => {
        scrollLeftValue = Math.max(0, v);
      },
      configurable: true,
    });
    return scroll;
  }

  it('current scroll position is left unchanged when it is still within the new (still-overflowing) max', () => {
    const doc = `${TABLE}\n{table-col-widths="400,400,400"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const scroll = mockScrollDimensions(wrapper, 800); // table starts at 1200, maxScrollLeft = 400
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [400, 400, 400]);
    scroll.scrollLeft = 200; // well within the max, both before and after this drag

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!; // last column
    pointer('pointerdown', hit, 100);
    pointer('pointermove', document, 50); // 400 -> 350; sum 1150, maxScrollLeft 350 — 200 is still valid
    expect(scroll.scrollLeft).toBe(200);
    pointer('pointerup', document, 50);
  });

  it('scroll clamps to the new max the moment a live column-width change makes the current position stale — mid-drag, not waiting for pointer-up', () => {
    const doc = `${TABLE}\n{table-col-widths="400,400,400"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const scroll = mockScrollDimensions(wrapper, 800); // table starts at 1200, maxScrollLeft = 400
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [400, 400, 400]);
    scroll.scrollLeft = 400; // scrolled all the way to the current max

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    pointer('pointerdown', hit, 500);
    // 400 -> 250 (matches this milestone's own worked example: table
    // 1200 -> 1050, maxScrollLeft 400 -> 250).
    pointer('pointermove', document, 350);
    expect(scroll.scrollLeft).toBe(250);
    pointer('pointerup', document, 350);
  });

  it('scroll reaches exactly 0 once the table has shrunk narrower than the viewport — no overshoot into negative territory', () => {
    // A single drag, one column, down to `MIN_TABLE_COLUMN_WIDTH` — chosen
    // so that alone already brings the table's own sum below `clientWidth`
    // (unlike the 3-column/800px setup above, where one column's own floor
    // still leaves the table overflowing). Deliberately a single drag: a
    // *second*, separate drag session would re-materialize every column
    // from `attachTableColumnResizeHandles`'s own closed-over `columnWidths`
    // (`effectiveWidths()`) at its own `pointerdown`, which in this
    // detached-DOM test harness (no real widget rebuild between drags, so
    // that parameter is never refreshed) would silently reset this
    // column's own already-dragged width back to its original value —
    // not a bug in the reconciliation logic itself, just not what a second
    // drag in this specific harness can validate.
    const twoColumnTable = '| Name | Role |\n| --- | --- |\n| Vik | UI |';
    const doc = `${twoColumnTable}\n{table-col-widths="400,400"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(2);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const scroll = mockScrollDimensions(wrapper, 700); // table starts at 800, maxScrollLeft = 100
    attachTableColumnResizeHandles(wrapper, 0, view, 2, [400, 400]);
    scroll.scrollLeft = 100;

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!; // last column
    pointer('pointerdown', hit, 500);
    // 400 -> 60 (MIN_TABLE_COLUMN_WIDTH): sum 400+60=460, now narrower
    // than the 700px viewport — maxScrollLeft goes negative (-240),
    // clamped to 0 by the same native `scrollLeft` semantics a real
    // browser already applies (see `mockScrollDimensions`'s own doc
    // comment) — this reconciliation code needs no extra floor of its own.
    pointer('pointermove', document, 60);
    expect(scroll.scrollLeft).toBe(0);
    pointer('pointerup', document, 60);
  });

  it('never dispatches a CM6 transaction during pointermove — the document is untouched until pointerup', () => {
    const doc = `${TABLE}\n{table-col-widths="400,400,400"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const scroll = mockScrollDimensions(wrapper, 800);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [400, 400, 400]);
    scroll.scrollLeft = 400;
    const startDepth = undoDepth(view.state);

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    pointer('pointerdown', hit, 500);
    pointer('pointermove', document, 400);
    pointer('pointermove', document, 300);
    pointer('pointermove', document, 200);

    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(startDepth);

    pointer('pointerup', document, 200);
  });

  it('pointerup still produces exactly one width transaction after a multi-step live drag with mid-drag scroll reconciliation', () => {
    const doc = `${TABLE}\n{table-col-widths="400,400,400"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(3);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const scroll = mockScrollDimensions(wrapper, 800);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [400, 400, 400]);
    scroll.scrollLeft = 400;
    const startDepth = undoDepth(view.state);

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    pointer('pointerdown', hit, 500);
    pointer('pointermove', document, 400);
    pointer('pointermove', document, 300);
    pointer('pointermove', document, 200); // 400 -> 100
    pointer('pointerup', document, 200);

    expect(undoDepth(view.state)).toBe(startDepth + 1);
    expect(widthsFor(view)).toEqual([400, 400, 100]);
  });

  it('scrollLeft moves continuously at every pointermove step within one drag, not just once — gradually, down to exactly 0, and staying there as the drag continues further', () => {
    // Two columns, both starting at 400 (sum 800), a 650px viewport
    // (maxScrollLeft starts at 150) — chosen so a single column's drag
    // range (400 down to MIN_TABLE_COLUMN_WIDTH, 60) passes through a
    // clearly nonzero intermediate maxScrollLeft on its way to 0, unlike
    // the 3-column/800px setups above where one column's own floor alone
    // never brings the table narrower than the viewport (matches this
    // file's own "scroll reaches exactly 0" test and its doc comment on
    // why that test uses a 2-column table for the same reason).
    const twoColumnTable = '| Name | Role |\n| --- | --- |\n| Vik | UI |';
    const doc = `${twoColumnTable}\n{table-col-widths="400,400"}`;
    const view = mountRootView(doc);
    const wrapper = buildWrapper(2);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const scroll = mockScrollDimensions(wrapper, 650); // table starts at 800, maxScrollLeft = 150
    attachTableColumnResizeHandles(wrapper, 0, view, 2, [400, 400]);
    scroll.scrollLeft = 150; // scrolled all the way to the current max

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[1]!; // last column, startWidth 400
    pointer('pointerdown', hit, 500);

    // 400 -> 300: sum 700, maxScrollLeft 50 — clearly nonzero, proving
    // this is a gradual reduction, not a jump straight to 0.
    pointer('pointermove', document, 400);
    expect(scroll.scrollLeft).toBe(50);

    // 400 -> 150: sum 550, now narrower than the 650px viewport —
    // maxScrollLeft goes negative, clamped to exactly 0, still mid-drag.
    pointer('pointermove', document, 250);
    expect(scroll.scrollLeft).toBe(0);

    // 400 -> 60 (MIN_TABLE_COLUMN_WIDTH, the floor): stays at 0, not
    // pulled negative, as the table keeps shrinking further.
    pointer('pointermove', document, 160);
    expect(scroll.scrollLeft).toBe(0);

    pointer('pointerup', document, 160);
  });
});

/**
 * Regression coverage for the pointer-up scroll-restoration fix — without
 * it, the live-tracked `scrollLeft` (correct throughout the drag, per the
 * describe block above) was silently discarded the moment `commitResize`'s
 * own `view.dispatch()` rebuilt the widget: a freshly created
 * `.cm-table-scroll` starts at `scrollLeft: 0` by default, so the table
 * visibly snapped all the way back to the left on release, undoing
 * everything the live reconciliation had just gotten right. Fixed by
 * capturing the live `scrollLeft` immediately before `commitResize`'s own
 * dispatch, then — synchronously, right after that dispatch returns, no
 * `queueMicrotask` — re-querying the table's own freshly rebuilt DOM by its
 * stable `data-table-from` identity and restoring the captured value onto
 * it, clamped to whatever the new (post-resize) table's own valid scroll
 * range now is.
 */
describe('attachTableColumnResizeHandles — scroll position survives the pointer-up commit (no snap back to 0)', () => {
  // `restoreScrollPositionAfterCommit`'s own lookup is deliberately global
  // (`document.querySelector('.cm-table-widget[data-table-from="…"]')`) —
  // matching production, where exactly one such element ever exists at a
  // time. This file's shared top-level `afterEach` only destroys CM6
  // views, never the plain DOM `buildWidgetWrapper` appends straight to
  // `document.body` — without removing it here, every test in this block
  // reusing `tableFrom: 0` would leave its own widget behind for the next
  // test's identical selector to find *first* (document order), silently
  // writing the wrong test's scroll restoration onto a stale, unrelated
  // node while the current test's own (correct) element never gets
  // touched at all — confirmed to be exactly what was happening before
  // this cleanup was added (debug logging showed the production code
  // successfully finding and writing to *a* widget, just never the one
  // each test's own assertions were reading back from).
  afterEach(() => {
    document.querySelectorAll('.cm-table-widget').forEach((el) => el.remove());
  });

  /**
   * Builds the full `.cm-table-widget[data-table-from] > .cm-table-wrapper
   * > .cm-table-scroll > table` shape `restoreScrollPositionAfterCommit`
   * actually queries for — unlike this file's own plain `buildWrapper`
   * (used by every other describe block here), which has no
   * `.cm-table-widget` ancestor at all and is deliberately the *minimal*
   * shape `attachTableColumnResizeHandles` itself reads. This block's own
   * restoration logic specifically depends on that outer `data-table-from`
   * attribute, so it needs the real shape, not the minimal one.
   */
  function buildWidgetWrapper(columns: number, tableFrom: number): { widget: HTMLElement; wrapper: HTMLElement } {
    const widget = document.createElement('div');
    widget.className = 'cm-table-widget';
    widget.dataset.tableFrom = String(tableFrom);
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-table-wrapper';
    widget.appendChild(wrapper);
    const scroll = document.createElement('div');
    scroll.className = 'cm-table-scroll';
    wrapper.appendChild(scroll);
    const table = document.createElement('table');
    scroll.appendChild(table);
    const colgroup = document.createElement('colgroup');
    for (let i = 0; i < columns; i++) {
      colgroup.appendChild(document.createElement('col'));
    }
    table.appendChild(colgroup);
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let c = 0; c < columns; c++) {
      headerRow.appendChild(document.createElement('th'));
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);
    document.body.appendChild(widget);
    return { widget, wrapper };
  }

  /** Same mocking discipline as `mockScrollDimensions` above (live-summed `<col>` widths via `table.getBoundingClientRect()`, never `scrollWidth`) — applied directly to whichever `scroll`/`table` pair is passed, so it can mock either the original DOM or a simulated freshly-rebuilt replacement. */
  function mockDimensions(scroll: HTMLElement, table: HTMLElement, clientWidth: number): void {
    Object.defineProperty(scroll, 'clientWidth', { get: () => clientWidth, configurable: true });
    Object.defineProperty(scroll, 'scrollWidth', {
      get: () => {
        throw new Error('must not read scrollWidth — see this file\'s own top doc comment on that describe block');
      },
      configurable: true,
    });
    Object.defineProperty(table, 'getBoundingClientRect', {
      value: () => {
        const colEls = Array.from(table.querySelectorAll('col')) as HTMLElement[];
        const width = colEls.reduce((sum, c) => sum + (Number.parseFloat(c.style.width) || 0), 0);
        return { width, left: 0, right: width, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      },
      configurable: true,
    });
    let scrollLeftValue = 0;
    Object.defineProperty(scroll, 'scrollLeft', {
      get: () => scrollLeftValue,
      set: (v: number) => {
        scrollLeftValue = Math.max(0, v);
      },
      configurable: true,
    });
  }

  it('preserves the live scroll position through pointer-up — no snap to 0', () => {
    const doc = `${TABLE}\n{table-col-widths="400,400,400"}`;
    const view = mountRootView(doc);
    const { wrapper } = buildWidgetWrapper(3, 0);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const scroll = wrapper.querySelector('.cm-table-scroll') as HTMLElement;
    const table = scroll.querySelector('table') as HTMLElement;
    mockDimensions(scroll, table, 800); // table starts at 1200, maxScrollLeft = 400
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [400, 400, 400]);
    scroll.scrollLeft = 400; // scrolled all the way right

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    pointer('pointerdown', hit, 500);
    pointer('pointermove', document, 400); // 400 -> 300; sum 1100, live scrollLeft clamps to 300
    expect(scroll.scrollLeft).toBe(300);

    pointer('pointerup', document, 400); // commits at the same 300 the live drag already reached

    // The bug this test guards against: a naive re-implementation could
    // leave `scroll.scrollLeft` reset to 0 here even though nothing about
    // this specific harness rebuilds the DOM — proving the restoration
    // step runs at all (not merely that live tracking already got it
    // right, which the describe block above already covers) is exactly
    // what asserting *after* pointerup, not just after the last
    // pointermove, achieves.
    expect(scroll.scrollLeft).toBe(300);
  });

  it('finds and restores onto a genuinely NEW .cm-table-scroll inserted during the commit dispatch — not the stale pre-dispatch reference', () => {
    const doc = `${TABLE}\n{table-col-widths="400,400,400"}`;
    const view = mountRootView(doc);
    const { widget, wrapper } = buildWidgetWrapper(3, 0);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const oldScroll = wrapper.querySelector('.cm-table-scroll') as HTMLElement;
    const oldTable = oldScroll.querySelector('table') as HTMLElement;
    mockDimensions(oldScroll, oldTable, 800); // table starts at 1200, maxScrollLeft = 400
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [400, 400, 400]);
    oldScroll.scrollLeft = 400;

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    pointer('pointerdown', hit, 500);
    pointer('pointermove', document, 400); // 400 -> 300; sum 1100, live scrollLeft clamps to 300
    expect(oldScroll.scrollLeft).toBe(300);

    // Simulates CM6's own documented rebuild contract: the widget's whole
    // DOM subtree is discarded and replaced with a genuinely new one,
    // synchronously, from inside `view.dispatch()` — mirroring what a real
    // `eq()`-driven `TableWidget` rebuild does (this table's `columnWidths`
    // really did just change), before `dispatch()` returns to
    // `commitResize`'s own caller.
    const originalDispatch = view.dispatch.bind(view);
    (view as unknown as { dispatch: typeof view.dispatch }).dispatch = ((spec: Parameters<typeof view.dispatch>[0]) => {
      const result = originalDispatch(spec);
      const newWrapper = document.createElement('div');
      newWrapper.className = 'cm-table-wrapper cm-table-wrapper--explicit-widths';
      const newScroll = document.createElement('div');
      newScroll.className = 'cm-table-scroll';
      newWrapper.appendChild(newScroll);
      const newTable = document.createElement('table');
      newScroll.appendChild(newTable);
      const newColgroup = document.createElement('colgroup');
      for (let i = 0; i < 3; i++) {
        const col = document.createElement('col');
        col.style.width = i === 2 ? '300px' : '400px'; // matches the width just committed
        newColgroup.appendChild(col);
      }
      newTable.appendChild(newColgroup);
      mockDimensions(newScroll, newTable, 800);
      widget.replaceChildren(newWrapper);
      return result;
    }) as typeof view.dispatch;

    pointer('pointerup', document, 400); // commits at the same 300 the live drag reached

    const freshScroll = widget.querySelector('.cm-table-scroll') as HTMLElement;
    expect(freshScroll).not.toBe(oldScroll);
    // Restored onto the NEW element — not left at its own default 0, and
    // not silently no-op'd because the code still held onto `oldScroll`.
    expect(freshScroll.scrollLeft).toBe(300);
  });

  it('clamps the restored position when the committed width is narrower than what the live drag last showed', () => {
    const doc = `${TABLE}\n{table-col-widths="400,400,400"}`;
    const view = mountRootView(doc);
    const { widget, wrapper } = buildWidgetWrapper(3, 0);
    wrapper.classList.add('cm-table-wrapper--explicit-widths');
    const oldScroll = wrapper.querySelector('.cm-table-scroll') as HTMLElement;
    const oldTable = oldScroll.querySelector('table') as HTMLElement;
    mockDimensions(oldScroll, oldTable, 800);
    attachTableColumnResizeHandles(wrapper, 0, view, 3, [400, 400, 400]);
    oldScroll.scrollLeft = 400;

    const hit = wrapper.querySelectorAll('.cm-table-column-resize-hit')[2]!;
    pointer('pointerdown', hit, 500);
    pointer('pointermove', document, 350); // 400 -> 250; sum 1050, scrollLeft clamps 400 -> 250
    expect(oldScroll.scrollLeft).toBe(250);

    // The rebuilt table ends up even narrower than what the live drag's
    // own last pointermove showed (simulating, e.g., `materializeWidthsForResize`
    // rounding differently than the live pixel-for-pixel drag did) —
    // restoration must clamp to *this* fresh width's own real max, not
    // blindly reapply the pre-dispatch value.
    const originalDispatch = view.dispatch.bind(view);
    (view as unknown as { dispatch: typeof view.dispatch }).dispatch = ((spec: Parameters<typeof view.dispatch>[0]) => {
      const result = originalDispatch(spec);
      const newWrapper = document.createElement('div');
      newWrapper.className = 'cm-table-wrapper cm-table-wrapper--explicit-widths';
      const newScroll = document.createElement('div');
      newScroll.className = 'cm-table-scroll';
      newWrapper.appendChild(newScroll);
      const newTable = document.createElement('table');
      newScroll.appendChild(newTable);
      const newColgroup = document.createElement('colgroup');
      for (let i = 0; i < 3; i++) {
        const col = document.createElement('col');
        col.style.width = i === 2 ? '160px' : '400px'; // narrower than the live drag's own 250px
        newColgroup.appendChild(col);
      }
      newTable.appendChild(newColgroup);
      mockDimensions(newScroll, newTable, 800);
      widget.replaceChildren(newWrapper);
      return result;
    }) as typeof view.dispatch;

    pointer('pointerup', document, 350);

    const freshScroll = widget.querySelector('.cm-table-scroll') as HTMLElement;
    // New sum: 400+400+160=960; maxScrollLeft = 960-800 = 160 — below the
    // captured 250, so restoration must clamp down to 160, not apply 250
    // verbatim (which the fresh mock's own `scrollLeft` setter would only
    // coincidentally have floored correctly if it happened to go negative;
    // here it wouldn't, since 250 is still a "valid-looking" positive
    // number — only this function's own `Math.min` catches it).
    expect(freshScroll.scrollLeft).toBe(160);
  });
});
