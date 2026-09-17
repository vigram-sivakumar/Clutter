import { syntaxTree } from '@codemirror/language';
import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { parseTableAlignment, type TableColumnAlignment } from './tableAlignment';

/**
 * Live Preview rendering for GFM tables, built as CSS-table styling over
 * the existing decorated document text (Option B of the investigation
 * this milestone approved), **not** a multi-line
 * `Decoration.replace({block: true})` widget. Every table cell stays the
 * exact same real, directly-editable CM6 text every other Live Preview
 * construct in this codebase already is — no foreign editable island, no
 * new interaction mechanism. `TableRow`/`TableHeader` decorated with
 * `Decoration.line({class: 'cm-table-row'})` and each `TableCell` with
 * `Decoration.mark({class: 'cm-table-cell ...'})`; contiguous
 * `display: table-row` siblings get an anonymous CSS table wrapper
 * synthesized by the browser (CSS2.1 table box generation) — no wrapping
 * DOM element required.
 *
 * **Pipes and the alignment/delimiter row are hidden unconditionally —
 * never revealed, regardless of cursor/selection.** This supersedes an
 * earlier per-row "engaged row reveals its own raw Markdown" model (the
 * same reveal-on-engagement contract `liveMarkDecoration.ts` uses for
 * list/blockquote markers). That model was deliberately rejected for
 * tables: the frozen table UX requires a rendered table to always remain
 * a rendered table — clicking or moving the cursor into a cell must never
 * expose `|` syntax or the delimiter row, so the user interacts with it
 * as a table/grid, never as exposed Markdown. Structural safety
 * (Backspace/Delete never deleting a hidden `|` or the delimiter row,
 * Left/Right/Tab/Up/Down cell-boundary navigation) is handled entirely
 * separately, by the table keymap guards (`tableDeletionGuard.ts`,
 * `tableArrowKeymap.ts`, `tableTabKeymap.ts`, `tableEnterKeymap.ts`,
 * `tableArrowDownKeymap.ts`, `tableVerticalKeymap.ts`) via
 * `tableGeometry.ts`'s syntax-tree-only cell/row resolution — this file
 * has no interaction logic of its own, purely rendering.
 *
 * Row/cell CSS-table *layout* classes are applied unconditionally (they
 * always were, even under the old model) — only the pipe-hiding and
 * alignment-row-collapsing decorations are new to being unconditional.
 * Keeping the grid layout constant regardless of cursor position is what
 * keeps the whole table's columns aligned as one grid and never
 * re-flowing or fragmenting into separate anonymous tables.
 */

const tableRowLine = Decoration.line({ class: 'cm-table-row' });
const tableHeaderLine = Decoration.line({ class: 'cm-table-row cm-table-header' });
// Also carries `cm-table-row` (`display: table-row`), not just the
// collapsed-styling modifier class — an empty `display: block` div sitting
// between two runs of `display: table-row` siblings would break the
// browser's anonymous-table box generation into two separate fragments
// (header alone, body rows alone), each independently auto-sizing its own
// columns. Keeping every row — including this one — in the same
// contiguous `table-row` run is what keeps the whole table's columns
// aligned as one grid.
const tableAlignRowLine = Decoration.line({ class: 'cm-table-row cm-table-align-row' });
const hiddenMark = Decoration.replace({});

const ALIGN_CLASS: Readonly<Record<Exclude<TableColumnAlignment, null>, string>> = {
  left: 'cm-table-align-left',
  center: 'cm-table-align-center',
  right: 'cm-table-align-right',
};

/**
 * `inclusiveStart`/`inclusiveEnd: true` — required so this mark correctly
 * wraps a nested shared-set participant (Emphasis/Strong/Highlight/Link/...
 * via `inlineLivePreviewRegion`, or a widget-replace token via
 * `wikiLinkLivePreview`/Tag/Date) whose range exactly fills a cell's
 * content, e.g. `| **Bold** |`. Same reasoning, same fix as every other
 * wrapping participant in this codebase — see
 * `inlineLivePreviewParticipants.ts`'s `delimitedInlineRenderer` and
 * docs/editor-architecture-decisions.md's "Shared DecorationSet vs
 * independent CM6 extensions" section. Confirmed empirically necessary:
 * without these flags plus `Prec.lowest` on the extension below, `|
 * **Bold** |` produced `<span class="tok-strong"><span
 * class="cm-table-cell">Bold</span></span>` (inverted nesting — the cell
 * class lost its own outer wrapper) and `| [[Page]] |` dropped
 * `cm-table-cell` entirely.
 */
