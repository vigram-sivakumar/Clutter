import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { findEnclosingTable } from './tableGeometry';

/**
 * Centralized invariant enforcement for "root selection is never inside a
 * table widget's replaced range" — the single sanitizer every mouse/
 * keyboard/paste/programmatic path funnels through, rather than a special
 * case per input path. Same mechanism and shape as this codebase's other
 * `*SelectionSnap` extensions (`semanticToken/tokenSelectionSnap.ts`,
 * `highlight/liveMarkSelectionSnap.ts`) — an `EditorState.transactionFilter`
 * that corrects a selection endpoint landing where it shouldn't, reused
 * rather than duplicated as its own mechanism (this is exactly the class
 * of problem those already solve for inline constructs).
 *
 * `EditorView.atomicRanges` was considered and rejected: it only pushes a
 * position out of a range when the position is *strictly interior*
 * (`pos > from && pos < to`, confirmed directly against the installed
 * `@codemirror/view` source) — it deliberately leaves boundary positions
 * (`pos === from`, `pos === to`) alone, because for an ordinary inline
 * atomic widget a caret at either boundary is a perfectly normal, correct
 * place for it to sit. That's also why `tokenSelectionSnap` treats
 * `pos <= node.from || pos >= node.to` as safe. A table's own widget is
 * different: it is a *block* replace decoration (`Decoration.replace(...,
 * {block: true})`) standing in for what used to be several real lines of
 * Markdown, and a root caret at exactly `table.from` — the position where
 * that replaced content starts — has no ordinary single line to render
 * against any more, producing a giant caret spanning the widget's full
 * rendered height (confirmed directly, live-browser; see also
 * `TableWidget`'s own `mousedown` handler, which suppresses non-cell
 * clicks for the same reason). So unlike an inline token, `table.from`
 * itself must be treated as *inside* the table for root-selection
 * purposes: root selection may be before a table or after one, never
 * `>= table.from && < table.to`.
 *
 * **Unlike its inline siblings, this one does *not* skip doc-changing
 * transactions.** `tokenSelectionSnap`/`liveMarkSelectionSnap` only ever
 * correct a pure selection move, because an inline construct is recognized
 * incrementally as it's typed — a doc-changing transaction can never
 * *instantiate* one in a single step with the caret already left inside
 * it. A table can: pasting a complete, already-valid GFM table is one
 * transaction that both creates the `Table` node *and* leaves CM6's own
 * default paste selection whichever end of the pasted range it always
 * lands at, which — unlike typing a table in one keystroke at a time —
 * can genuinely fall inside `[table.from, table.to)` in that same
 * transaction. `tableActivationNormalization.ts` doesn't catch this: its
 * own cursor-placement branch only runs when it seeds a *missing* blank
 * data row (`!candidate.hasExistingDataRow`) — a pasted, already-complete
 * table always has one, so that branch, and the only place that module
 * computes a safe cursor, never runs. Extending *that* module to also
 * special-case "already complete" would duplicate exactly the general
 * rule this file exists to express once; checking every resulting
 * selection here, doc change or not, covers both without a paste-specific
 * branch anywhere.
 *
 * Checked against `tr.state` (the transaction's own resulting document),
 * not `tr.startState` — required for the doc-changing case (the table
 * doesn't exist in `startState` yet for a fresh paste), and equivalent to
 * `tr.startState` whenever the document didn't change, so one code path
 * covers both.
 *
 * **`table.to` itself is also treated as a violation, not just `[from,
 * to)`, whenever a real line follows.** `table.to` is the exact `.to` of
 * the table's own last (hidden, widget-consumed) source line — `doc.lineAt`
 * still resolves it to *that* line, not the next one (the boundary between
 * them is the newline character at `table.to` itself, i.e. one position
 * further on) — so a caret placed exactly there has the identical "no
 * ordinary line to render against" problem `table.from` has, just from the
 * trailing side, not a genuinely safe landing spot. Only `table.to + 1`
 * (the following line's own start) is a real editable line — matching
 * `tableActivationNormalization.ts`'s own manual-creation cursor placement,
 * which already lands one position past the seeded row's own end for
 * exactly this reason (its own `cursorPos = seedRowEnd + 1` comment). When
 * nothing follows the table at all (`table.to === state.doc.length`),
 * `table.to` is simply the end of the document and is left alone — there
 * is no further position to move to. Symmetrically, "before" lands at
 * `table.from - 1` — the previous line's own end, not `table.from` itself.
 *
 * Deliberately does not activate a cell — entering a table intentionally
 * (plain ArrowUp/Down/Left/Right from an adjacent line) is
 * `tableBoundaryNavigation.ts`'s job, installed at `Prec.highest` so it
 * runs, and returns `true`, before CM6's own default movement (and
 * therefore before this filter ever sees a violating position from that
 * path). This filter only ever fires for paths that keymap doesn't cover —
 * a mouse drag started outside the table and released partway through it,
 * Shift+Arrow extending a selection into the table, a paste that creates
 * one outright, or any other command a future change adds without its own
 * table-aware handling — and for those, simply parking the selection just
 * outside the table (on the nearest real line) is the correct, minimal
 * behavior; there is no "intended" cell to activate for an unintentional
 * selection landing.
 *
 * Only `tr.selection.main` — same simplification `tokenSelectionSnap`
 * already makes; nothing in this table feature supports multiple
 * selection ranges.
 *
 * **A non-collapsed range's endpoint is exempt from snapping when it sits
 * exactly at a table boundary (`pos === table.from` or `pos === table.to`),
 * never when it's genuinely interior.** The "no ordinary line to render a
 * caret against" problem this whole file exists to prevent is specifically
 * a *caret* problem: CM6's own `drawSelection` extension only ever paints a
 * cursor for an *empty* range (confirmed against the installed
 * `@codemirror/view` source — `drawSelection.ts` iterates
 * `state.selection.ranges` and draws a cursor layer entry only where
 * `range.empty`); a non-empty range paints a selection-background rect
 * instead, which needs no single line to anchor a caret to. So the
 * "giant caret spanning the widget" failure mode this file's own earlier
 * doc comment describes cannot occur for a non-collapsed range, at either
 * boundary — only for a *collapsed* one. This is what makes `Ctrl+A`
 * (`EditorSelection.single(0, doc.length)`, dispatched by
 * `@codemirror/commands`' `selectAll`) work correctly even when a table
 * sits at `doc` position 0 or ends at `doc.length`: without this
 * exemption, `table.from === 0` has no "before" position to snap to
 * (this file's own `snapPosition`, below), so the anchor was forced
 * forward past the table — silently excluding the table's own source
 * range from "select all," and collapsing the selection entirely in a
 * table-only document. The exemption is deliberately narrower than "any
 * non-collapsed selection touching a table" — a *strictly interior*
 * position (`table.from < pos < table.to`) is left snapped exactly as
 * before regardless of collapsed-ness, since nothing in this codebase
 * currently produces one deliberately (mouse clicks are already
 * intercepted by `TableWidget`'s own `mousedown` handler; keyboard entry
 * goes through `tableBoundaryNavigation.ts`), and CM6's own coordinate
 * mapping for an arbitrary position inside a single-DOM-node block-replace
 * widget is not something this change has verified is safe to rely on.
 */
