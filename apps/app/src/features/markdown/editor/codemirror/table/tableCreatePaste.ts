import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { findAllTables, padCellContent } from './tableGeometry';
import { readClipboardTable } from './tablePaste';
import { tableSelectionField } from './tableSelection';

/**
 * Paste of tabular clipboard data *outside* any existing table — creates a
 * brand-new Markdown table at the root selection, in one transaction.
 * `tablePaste.ts` (Milestone 5) owns pasting into an already-existing
 * table (active-cell target or `range` `TableSelection`); this module
 * never touches that path and is skipped outright whenever a `range`
 * selection is active (the only case a plain root `paste` could mean
 * "into an existing table" — see `tablePaste.ts`'s own doc comment for why
 * the active-cell case can never even reach a root-registered handler).
 *
 * **Deliberately no caret-safety logic of its own.** This module builds
 * one plain insertion `ChangeSpec` and dispatches it with an ordinary
 * "caret after the inserted text" selection — exactly what CM6's own
 * default paste handling already does (`replaceSelection`/`changeByRange`
 * in the installed `@codemirror/view` source both set an explicit
 * resulting selection). Two already-installed, general transaction filters
 * do the rest, "for free," the same way they already do for a table typed
 * or pasted as raw Markdown text and left to CM6's *unintercepted* default
 * paste: `tableActivationNormalization()`'s own "general terminal-table
 * guarantee" (its own doc comment) reacts to *any* doc-changing
 * transaction, regardless of source, and appends a trailing newline
 * whenever the transaction leaves some table as the document's own last
 * content — exactly the case where the new table would otherwise have no
 * following line for a caret to land on. `tableRootSelectionSnap()` then
 * corrects the resulting selection if it rests inside (or at the trailing
 * boundary of) the newly-created table's own range. Both already run on
 * every transaction unconditionally; this module does not need to special-
 * case anything for them to work.
 *
 * **Header semantics.** Per this milestone's own explicit instruction, the
 * first pasted row is never treated as a semantic header — it becomes the
 * table's structural first (header) line only because GFM's own table
 * grammar requires *some* first line before the delimiter row, matching
 * "use the current table creation/activation conventions rather than
 * inventing a new header model" (`tableActivationNormalization.ts` itself
 * never distinguishes a "real" header from an ordinary first row either —
 * it treats whatever's above a completing delimiter row as the header
 * purely structurally).
 *
 * **A pasted single row (header/delimiter, no data row) gets a seeded
 * blank body row; two or more pasted rows never do.** This module only
 * ever builds the table text `grid` itself describes — it never adds a
 * blank row on its own. The difference in outcome comes entirely from
 * `tableActivationNormalization()`'s own already-existing behavior
 * (reused here, not reimplemented): its `hasExistingDataRow` check looks
 * for a real data row immediately below the delimiter row *within the
 * same transaction*. A one-row paste's own insert has nothing there, so
 * it seeds one blank row — identical to typing a header+delimiter by hand
 * and stopping. A paste with at least one data row already satisfies that
 * check (`hasExistingDataRow` is already `true`), so nothing is seeded.
 * This is a deliberate product decision (confirmed directly), not an
 * accepted side effect: a bare header/delimiter paste is genuinely
 * indistinguishable, by design, from a user who has just finished typing
 * one — the same row-seeding a manual table activation gets.
 */

/** `'| ' + cells + ' |'`, one cell per column, via `padCellContent` — the exact primitive `tablePaste.ts`'s own new-row construction already uses (`buildPasteChanges`'s `newRowTexts` — kept independent here rather than imported, since that function builds one row anchored to an *existing* table's geometry, a genuinely different shape from "every row of a brand-new table," not a case of duplicating the same logic). */
function buildRowText(cells: readonly string[]): string {
  return '|' + cells.map((cell) => padCellContent(cell, 0) + '|').join('');
}

/** A literal `|` in plain (non-Markdown) pasted content would otherwise be read as a structural column delimiter, corrupting the very table being created — escaped to `\|`, GFM's own standard escape, before it's ever written into Markdown source. Never applied to `'internal'`-source content, which is already Clutter's own previously-serialized Markdown (see `ClipboardTable`'s own doc comment in `tablePaste.ts`) — escaping it again would corrupt an already-correct `\|` into `\\|`. */
function escapeTableCellText(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}

