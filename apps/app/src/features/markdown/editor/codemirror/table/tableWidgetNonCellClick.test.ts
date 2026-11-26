// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { findEnclosingTable } from './tableGeometry';
import { tableWidgetDecoration } from './tableWidgetField';

const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

const mounted: EditorView[] = [];
afterEach(() => { for (const view of mounted.splice(0)) view.destroy(); });
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tableCellEditor, tableWidgetDecoration(true)],
  });
  const view = new EditorView({ state, parent });
  mounted.push(view);
  return view;
}

/** Real, bubbling `mousedown` — matches how a browser click actually reaches the widget's listener (delegation relies on bubbling through the DOM tree). */
function mousedown(el: Element): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/** A full click (mousedown + mouseup). Activation itself happens synchronously on `mousedown` (`beginCellDragTracking`, `tableCellRangeSelection.ts`, never defers it) — `mouseup` is included so its own per-gesture listeners clean themselves up rather than leaking across tests. The non-cell-click tests above only need `mousedown` — nothing they assert depends on activation completing. */
function clickCell(el: Element): void {
  mousedown(el);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
}

describe('tableWidget — non-cell area clicks do nothing', () => {
  it('clicking the table border/wrapper does not move the root selection, activate a cell, or leave the caret inside the table', () => {
    const view = mountView(`${BASIC_TABLE}\n\nAfter.`);
    view.dispatch({ selection: { anchor: view.state.doc.length } }); // start with a known, table-external selection

    const selectionBefore = view.state.selection.main.head;
    const wrapper = view.dom.querySelector<HTMLElement>('.cm-table-wrapper');
    expect(wrapper).toBeTruthy();

    mousedown(wrapper!);

    expect(view.state.selection.main.head).toBe(selectionBefore);
    expect(view.plugin(tableCellEditor)!.nested).toBeNull();
    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();
  });

  it('clicking the outer widget padding/gutter area does nothing', () => {
    const view = mountView(`${BASIC_TABLE}\n\nAfter.`);
    view.dispatch({ selection: { anchor: view.state.doc.length } });

    const selectionBefore = view.state.selection.main.head;
    const widget = view.dom.querySelector<HTMLElement>('.cm-table-widget');
    expect(widget).toBeTruthy();

    mousedown(widget!);

    expect(view.state.selection.main.head).toBe(selectionBefore);
    expect(view.plugin(tableCellEditor)!.nested).toBeNull();
  });

  it('clicking non-cell structural elements (table/thead/tbody/tr) does nothing', () => {
    const view = mountView(`${BASIC_TABLE}\n\nAfter.`);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const selectionBefore = view.state.selection.main.head;

    for (const selector of ['table', 'thead', 'tbody', 'tr']) {
      const el = view.dom.querySelector<HTMLElement>(selector);
      expect(el, `expected a <${selector}> element in the rendered table`).toBeTruthy();
      mousedown(el!);
    }

    expect(view.state.selection.main.head).toBe(selectionBefore);
    expect(view.plugin(tableCellEditor)!.nested).toBeNull();
  });


});

describe('tableWidget — clicking an actual cell keeps working normally', () => {
  it('clicking an inactive cell still activates it (nested editor mounts)', () => {
    const view = mountView(BASIC_TABLE);

    const cell = view.dom.querySelector<HTMLElement>('tbody td');
    expect(cell).toBeTruthy();

    clickCell(cell!);

    expect(view.plugin(tableCellEditor)!.nested).not.toBeNull();
  });

  it('clicking the currently-active cell again does not get intercepted as a non-cell click', () => {
    const view = mountView(BASIC_TABLE);

    const cell = view.dom.querySelector<HTMLElement>('tbody td');
    clickCell(cell!);
    expect(view.plugin(tableCellEditor)!.nested).not.toBeNull();
    const nestedViewBefore = view.plugin(tableCellEditor)!.nested;

    // Re-dispatch on the now-active cell's own wrapper (where the nested
    // editor's DOM actually lives) — `target.closest('td, th')` must
    // still find the enclosing `<td>` from there, so the widget-level
    // non-cell suppression must not deactivate/disrupt it (its own
    // nested `EditorView` may legitimately call `preventDefault()` as
    // part of its own native click-to-caret handling — that's expected
    // and irrelevant here; what matters is the cell stays active).
    const nestedDom = view.plugin(tableCellEditor)!.nested!.dom;
    mousedown(nestedDom);

    expect(view.plugin(tableCellEditor)!.nested).toBe(nestedViewBefore);
  });

  it('clicking a header cell also activates it normally', () => {
    const view = mountView(BASIC_TABLE);

    const headerCell = view.dom.querySelector<HTMLElement>('thead th');
    expect(headerCell).toBeTruthy();

    clickCell(headerCell!);

    expect(view.plugin(tableCellEditor)!.nested).not.toBeNull();
  });
});
