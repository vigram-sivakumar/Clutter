// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { attachTableOutsideClickHandling, tableSelectionField } from './tableSelection';

/**
 * End-to-end coverage for the 2026-09-27 "inactive-cell first drag"
 * correction (`TableActiveCellController.activate()`'s own "Why
 * forwarding" doc comment): a real mousedown-then-drag over text in a
 * *previously inactive* table cell used to collapse to a plain caret,
 * because CM6's own native mouse-selection tracking (`MouseSelection`,
 * `@codemirror/view`) never got a chance to see the initiating `mousedown`
 * — the nested `EditorView` that owns that tracking didn't exist until
 * `TableActiveCellController.activate()` mounted it, by which point the
 * original event had already been consumed
 * (`preventDefault`/`stopPropagation`) by `TableWidget.buildRow`'s own
 * per-cell listener. The fix forwards that original event, once the
 * nested editor's `contentDOM` is real, as a genuine synthetic `mousedown`
 * targeted at it — letting CM6 own the rest of the gesture natively.
 *
 * Drives the actual production wiring (`buildEditorExtensions`), the same
 * "test the CM6 extension, not the component" convention
 * `tableLiveWiring.test.ts` already uses, since this bug lives entirely in
 * how these extensions cooperate across the activation boundary — a
 * narrower unit test of `TableActiveCellController` alone (see
 * `tableActiveCellController.test.ts`'s own forwarding-focused describe
 * block) can't exercise `TableWidget.buildRow`'s own listener wiring or
 * `attachTableOutsideClickHandling`'s document-level listener at the same
 * time.
 */

const REQUIRED: Omit<BuildEditorExtensionsOptions, 'readOnly' | 'hostPageId' | 'getTableActiveCellController'> = {
  resolveWikiLink: () => undefined,
  resolveEmbedImage: () => undefined,
  resolveEmbedPdf: () => undefined,
  onImageClick: () => undefined,
  onOpenImageMenu: () => undefined,
  onPdfEmbedClick: () => undefined,
  onOpenPdfMenu: () => undefined,
  resolveImageSrc: () => undefined,
  resolveTag: () => undefined,
  resolveDate: () => undefined,
};

const mountedViews: EditorView[] = [];
const outsideClickCleanups: Array<() => void> = [];

beforeEach(() => {
  stubElementFromPoint();
});

afterEach(() => {
  for (const cleanup of outsideClickCleanups.splice(0)) {
    cleanup();
  }
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
  vi.restoreAllMocks();
});

/**
 * Mounts the real production extension set, with `attachTableOutsideClickHandling`
 * wired up exactly as `MarkdownEditor.tsx` wires it — required here (unlike
 * `tableLiveWiring.test.ts`, which doesn't need it) specifically to test #8
 * below: that the forwarded mousedown never reaches it.
 */
function mount(doc: string): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: buildEditorExtensions({
        ...REQUIRED,
        readOnly: false,
        hostPageId: 'test-page',
        getTableActiveCellController: () => controller,
      }),
    }),
    parent,
  });
  controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
  const detach = attachTableOutsideClickHandling(view, controller);
  outsideClickCleanups.push(detach);
  mountedViews.push(view);
  return { view, controller };
}

function findCell(view: EditorView, text: string): Element {
  const cell = Array.from(view.dom.querySelectorAll('th, td')).find((el) => el.textContent === text);
  if (!cell) {
    throw new Error(`no cell with text "${text}"`);
  }
  return cell;
}

function wrapperOf(cell: Element): Element {
  const wrapper = cell.querySelector(':scope > .cm-table-cell-wrapper');
  if (!wrapper) {
    throw new Error('cell has no .cm-table-cell-wrapper: ' + cell.outerHTML);
  }
  return wrapper;
}

function nestedViewOf(controller: TableActiveCellController): EditorView {
  const view = controller.nestedView;
  if (!view) {
    throw new Error('no active nested view');
  }
  return view;
}

/**
 * jsdom has no real layout engine — `posAndSideAtCoords` (what
 * `basicMouseSelection`, `@codemirror/view`'s own `handlers.mousedown`,
 * actually calls to resolve a click's position; see
 * `tableActiveCellController.test.ts`'s own forwarding tests for the same
 * finding) is mocked here as a simple, deterministic function of
 * `coords.x`, so a real multi-step drag (`mousedown` at one `clientX`,
 * `mousemove` to another) resolves to two different, predictable
 * positions rather than jsdom's own unusable geometry.
 */
