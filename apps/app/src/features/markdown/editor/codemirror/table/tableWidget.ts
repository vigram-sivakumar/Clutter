import { WidgetType, type EditorView } from '@codemirror/view';

import './tableWidget.css';
import type { TableColumnAlignment } from './tableAlignment';
import type { TableActiveCellController } from './tableActiveCellController';
import { renderInlineMarkdown } from './renderInlineMarkdown';

const ALIGN_CLASS: Readonly<Record<Exclude<TableColumnAlignment, null>, string>> = {
  left: 'cm-table-widget-align-left',
  center: 'cm-table-widget-align-center',
  right: 'cm-table-widget-align-right',
};

/**
 * One cell's raw text plus its trimmed source range (`from`/`to` —
 * `tableWidgetField.ts`'s own `rowCells` — excludes the padding spaces
 * around the text, matching `tableCellNavigation.ts`'s `trimmedCellRange`
 * contract for the same cell) and its untrimmed range (`rawFrom`/`rawTo`
 * — the full delimiter-to-delimiter gap, padding included).
 *
 * `rawFrom`/`rawTo` exist specifically for the active-cell *containment*
 * check in `buildRow()` below, not for rendering — see that check's own
 * doc comment for the bug this avoids (a controller anchor that has grown
 * to include a just-typed trailing space no longer exactly equals this
 * cell's own freshly re-trimmed `to`).
 */
export interface TableCellData {
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly rawFrom: number;
  readonly rawTo: number;
}

/**
 * Real HTML `<table>` projection of one Markdown table (Architecture E,
 * ADR-034, §B of docs/table-implementation-plan.md). Every cell renders
 * as static formatted HTML via `renderInlineMarkdown`, **except** the one
 * cell matching `controller`'s own `activeFrom`/`activeTo` (if any),
 * which instead hosts `controller.nestedView.dom` — the single reusable
 * nested `EditorView` (M2) — directly (M5).
 *
 * **DOM structure (M5 DOM-structure fix)** — five layers, each with one
 * job, none of them M6's (no drag handles, row/column buttons, selection,
 * resizing, or clipboard behavior anywhere in this widget):
 *
 * ```
 * div.cm-table-widget[contenteditable=false]   — the CM6 block-widget boundary (toDOM()'s own return value)
 *   div.cm-table-wrapper                        — outer table layout / future table-level styling surface
 *     table                                     — the actual 2D table layout
 *       th/td                                   — cell geometry only, no content of their own
 *         div.cm-table-cell-wrapper             — the cell-level rendering/editing boundary
 *           (renderInlineMarkdown HTML, or the active cell's nested .cm-editor)
 * ```
 *
 * `.cm-table-cell-wrapper` is the one stable mount point every cell's
 * content actually lives in — static `renderInlineMarkdown` HTML for an
 * inactive cell, or the nested editor's own `.cm-editor` DOM for the
 * active one — never directly as a `<th>`/`<td>` child. This mirrors the
 * general shape real table-editing surfaces (Obsidian's own
 * `.table-cell-wrapper`, confirmed by direct DOM comparison) already use
 * for the same reason: a stable, single-purpose mount point one level
 * below the table-semantic cell element, not because `<td>` itself is
 * insufficient.
 *
 * `controller` is `undefined` for a read-only table (a note embed) — every
 * cell then renders static-only, with no click handler at all: the same
 * "omit the capability entirely" gate `buildEditorExtensions.ts`'s
 * `!readOnly` branch already applies to every other editing-only
 * extension, extended here rather than a second gating mechanism
 * (§9/Cross-check). This is also what keeps this milestone from
 * reintroducing "one `EditorView` per cell" even in miniature: a
 * read-only table's cells never get a click handler that could ever call
 * `controller.activate()`, because there is no `controller` for them to
 * call it on.
 *
 * Same shape as `NoteEmbedWidget.ts` (`toDOM`/`destroy`/`eq`).
 */