/**
 * The full Markdown source for a brand-new table from `grid` — header row,
 * one generated `---` alignment row, then every remaining row as body
 * content. `grid` must already be rectangular (`normalizeGrid`,
 * `tablePaste.ts`) and non-empty; both are guaranteed by
 * `readClipboardTable`'s own contract.
 */
function buildTableMarkdown(grid: readonly (readonly string[])[], escape: boolean): string {
  const columnCount = grid[0]!.length;
  const cellText = (raw: string) => (escape ? escapeTableCellText(raw) : raw);

  const headerRow = buildRowText(grid[0]!.map(cellText));
  const alignmentRow = buildRowText(Array.from<string>({ length: columnCount }).fill('---'));
  const bodyRows = grid.slice(1).map((row) => buildRowText(row.map(cellText)));

  return [headerRow, alignmentRow, ...bodyRows].join('\n');
}

/**
 * GFM lets a table "interrupt" an ordinary preceding paragraph with no
 * blank line required (confirmed directly, live: `"Before text"` followed
 * immediately by a pasted table, single newline only, still parses and
 * renders as two distinct blocks) — so this is *not* a general "always
 * separate with a blank line" rule. It exists for the one case that
 * genuinely breaks without it, confirmed directly the same way: a table
 * has no such interruption rule for *more pipe-rows* — an existing table
 * with no genuine blank line between it and the newly-inserted text
 * absorbs this table's own header/delimiter/body lines as more of *its
 * own* rows instead of starting a new table, corrupting both.
 *
 * **Checked by the actual gap, not exact adjacency.** An earlier version
 * of this check compared `from`/`to` directly against a table's own
 * `.from`/`.to` — wrong, confirmed live: `tableActivationNormalization()`'s
 * own terminal-table guarantee already appends one trailing `\n` after any
 * table left at the document's end, so the very next real line's own
 * start sits at `table.to + 1`, not `table.to` — an exact-boundary check
 * never caught it. The real, general test is "does *any* actual blank
 * line already sit between the nearest table and this insertion point" —
 * `/^\n?$/` on the gap text is `true` for zero or exactly one newline (no
 * blank line at all) and `false` the moment a real `\n\n` or any other
 * content appears in between.
 */
function tableAdjacencySeparators(state: EditorState, from: number, to: number): { leading: string; trailing: string } {
  const tables = findAllTables(state);

  const precedingTableEnd = tables.map((t) => t.to).filter((end) => end <= from);
  const nearestPrecedingEnd = precedingTableEnd.length > 0 ? Math.max(...precedingTableEnd) : null;
  const leading = nearestPrecedingEnd !== null && /^\n?$/.test(state.sliceDoc(nearestPrecedingEnd, from)) ? '\n\n' : '';

  const followingTableStart = tables.map((t) => t.from).filter((start) => start >= to);
  const nearestFollowingStart = followingTableStart.length > 0 ? Math.min(...followingTableStart) : null;
  const trailing = nearestFollowingStart !== null && /^\n?$/.test(state.sliceDoc(to, nearestFollowingStart)) ? '\n\n' : '';

  return { leading, trailing };
}

export function tableCreatePaste(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const selection = view.state.field(tableSelectionField, false) ?? null;
      if (selection && selection.kind === 'range') {
        // Milestone 5's own `tablePaste()` territory — a `range` selection
        // means "paste into this existing table's selected rectangle," not
        // "create a new table here."
        return false;
      }

      const table = readClipboardTable(event);
      if (!table) {
        return false;
      }

      const markdown = buildTableMarkdown(table.grid, table.source !== 'internal');
      const { from, to } = view.state.selection.main;
      const { leading, trailing } = tableAdjacencySeparators(view.state, from, to);
      const insert = leading + markdown + trailing;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + leading.length + markdown.length },
        scrollIntoView: true,
      });
      return true;
    },
  });
}