function cellClass(alignment: TableColumnAlignment): string {
  return alignment ? `cm-table-cell ${ALIGN_CLASS[alignment]}` : 'cm-table-cell';
}

interface DecoItem {
  readonly from: number;
  readonly to: number;
  readonly deco: Decoration;
}

/**
 * Decorates one `TableHeader`/`TableRow` node: the line itself always
 * gets the grid-layout class; every column always gets a `.cm-table-cell`
 * box with its alignment class, whether or not it has content; every
 * `TableDelimiter` (the `|` characters) always collapses. Column index is
 * tracked by counting `TableDelimiter` siblings crossed, not by counting
 * `TableCell` siblings — an empty cell (`| a | | c |`) produces no
 * `TableCell` node at all (confirmed against `@lezer/markdown`'s own
 * `parseRow`: a cell is only emitted when it has at least one non-space
 * character), so counting cells would silently misalign every column
 * after the first empty one.
 *
 * **Every column's `.cm-table-cell` mark spans the *entire* gap between
 * its two bounding delimiters — `[prevDelimiterTo, nextDelimiter.from)` —
 * never just a populated `TableCell` node's own trimmed range.** This is
 * deliberately independent of whether the column has a `TableCell` child
 * at all (an empty cell never does, per the paragraph above): both cases
 * go through this one same gap-based decoration, with no populated/empty
 * branch. This was **not** always true — an earlier version of this
 * function decorated only the *trimmed* `TableCell` range for a populated
 * column, leaving its own leading/trailing padding space(s) as plain,
 * undecorated text sitting directly inside the row's `display: table-row`
 * line, outside any `display: table-cell` element. Per CSS2.1's own table
 * box generation rules, a `display: table-row` box's children that are
 * *not* proper table children (here: that stray padding text, plus the
 * hidden delimiter's own `Decoration.replace` span and its
 * `cm-widgetBuffer` neighbors) get wrapped in an anonymous `table-cell`
 * box of their own — a real, separate, unstyled (no border, no padding)
 * table cell sitting *between* two real ones. Confirmed empirically via
 * `EditorView.domAtPos`/the real decorated DOM: the exact document
 * position at a populated cell's own content end (e.g. right after
 * "Name") resolved into that anonymous cell's own plain-text child, not
 * into `Name`'s own `.cm-table-cell` span — which is what made the
 * caret appear to disappear or land on an invisible sliver at exactly
 * that boundary once `tableArrowKeymap.ts`'s Left/Right started landing
 * there deliberately. Folding the padding into the same mark as the
 * content — matching the empty-cell gap decoration this file already
 * used — removes the anonymous-cell case entirely: every character
 * between two delimiters now belongs to exactly one real, bordered/padded
 * `.cm-table-cell`, so a boundary position resolves into that cell's own
 * DOM text, never a stray gap box. `inclusiveStart`/`inclusiveEnd` are
 * unrelated to this fix (they govern whether a character *typed* at the
 * mark's own edge joins it, not which existing characters the mark
 * already covers) and are unchanged.
 */
function decorateRow(row: SyntaxNode, alignment: readonly TableColumnAlignment[], isHeader: boolean, items: DecoItem[]): void {
  items.push({ from: row.from, to: row.from, deco: isHeader ? tableHeaderLine : tableRowLine });

  let columnIndex = -1;
  let prevDelimiterTo: number | null = null;

  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableDelimiter') {
      continue; // A TableCell's own (trimmed) range is absorbed into the full column-gap mark below — no separate decoration for it.
    }
    if (prevDelimiterTo !== null && child.from > prevDelimiterTo) {
      items.push({
        from: prevDelimiterTo,
        to: child.from,
        deco: Decoration.mark({
          class: cellClass(alignment[columnIndex] ?? null),
          inclusiveStart: true,
          inclusiveEnd: true,
        }),
      });
    }
    columnIndex++;
    if (child.to > child.from) {
      items.push({ from: child.from, to: child.to, deco: hiddenMark });
    }
    prevDelimiterTo = child.to;
  }
}