export class TableWidget extends WidgetType {
  constructor(
    /** Header row's cells, left to right. */
    readonly headerCells: readonly TableCellData[],
    /** One entry per column, aligned by index with `headerCells`. */
    readonly alignments: readonly TableColumnAlignment[],
    /** Every data row's cells, in document order. Rows may be ragged (fewer cells than the header, per GFM) — rendered as-is, no padding to a rectangular grid. */
    readonly bodyRows: readonly (readonly TableCellData[])[],
    /** The table's own raw Markdown source — part of the equality/rebuild signal for `eq()` below, mirroring `NoteEmbedWidget.eq()`'s own `resolution.markdown` comparison: static rendering is a pure function of this string. */
    readonly rawText: string,
    /**
     * The table's own absolute document position — also part of `eq()`,
     * for the same reason `NoteEmbedWidget.eq()` compares its own
     * `pos`/`to` alongside content: an edit entirely *before* this table
     * (inside a different, earlier table, say) shifts every cell's
     * absolute `from`/`to` by the edit's own delta while leaving this
     * table's `rawText` byte-for-byte identical — `eq()` comparing only
     * `rawText` would then report "unchanged," letting CM6 reuse the old
     * DOM (and the click handlers closed over inside it, still holding
     * the *pre-shift* absolute positions) instead of rebuilding with
     * fresh ones. This is ADR-034's own "stale click-handler closures"
     * bug reproducing at the table-position level rather than the
     * per-cell level it was originally found at — caught here the same
     * way `NoteEmbedWidget` already guards against it for its own
     * position-dependent behavior.
     */
    readonly tableFrom: number,
    /** `undefined` for a read-only table — see this class's own doc comment. */
    readonly controller: TableActiveCellController | undefined,
    /** Snapshot of `controller?.activeAnchor?.from` at construction time — a second, independent part of the `eq()` signal: rendering must also rebuild when *which* cell is active changes, even though `rawText` alone wouldn't catch that (activation carries no document change — see `tableActiveCellChanged`'s own doc comment in `tableActiveCellController.ts`). */
    readonly activeFrom: number | null,
    /** Snapshot of `controller?.activeAnchor?.to` at construction time — see `activeFrom`. */
    readonly activeTo: number | null
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return (
      this.rawText === other.rawText &&
      this.tableFrom === other.tableFrom &&
      this.activeFrom === other.activeFrom &&
      this.activeTo === other.activeTo
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    // M5 "preserve focus across rebuilds" fix — captured *before* touching
    // any DOM below, while the nested view's current DOM position (inside
    // whichever `<td>` the *previous* toDOM() call built) is still the
    // live, attached one. Deliberately `nestedView.root.activeElement ===
    // nestedView.contentDOM` — the same check `EditorView.hasFocus` itself
    // uses for element identity — rather than `hasFocus` directly:
    // `hasFocus` additionally requires `document.hasFocus()` (whether the
    // whole *window* has OS-level focus), which would wrongly skip
    // restoring here if the user had briefly alt-tabbed away mid-edit
    // (`activeElement` is still correct in that case; only `hasFocus`
    // goes false). Confirmed by direct live-browser investigation that
    // `buildRow`'s active-cell branch (below) moving this same DOM node
    // into a freshly built, still-detached `<table>` blurs it the instant
    // that move happens, with nothing to undo that on its own. Only ever
    // true when this rebuild is itself the direct result of an edit typed
    // *inside* the active cell (root transactions from anywhere else
    // don't leave the nested editor focused in the first place) — so this
    // is never a blind "refocus on every rebuild": a rebuild triggered by
    // an edit elsewhere, or by nothing being active at all, always finds
    // `wasFocused` false and touches focus not at all, per this fix's own
    // "if the root editor was focused, do not steal focus" requirement.
    const nestedView = this.controller?.nestedView;
    const wasFocused = !!nestedView && nestedView.root.activeElement === nestedView.contentDOM;

    const widget = document.createElement('div');
    widget.className = 'cm-table-widget';
    widget.contentEditable = 'false';
    // The one lookup handle `tableBoundaryNavigation.ts` needs: keyboard-
    // driven entry (ArrowUp/ArrowDown from a root line adjacent to the
    // table) has no click event to read a target cell's wrapper element
    // from, unlike `buildRow()`'s own mousedown handler below — it must
    // instead query for this exact table's rendered DOM by position, the
    // same `tableFrom` identity `eq()` above already keys off.
    widget.dataset.tableFrom = String(this.tableFrom);

    // Suppresses root CM6's own default mousedown handling (coordinate-
    // to-position mapping against this block-replace widget's rendered
    // bounds) for every click that does **not** land inside a real
    // `<td>`/`<th>` — the table's own border, `.cm-table-wrapper`'s
    // padding-right gutter (reserved for future column controls),
    // inter-row/inter-cell gaps, or any other part of this widget's own
    // rendered box. Without this, `ignoreEvent()` returning `false`
    // (below) lets CM6 process an unhandled click here exactly like any
    // other document click — snapping the root selection to whichever
    // side of the widget's `[tableFrom, tableTo)` replaced range is
    // nearest, which can leave `selection.main.head` resolving *inside*
    // that hidden range (confirmed directly: `findEnclosingTable` then
    // returns this table for that position) — the one invariant this
    // widget must never violate. `target.closest('td, th')` is
    // deliberately the *only* test: it is true for every genuine cell
    // click, active or inactive alike — an inactive cell's own
    // `element.addEventListener('mousedown', ...)` below already
    // `stopPropagation()`s before this listener would even run, and an
    // *active* cell's nested editor (mounted with no click handler of
    // its own — its own separate `EditorView` owns click-to-caret
    // placement internally) still lives inside a `<td>`, so this check
    // lets both cases fall through untouched, exactly matching "clicking
    // inside a real cell keeps working normally." Every other click is
    // fully suppressed — `preventDefault()` blocks the browser's own
    // default action, `stopPropagation()` stops root CM6's own
    // `contentDOM` mousedown listener further up this same DOM tree from
    // also running (the same pairing the per-cell handler below already
    // uses, and for the identical reason) — and nothing else happens: no
    // dispatch, no selection change, no activation. Deliberately not a
    // click-to-exit feature (no boundary/side classification, no line
    // creation) — keyboard Up/Down/Left/Right (`tableBoundaryNavigation.ts`/
    // `tableCellNavigation.ts`) remains the only way to enter or exit a
    // table, unchanged by this listener.
    if (this.controller) {
      widget.addEventListener('mousedown', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('td, th')) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      });
    }

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'cm-table-wrapper';
    widget.appendChild(tableWrapper);

