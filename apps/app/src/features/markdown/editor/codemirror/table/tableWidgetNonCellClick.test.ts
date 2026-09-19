// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { findEnclosingTable } from './tableGeometry';
import { tableWidgetDecoration } from './tableWidgetField';

const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

function mountView(doc: string, controller: TableActiveCellController): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller)],
  });
  return new EditorView({ state, parent });
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
    const controller = new TableActiveCellController();
    const view = mountView(`${BASIC_TABLE}\n\nAfter.`, controller);
    view.dispatch({ selection: { anchor: view.state.doc.length } }); // start with a known, table-external selection

    const selectionBefore = view.state.selection.main.head;
    const wrapper = view.dom.querySelector<HTMLElement>('.cm-table-wrapper');
    expect(wrapper).toBeTruthy();

    mousedown(wrapper!);

    expect(view.state.selection.main.head).toBe(selectionBefore);
    expect(controller.nestedView).toBeNull();
    expect(controller.activeAnchor).toBeNull();
    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();
  });

  it('clicking the outer widget padding/gutter area does nothing', () => {
    const controller = new TableActiveCellController();
    const view = mountView(`${BASIC_TABLE}\n\nAfter.`, controller);
    view.dispatch({ selection: { anchor: view.state.doc.length } });

    const selectionBefore = view.state.selection.main.head;
    const widget = view.dom.querySelector<HTMLElement>('.cm-table-widget');
    expect(widget).toBeTruthy();

    mousedown(widget!);

    expect(view.state.selection.main.head).toBe(selectionBefore);
    expect(controller.nestedView).toBeNull();
    expect(controller.activeAnchor).toBeNull();
  });

  it('clicking non-cell structural elements (table/thead/tbody/tr) does nothing', () => {
    const controller = new TableActiveCellController();
    const view = mountView(`${BASIC_TABLE}\n\nAfter.`, controller);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    const selectionBefore = view.state.selection.main.head;

    for (const selector of ['table', 'thead', 'tbody', 'tr']) {
      const el = view.dom.querySelector<HTMLElement>(selector);
      expect(el, `expected a <${selector}> element in the rendered table`).toBeTruthy();
      mousedown(el!);
    }

    expect(view.state.selection.main.head).toBe(selectionBefore);
    expect(controller.nestedView).toBeNull();
    expect(controller.activeAnchor).toBeNull();
  });

  it('the mousedown event is prevented and stopped for non-cell areas (no fallthrough to default browser/root handling)', () => {
    const controller = new TableActiveCellController();
    const view = mountView(BASIC_TABLE, controller);
    const widget = view.dom.querySelector<HTMLElement>('.cm-table-widget')!;

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    let reachedDocument = false;
    document.addEventListener('mousedown', () => {
      reachedDocument = true;
    });

    widget.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(reachedDocument).toBe(false);
  });
});

describe('tableWidget — clicking an actual cell keeps working normally', () => {
  it('clicking an inactive cell still activates it (nested editor mounts)', () => {
    const controller = new TableActiveCellController();
    const view = mountView(BASIC_TABLE, controller);

    const cell = view.dom.querySelector<HTMLElement>('tbody td');
    expect(cell).toBeTruthy();

    clickCell(cell!);

    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView).not.toBeNull();
  });

  it('clicking the currently-active cell again does not get intercepted as a non-cell click', () => {
    const controller = new TableActiveCellController();
    const view = mountView(BASIC_TABLE, controller);

    const cell = view.dom.querySelector<HTMLElement>('tbody td');
    clickCell(cell!);
    expect(controller.nestedView).not.toBeNull();
    const nestedViewBefore = controller.nestedView;
    const anchorBefore = controller.activeAnchor;

    // Re-dispatch on the now-active cell's own wrapper (where the nested
    // editor's DOM actually lives) — `target.closest('td, th')` must
    // still find the enclosing `<td>` from there, so the widget-level
    // non-cell suppression must not deactivate/disrupt it (its own
    // nested `EditorView` may legitimately call `preventDefault()` as
    // part of its own native click-to-caret handling — that's expected
    // and irrelevant here; what matters is the cell stays active).
    const nestedDom = controller.nestedView!.dom;
    mousedown(nestedDom);

    expect(controller.nestedView).toBe(nestedViewBefore);
    expect(controller.activeAnchor).toEqual(anchorBefore);
  });

  it('clicking a header cell also activates it normally', () => {
    const controller = new TableActiveCellController();
    const view = mountView(BASIC_TABLE, controller);

    const headerCell = view.dom.querySelector<HTMLElement>('thead th');
    expect(headerCell).toBeTruthy();

    clickCell(headerCell!);

    expect(controller.activeAnchor).not.toBeNull();
    expect(controller.nestedView).not.toBeNull();
  });
});