function mockLinearPosition(charWidth = 10): void {
  vi.spyOn(EditorView.prototype, 'posAndSideAtCoords').mockImplementation(function (this: EditorView, coords: { x: number; y: number }) {
    const pos = Math.max(0, Math.min(this.state.doc.length, Math.round(coords.x / charWidth)));
    return { pos, assoc: 1 };
  });
}

/**
 * A `mousemove` mid-drag. `buttons: 1` (the primary button held down) is
 * required — `MouseSelection.move` (`@codemirror/view`) bails out and
 * destroys its own tracking the instant it sees `event.buttons == 0`,
 * treating that as the button having already been released; a plain
 * `new MouseEvent('mousemove', ...)` defaults `buttons` to `0`, which
 * silently cancels the drag before it ever computes a selection —
 * confirmed directly (initial versions of these tests omitted this and
 * every drag collapsed to a no-op).
 */
function dragMove(clientX: number, clientY: number): void {
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientX, clientY }));
}

function dragEnd(clientX: number, clientY: number): void {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY }));
}

/**
 * jsdom does not implement `document.elementFromPoint` at all (calling it
 * throws `TypeError: ... is not a function`) — `beginCellDragTracking`'s
 * own cross-cell detection (`tableCellRangeSelection.ts`'s `resolveCellAt`)
 * calls it on every `mousemove`, so it must exist as a real, spy-able
 * function before any drag test runs, not only the ones that mock its
 * return value.
 */
function stubElementFromPoint(): void {
  if (!('elementFromPoint' in document)) {
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => null;
  }
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Hello beautiful world | Engineer |';

describe('inactive-cell first drag — text is actually selected (the reported bug)', () => {
  it('1. mousedown + drag across a few characters on an inactive cell selects that text on the very first gesture', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');
    expect(controller.activeAnchor).toBeNull(); // starts inactive

    wrapperOf(cell).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 60, clientY: 10 }));
    dragMove(140, 10);
    dragEnd(140, 10);

    const nested = nestedViewOf(controller);
    expect(nested.state.doc.toString()).toBe('Hello beautiful world');
    expect(nested.state.selection.main.empty).toBe(false);
    expect(nested.state.selection.main.from).toBe(6);
    expect(nested.state.selection.main.to).toBe(14);
  });

  it('2. a simple click (no drag) on an inactive cell still places the caret correctly', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');

    wrapperOf(cell).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 60, clientY: 10 }));
    dragEnd(60, 10);

    const nested = nestedViewOf(controller);
    expect(nested.state.selection.main.empty).toBe(true);
    expect(nested.state.selection.main.from).toBe(6);
  });

  it('3. a double-click on an inactive cell still selects the word (regression guard — this already worked before the fix and must keep working)', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');
    const wrapper = wrapperOf(cell);

    // First click: activates (detail 1). Second click: cell is already
    // active, so this reaches CM6's own native double-click handling
    // directly — the forwarding fix plays no role in this one at all.
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 70, clientY: 10 }));
    dragEnd(70, 10);
    const nested = nestedViewOf(controller);
    nested.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 2, clientX: 70, clientY: 10 }));
    dragEnd(70, 10);

    expect(nested.state.selection.main.empty).toBe(false);
  });

  it('4. a triple-click on an inactive cell still selects the whole line (regression guard)', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');
    const wrapper = wrapperOf(cell);

    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 70, clientY: 10 }));
    dragEnd(70, 10);
    const nested = nestedViewOf(controller);
    nested.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 2, clientX: 70, clientY: 10 }));
    dragEnd(70, 10);
    nested.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 3, clientX: 70, clientY: 10 }));
    dragEnd(70, 10);

    expect(nested.state.selection.main.from).toBe(0);
    expect(nested.state.selection.main.to).toBe(nested.state.doc.length);
  });

  it('5. a drag starting on an inactive cell and crossing into another cell still promotes to a table range selection', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');

    wrapperOf(cell).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 60, clientY: 10 }));
    // Cross into the "Engineer" cell — beginCellDragTracking's own
    // elementFromPoint-based detection needs a real element under the
    // point, so this simulates the crossing directly against its own
    // resolver rather than relying on jsdom's (absent) hit-testing.
    const engineerCell = findCell(view, 'Engineer');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(engineerCell as HTMLElement);
    dragMove(300, 10);
    dragEnd(300, 10);

    expect(view.state.field(tableSelectionField)).not.toBeNull();
    expect(view.state.field(tableSelectionField)!.kind).toBe('range');
    expect(controller.activeAnchor).toBeNull(); // deactivated by the cross-cell promotion
  });
});