    const table = document.createElement('table');
    tableWrapper.appendChild(table);

    const thead = document.createElement('thead');
    thead.appendChild(this.buildRow(view, this.headerCells, 'th'));
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of this.bodyRows) {
      tbody.appendChild(this.buildRow(view, row, 'td'));
    }
    table.appendChild(tbody);

    if (wasFocused) {
      // Deferred to a microtask, not called synchronously here — `table`
      // (and the nested view's DOM now inside it) is not yet attached to
      // the live document at this point in `toDOM()`; CM6 inserts the
      // returned element into the document synchronously immediately
      // after this method returns, within the same `dispatch()` call, so
      // by the time a microtask runs (strictly after the current
      // synchronous execution, still before the next paint), the
      // attachment has already happened and the element is genuinely
      // focusable again. Re-checks `this.controller?.nestedView ===
      // nestedView` and `.isConnected` at fire time — defensive against a
      // second, unrelated activation/deactivation landing between this
      // rebuild and the microtask actually running (e.g. a very fast
      // second click), which must win over this stale restore rather than
      // being clobbered by it.
      queueMicrotask(() => {
        if (this.controller?.nestedView === nestedView && nestedView.dom.isConnected) {
          nestedView.focus();
        }
      });
    }

    return widget;
  }

  private buildRow(view: EditorView, cells: readonly TableCellData[], cellTag: 'th' | 'td'): HTMLTableRowElement {
    const tr = document.createElement('tr');
    cells.forEach((cell, columnIndex) => {
      const element = document.createElement(cellTag);
      const alignment = this.alignments[columnIndex];
      if (alignment) {
        element.classList.add(ALIGN_CLASS[alignment]);
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'cm-table-cell-wrapper';
      element.appendChild(wrapper);

      // Containment against the cell's own *untrimmed* [rawFrom, rawTo]
      // gap, not exact equality against its trimmed [from, to] — found
      // via direct live-browser investigation: typing a trailing space
      // (or any whitespace) at the end of the active cell's content grows
      // `activeTo` (the controller's own `ChangeSet.mapPos`-tracked
      // anchor, unaware of trimming) past this cell's freshly re-trimmed
      // `to` (which excludes that same trailing space again), so exact
      // equality would fail here even though nothing structural changed
      // — the nested editor would then match no cell at all, rendering
      // as if deactivated (with the DOM node never re-attached anywhere)
      // while the controller still genuinely considers a cell active.
      // `rawFrom`/`rawTo` (`tableWidgetField.ts`'s own `rowCells`) is the
      // stable identity every position inside this cell's real delimiter
      // gap maps to, regardless of how much of it is "trimmed content"
      // right now.
      const isActive =
        !!this.controller &&
        this.activeFrom !== null &&
        this.activeTo !== null &&
        cell.rawFrom <= this.activeFrom &&
        this.activeTo <= cell.rawTo;
      if (isActive && this.controller!.nestedView) {
        wrapper.appendChild(this.controller!.nestedView.dom);
      } else {
        wrapper.innerHTML = renderInlineMarkdown(cell.text);
        if (this.controller) {
          const controller = this.controller;
          // Listens on `element` (the <th>/<td> itself), not `wrapper` —
          // `wrapper`'s own height is driven by its content, which for an
          // empty (or short, single-line) cell can be much shorter than
          // the row it sits in once a *sibling* cell in that row wraps to
          // multiple lines (table row height = tallest cell). Confirmed
          // directly (elementFromPoint at the visual center of a short
          // cell in a tall row): the click lands on `element`, never
          // reaching `wrapper`'s own listener — a CSS-only fix
          // (`height: 100%` on the wrapper) does not reliably resolve
          // against a table row's auto-derived height in the same way it
          // would against an ordinary block parent with an explicit
          // height, so this is fixed at the hit-target level instead:
          // `element` always spans the row's full rendered height by
          // definition (that's what "row height" means in table layout),
          // so listening there makes every pixel of the visible cell
          // clickable regardless of how tall its own content is.
          element.addEventListener('mousedown', (event) => {
            event.preventDefault();
            // Stops this click from also reaching root CM6's own
            // mousedown handling (`contentDOM`'s own listener, further up
            // this same DOM tree — the table widget is rendered *inside*
            // root's content) — confirmed by direct live-browser
            // investigation to be a real, independent bug otherwise: without
            // this, `preventDefault()` alone blocks the browser's native
            // default action but not root CM6's own JS-level listener,
            // which still ran, placing root's *own* selection/focus at the
            // clicked position (visible as a second, simultaneous caret) and
            // winning the focus race against this cell's own activation.
            event.stopPropagation();
            // `cell.from`/`cell.to` are captured in this exact `toDOM()`
            // call's own closure, always rebuilt fresh alongside the rest
            // of this cell's rendering — never a range surviving past the
            // rebuild that would invalidate it (ADR-034's own "stale
            // click-handler closures" bug this guards against;
            // `TableActiveCellController.activate()`'s own doc comment).
            // `wrapper`, not `element`, is still the mount container — the
            // nested editor lives inside the wrapper, only click detection
            // moved to the td/th.
            controller.activate(view, wrapper, cell.from, cell.to, cell.to);
          });
        }
      }
      tr.appendChild(element);
    });
    return tr;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