/**
 * Decorates the alignment/separator row (`| :--- | ---: |`) — always gets
 * the grid-layout line class (so its collapsed height still participates
 * in the table's visual rhythm as a thin divider, styled in CSS via
 * `.cm-table-align-row { font-size: 0; line-height: 0 }`), and its raw
 * text always collapses to nothing — this row is structural syntax, never
 * user-editable data, so it never has anything to reveal.
 */
function decorateAlignRow(alignRow: SyntaxNode, items: DecoItem[]): void {
  items.push({ from: alignRow.from, to: alignRow.from, deco: tableAlignRowLine });
  if (alignRow.to > alignRow.from) {
    items.push({ from: alignRow.from, to: alignRow.to, deco: hiddenMark });
  }
}

function decorateTable(table: SyntaxNode, state: EditorState, items: DecoItem[]): void {
  const header = table.firstChild;
  if (!header || header.name !== 'TableHeader') {
    return; // Malformed relative to TableParser's own invariants — nothing to decorate.
  }

  const alignRow = header.nextSibling;
  const alignment = alignRow && alignRow.name === 'TableDelimiter' ? parseTableAlignment(state.sliceDoc(alignRow.from, alignRow.to)) : [];

  decorateRow(header, alignment, true, items);

  if (alignRow && alignRow.name === 'TableDelimiter') {
    decorateAlignRow(alignRow, items);
  }

  for (let row = alignRow?.nextSibling; row; row = row.nextSibling) {
    if (row.name === 'TableRow') {
      decorateRow(row, alignment, false, items);
    }
  }
}

function buildTableDecorations(view: EditorView): DecorationSet {
  const items: DecoItem[] = [];
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Table') {
          return;
        }
        decorateTable(node.node, view.state, items);
        return false; // Table's own children are handled directly above — don't also generically visit them.
      },
    });
  }

  // Sorted once, matching liveMarkDecoration.ts's own established
  // precedent — tree visitation order isn't guaranteed strictly ascending
  // once a node's own line-decoration (added at row.from) and its child
  // mark/replace decorations (added at various positions) are combined.
  return Decoration.set(
    items.map(({ from, to, deco }) => deco.range(from, to)),
    true
  );
}

interface TableDecorationPlugin extends PluginValue {
  decorations: DecorationSet;
}

/**
 * `Prec.lowest`: `TableCell`'s mark is an independent decoration source
 * from `inlineLivePreviewRegion`'s shared set and from `wikiLinkLivePreview`
 * (`Prec.high`) — self-contained precedence, not dependent on where
 * `MarkdownEditor.tsx` happens to list this extension relative to those.
 * Confirmed empirically (not assumed) which direction is correct: CM6's
 * decoration nesting puts the *lower*-precedence source as the outer
 * wrapper and the *higher*-precedence source inner — the reverse of the
 * intuitive reading of "precedence." This is exactly why
 * `**[[Page]]**` nests as `tok-strong > tok-wikilink`: `inlineLivePreviewRegion`
 * (default precedence) is outer, `wikiLinkLivePreview` (`Prec.high`) is
 * inner. `Prec.lowest` here (not `Prec.default`) so `TableCell` reliably
 * stays outer regardless of the shared set's own default precedence and
 * regardless of registration order — verified against `| **Bold** |`,
 * `| ==highlight== |`, and `| [[Page]] |` all producing `cm-table-cell` as
 * the outermost span.
 *
 * `update` only rebuilds on `docChanged`/`viewportChanged` — not
 * `selectionSet` — now that hiding no longer depends on the selection at
 * all; rebuilding on every selection change would be pure wasted work
 * under the always-hidden model.
 */
export function tableDecoration(): Extension {
  const plugin = ViewPlugin.fromClass<TableDecorationPlugin>(
    class implements TableDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildTableDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildTableDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );

  return Prec.lowest(plugin);
}