describe('already-active cell — unaffected by the forwarding fix', () => {
  it('6. drag across text in an already-active cell behaves exactly as before', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');
    const wrapper = wrapperOf(cell);
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 60, clientY: 10 }));
    dragEnd(60, 10);
    const nested = nestedViewOf(controller);

    nested.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 60, clientY: 10 }));
    dragMove(140, 10);
    dragEnd(140, 10);

    expect(nested.state.selection.main.empty).toBe(false);
    expect(nested.state.selection.main.from).toBe(6);
    expect(nested.state.selection.main.to).toBe(14);
  });

  it('7. double-click in an already-active cell behaves exactly as before', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');
    const wrapper = wrapperOf(cell);
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 70, clientY: 10 }));
    dragEnd(70, 10);
    const nested = nestedViewOf(controller);

    nested.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 2, clientX: 70, clientY: 10 }));
    dragEnd(70, 10);

    expect(nested.state.selection.main.empty).toBe(false);
  });
});

describe('forwarded mousedown — re-entry prevention', () => {
  it('8. does not reach the document-level outside-click fallback, does not re-trigger activation, and does not mount a second nested editor', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');
    let documentMousedownCount = 0;
    // Deliberately *bubble*-phase (no `capture: true`) — the same phase
    // `attachTableOutsideClickHandling` itself listens on
    // (`targetDocument.addEventListener('mousedown', handleMouseDown)`,
    // `tableSelection.ts`). A capture-phase listener would also see the
    // forwarded event during its initial top-down descent to
    // `contentDOM` regardless of that event's own `bubbles: false` (which
    // only suppresses the *upward* phase after reaching its target) — so
    // capture is the wrong phase to assert this on; bubble is what
    // actually matters here, and what the real fallback listens on.
    document.addEventListener('mousedown', () => documentMousedownCount++);

    wrapperOf(cell).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 60, clientY: 10 }));
    dragEnd(60, 10);

    // Zero real mousedowns reach document for this gesture: the original
    // one is already stopped by `TableWidget.buildRow`'s own per-cell
    // listener (`event.stopPropagation()`, required so root CM6's own
    // `contentDOM` doesn't also process the click — this function's own
    // "why a single document-level listener" doc comment), and the
    // forwarded one (`bubbles: false`, targeted at the nested
    // `contentDOM`) must not be a *second*, different way of reaching
    // `document` that the original click's own containment didn't already
    // prevent.
    expect(documentMousedownCount).toBe(0);
    // `document.querySelectorAll`, not `view.dom.querySelectorAll` —
    // `Element.querySelectorAll` only searches *descendants*, so
    // searching from `view.dom` itself (which also carries the
    // `.cm-editor` class) would only ever find the nested one, not root.
    expect(document.querySelectorAll('.cm-editor').length).toBe(2); // root + exactly one nested
    expect(controller.activeAnchor).not.toBeNull();
  });

  it('9. exactly one resolved position wins for the initial gesture — no leftover manual refinement dispatch overwriting or racing the forwarded one', () => {
    // The nested view doesn't exist until this click activates the cell,
    // so a transaction-count listener can't be attached beforehand here —
    // that direct count (exactly one `select.pointer` transaction from the
    // forwarding call) is asserted at the unit level instead, in
    // `tableActiveCellController.test.ts`'s own forwarding describe block.
    // This test instead asserts the *observable consequence* of there
    // being only one winning mechanism: the forwarded mousedown's own
    // resolved position (60/10 = 6) is what stands, not cursorPos's own
    // coarse end-of-content placement (22, the cell's own length) that a
    // leftover manual refinement could otherwise have left in place or
    // raced against.
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');

    wrapperOf(cell).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 60, clientY: 10 }));
    dragEnd(60, 10);

    const nested = nestedViewOf(controller);
    expect(nested.state.selection.main.from).toBe(6);
  });

  it('10. no duplicate mouse-selection tracking — a single drag moves the selection exactly once per mousemove, not twice', () => {
    mockLinearPosition();
    const { view, controller } = mount(TABLE);
    const cell = findCell(view, 'Hello beautiful world');
    wrapperOf(cell).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 1, clientX: 60, clientY: 10 }));
    const nested = nestedViewOf(controller);
    let updateCount = 0;
    const countingExt = EditorView.updateListener.of((u) => {
      if (u.selectionSet) {
        updateCount++;
      }
    });
    nested.dispatch({ effects: StateEffect.appendConfig.of(countingExt) });

    dragMove(140, 10);
    dragEnd(140, 10);

    // One update for the mousemove's own selection change (a second,
    // independent `MouseSelection` instance tracking the same gesture
    // would double this).
    expect(updateCount).toBe(1);
  });
});
