import { syntaxTree } from '@codemirror/language';
import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { parseTableAlignment, type TableColumnAlignment } from './tableAlignment';

/**
 * Live Preview rendering for GFM tables (Phase 1 of the table milestone —
 * see docs/editor-feature-matrix.md), deliberately built as CSS-table
 * styling over the existing decorated document text (Option B of the
 * investigation this milestone approved), **not** a multi-line
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
 * Row/cell CSS-table *layout* classes are applied **unconditionally**,
 * whether or not the row is engaged — only the pipe-hiding and
 * alignment-row-collapsing decorations toggle off. This deliberately
 * mirrors `listLineIndent.ts`'s own established precedent ("Deliberately
 * unconditional — not gated on isTokenEngaged ... clicking into the raw
 * text to edit it would visibly shift the whole line's layout"): keeping
 * the grid layout constant while only the marker-hiding toggles is what
 * lets the engaged row directly reveal its raw `|`/`-` text in place,
 * without the surrounding table ever re-flowing or fragmenting into
 * separate anonymous tables.
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
// aligned as one grid regardless of which row is currently engaged.
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
 * without these flags plus `Prec.highest` on the extension below, `|
 * **Bold** |` produced `<span class="tok-strong"><span
 * class="cm-table-cell">Bold</span></span>` (inverted nesting — the cell
 * class lost its own outer wrapper) and `| [[Page]] |` dropped
 * `cm-table-cell` entirely.
 */
function cellClass(alignment: TableColumnAlignment): string {
  return alignment ? `cm-table-cell ${ALIGN_CLASS[alignment]}` : 'cm-table-cell';
}

/**
 * A row is engaged — reveals its own raw Markdown — iff the current
 * selection touches its own physical line, exactly the same
 * `isPhysicalLineEngaged` rule already used for `ListMark`/`QuoteMark`
 * (`liveMarkDecoration.ts`). Tables have no lazy-continuation concept
 * (unlike lists/blockquotes — `TableParser.nextLine` simply stops adding
 * rows the instant a line fails to parse as one), so every row already
 * maps 1:1 to exactly one physical line with no ambiguity to resolve.
 */
function isRowEngaged(state: EditorState, rowFrom: number): boolean {
  const rowLine = state.doc.lineAt(rowFrom).number;
  const selection = state.selection.main;
  const fromLine = state.doc.lineAt(selection.from).number;
  const toLine = state.doc.lineAt(selection.to).number;
  return rowLine === fromLine || rowLine === toLine;
}

interface DecoItem {
  readonly from: number;
  readonly to: number;
  readonly deco: Decoration;
}

/**
 * Decorates one `TableHeader`/`TableRow` node: the line itself always
 * gets the grid-layout class; each `TableCell` always gets its alignment
 * class; `TableDelimiter` marks (the `|` characters) only collapse when
 * the row is not engaged. Column index is tracked by counting
 * `TableDelimiter` siblings crossed, not by counting `TableCell` siblings
 * — an empty cell (`| a | | c |`) produces no `TableCell` node at all
 * (confirmed against `@lezer/markdown`'s own `parseRow`: a cell is only
 * emitted when it has at least one non-space character), so counting
 * cells would silently misalign every column after the first empty one.
 */
function decorateRow(row: SyntaxNode, alignment: readonly TableColumnAlignment[], engaged: boolean, isHeader: boolean, items: DecoItem[]): void {
  items.push({ from: row.from, to: row.from, deco: isHeader ? tableHeaderLine : tableRowLine });

  let columnIndex = -1;
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') {
      columnIndex++;
      if (!engaged && child.to > child.from) {
        items.push({ from: child.from, to: child.to, deco: hiddenMark });
      }
      continue;
    }
    if (child.name === 'TableCell' && child.to > child.from) {
      items.push({
        from: child.from,
        to: child.to,
        deco: Decoration.mark({
          class: cellClass(alignment[columnIndex] ?? null),
          inclusiveStart: true,
          inclusiveEnd: true,
        }),
      });
    }
  }
}

/**
 * Decorates the alignment/separator row (`| :--- | ---: |`) — always gets
 * the grid-layout line class (so its collapsed height still participates
 * in the table's visual rhythm as a thin divider, styled in CSS), and its
 * raw text collapses to nothing only when not engaged, revealing the
 * genuine Markdown the instant the cursor visits that line — identical
 * reveal-on-engagement contract as every other marker in this codebase.
 */
function decorateAlignRow(alignRow: SyntaxNode, engaged: boolean, items: DecoItem[]): void {
  items.push({ from: alignRow.from, to: alignRow.from, deco: tableAlignRowLine });
  if (!engaged && alignRow.to > alignRow.from) {
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

  decorateRow(header, alignment, isRowEngaged(state, header.from), true, items);

  if (alignRow && alignRow.name === 'TableDelimiter') {
    decorateAlignRow(alignRow, isRowEngaged(state, alignRow.from), items);
  }

  for (let row = alignRow?.nextSibling; row; row = row.nextSibling) {
    if (row.name === 'TableRow') {
      decorateRow(row, alignment, isRowEngaged(state, row.from), false, items);
    }
  }
}

function buildTableDecorations(view: EditorView): DecorationSet {
  const items: DecoItem[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
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
 */
export function tableDecoration(): Extension {
  const plugin = ViewPlugin.fromClass<TableDecorationPlugin>(
    class implements TableDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildTableDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
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