export function tableRootSelectionSnap(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.selection) {
      return tr;
    }

    const range = tr.selection.main;
    const collapsed = range.anchor === range.head;
    const anchor = snapPosition(tr.state, range.anchor, collapsed);
    const head = snapPosition(tr.state, range.head, collapsed);

    if (anchor === range.anchor && head === range.head) {
      return tr;
    }

    // `changes` must be carried over explicitly here (unlike
    // `tokenSelectionSnap`'s equivalent return, which can omit it): that
    // one only ever replaces a non-doc-changing transaction, where an
    // omitted `changes` defaults to a no-op over `tr.startState`'s own
    // (unchanged) length regardless. This filter also replaces
    // doc-changing transactions (paste) — omitting `changes` here would
    // default to a no-op sized against `tr.startState`'s *pre-paste*
    // length, which the corrected, *post-paste* selection position can
    // easily exceed (`RangeError: Selection points outside of document`,
    // confirmed directly).
    return {
      changes: tr.changes,
      selection: EditorSelection.single(anchor, head),
      effects: tr.effects,
      scrollIntoView: tr.scrollIntoView,
    };
  });
}

/**
 * The table whose replaced range `pos` violates the root-selection
 * invariant for — `[table.from, table.to)` in the ordinary case, plus the
 * one extra boundary position `findEnclosingTable` itself doesn't flag:
 * `pos === table.to` with a real line still following it (see this file's
 * own top doc comment for why that position isn't actually safe here,
 * unlike for an inline token). Checking `pos - 1` against `findEnclosingTable`
 * reuses that same tree-resolution rather than re-deriving "which table
 * ends here" independently — `pos - 1` is unambiguously the table's own
 * last real (hidden) character whenever `pos` is its `.to`.
 */
function findViolatedTable(state: EditorState, pos: number): SyntaxNode | null {
  const enclosing = findEnclosingTable(state, pos);
  if (enclosing) {
    return enclosing;
  }
  if (pos > 0 && pos < state.doc.length) {
    const preceding = findEnclosingTable(state, pos - 1);
    if (preceding && preceding.to === pos) {
      return preceding;
    }
  }
  return null;
}

function snapPosition(state: EditorState, pos: number, collapsed: boolean): number {
  const table = findViolatedTable(state, pos);
  if (!table) {
    return pos;
  }

  // A non-collapsed selection may rest exactly at the table's own boundary
  // — see this file's own top doc comment for why that's safe (no caret is
  // ever drawn for a non-empty range) and why a genuinely interior position
  // is deliberately not included here.
  if (!collapsed && (pos === table.from || pos === table.to)) {
    return pos;
  }

  const after = table.to < state.doc.length ? table.to + 1 : table.to;

  // No position before the table exists when it opens the document —
  // `after` is the only valid target left.
  if (table.from === 0) {
    return after;
  }

  const before = table.from - 1;
  return pos - before <= after - pos ? before : after;
}
