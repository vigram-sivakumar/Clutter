import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, type ChangeSet, type Extension, type TransactionSpec } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { markdownLanguageExtension } from '../markdownLanguage';
import { splitDelimiterRowCells } from './tableAlignment';
import {
  buildEmptyRowText,
  emptyRowCellOffset,
  findEnclosingTable,
  getNavigableRows,
  insertRowAfterPosition,
  isAlignmentRow,
} from './tableGeometry';
import { rowCells } from './tableWidgetField';

/**
 * The transaction-level counterpart to `orderedListStructuralNormalization.ts`,
 * for exactly one bug class: GFM's own delimiter-row grammar
 * (`@lezer/markdown`'s `delimiterLine` regex — confirmed directly against
 * the installed source) makes leading/trailing pipes on a table row
 * **optional**, so `| Name | Age |` / `| --- | ---` is already a fully
 * valid, spec-compliant `Table` node — Lezer recognizes it, and
 * `tableWidgetField.ts` correctly renders it — the instant the second
 * column's dash run is typed, with no trailing `" |"` and no body row at
 * all. That is not a parser bug; it is exactly what "trailing pipes are
 * optional" means. The bug is narrower: Clutter has no mechanism that
 * then canonicalizes the *persisted* source into a genuinely finished
 * shape once a table exists — the same "lenient reader, strict writer"
 * contract every other construct in this codebase already keeps
 * (`docs/editor-architecture-decisions.md`'s locked note) has never been
 * established for tables. This module is that mechanism, for exactly two
 * things, no more:
 *
 * 1. **Trailing-pipe completion** — the delimiter row (and, by the same
 *    rebuild, any row missing a leading pipe) is rewritten to
 *    `"| c1 | c2 | ... |"`, preserving each column's own typed content
 *    (dash count, `:` alignment markers) byte-for-byte — this module
 *    never invents or pads a column width; the bug report's own "exact
 *    separator width is not important" instruction is read literally as
 *    "don't normalize width," not "pick a canonical width."
 * 2. **First-row seeding** — only when the table has *zero* navigable
 *    body rows yet (a brand-new table, exactly the reported scenario),
 *    one blank row is appended and the selection is placed in its first
 *    cell, mirroring `tableCellNavigation.ts`'s own `enterCommand` (same
 *    `buildEmptyRowText`/`emptyRowCellOffset`/`insertRowAfterPosition`
 *    helpers, reused not reimplemented) — Enter-in-the-header already
 *    does exactly this on an explicit keypress; this module fires the
 *    same construction the first time the table itself comes into
 *    existence, so a paste of an already-complete table (real data rows
 *    already present) is left untouched.
 *
 * **Trigger, precisely**: a table "becomes active" the instant its own
 * alignment/delimiter row transitions from *not enclosed by any `Table`
 * node* to *enclosed by one* — checked by mapping the delimiter row's
 * position backward through `tr.changes` and testing
 * `findEnclosingTable` against `tr.startState` (existing,
 * `tableGeometry.ts`-owned query, not a bespoke walk). This fires exactly
 * once per table: editing inside an *already*-active table (another
 * header keystroke, an alignment-colon change on the delimiter row
 * itself) finds the delimiter row already enclosed beforehand and is
 * left alone — this module has no opinion about any table once it has
 * already activated.
 *
 * Same CM6 mechanism, same composition guarantee, as
 * `orderedListStructuralNormalization.ts`'s own doc comment already
 * establishes in detail: `EditorState.transactionFilter` sees every
 * document-changing transaction regardless of which command (keystroke,
 * paste, programmatic edit) produced it, and a filter's own returned
 * `[tr, spec]` array is composed into one transaction by CM6 itself
 * (confirmed against the installed `@codemirror/state` source), so this
 * can never recursively re-trigger itself and is always one undo/redo
 * step.
 */

export interface TableActivationEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface TableActivationPlan {
  readonly edits: readonly TableActivationEdit[];
  /** Where the root document's selection should land — inside the first cell of a freshly-seeded blank row — or `null` when nothing in this transaction seeded one. Expressed in final (post-`edits`) document coordinates. */
  readonly cursorPos: number | null;
}

const EMPTY_PLAN: TableActivationPlan = { edits: [], cursorPos: null };

/**
 * `"| c1 | c2 | ... |"`, one column per `splitDelimiterRowCells` segment,
 * each column's own trimmed text preserved verbatim — `rowCells`
 * (tree-based, built for the header/data rows) does not apply to the
 * alignment row itself; see `tableAlignment.ts`'s own doc comment. The
 * only fallback (`'-'`) covers a segment that trims to empty, which a
 * genuinely valid delimiter cell can never produce (GFM requires at
 * least one dash), kept purely so this can never emit a malformed
 * `"| |  |"` cell if that invariant is ever violated upstream.
 */
function canonicalDelimiterRowText(state: EditorState, delimiterRow: SyntaxNode): string {
  const cells = splitDelimiterRowCells(state.sliceDoc(delimiterRow.from, delimiterRow.to));
  return '| ' + cells.map((cell) => cell || '-').join(' | ') + ' |';
}

/**
 * Every `Table` in `provisional` whose delimiter row did not already sit
 * inside a recognized `Table` in `startState` — see this module's own doc
 * comment for exactly why this, and not a whole-node identity comparison,
 * is the correct "did this table just come into existence" test.
 *
 * Discovery walks `changes`' own edited boundaries (`iterChanges`'s
 * `fromA`/`toA`, already in `startState`'s coordinate space — no
 * backward-mapping through `changes` is ever needed, matching
 * `orderedListStructuralNormalization.ts`'s own `collectStructuralCandidates`
 * pattern) rather than scanning every `Table` `findAllTables(provisional)`
 * returns: a position already inside an old `Table` (`findEnclosingTable(
 * startState, oldPos)`) is by definition not a new activation, so it's
 * skipped before ever mapping anything forward — the only forward
 * mapping this function performs (`changes.mapPos(oldPos, bias)`, the
 * direction `ChangeSet.mapPos` actually supports) is for genuinely
 * candidate positions.
 */
function findNewlyActivatedTables(startState: EditorState, provisional: EditorState, changes: ChangeSet): SyntaxNode[] {
  const found: SyntaxNode[] = [];
  const seen = new Set<number>();

  changes.iterChanges((fromA, toA) => {
    for (const oldPos of fromA === toA ? [fromA] : [fromA, toA]) {
      if (findEnclosingTable(startState, oldPos)) continue;
      for (const bias of [-1, 1] as const) {
        const table = findEnclosingTable(provisional, changes.mapPos(oldPos, bias));
        if (!table || seen.has(table.from)) continue;

        const header = table.firstChild;
        if (!header || header.name !== 'TableHeader') continue;
        const delimiterRow = header.nextSibling;
        if (!delimiterRow || !isAlignmentRow(delimiterRow)) continue;

        seen.add(table.from);
        found.push(table);
      }
    }
  });

  return found;
}

/**
 * Pure planning function — every fact used is derived fresh from `state`
 * (`tr.startState`) and `changes` (`tr.changes`), nothing cached or
 * remembered across calls, matching
 * `orderedListStructuralNormalization.ts`'s own "no hidden state"
 * discipline. The throwaway `provisional` state is built from only the
 * Markdown grammar (never this module's own filter) for the exact reason
 * that module's own doc comment gives: building it through the real
 * state's full extension config would recursively re-invoke this filter
 * on a transaction never meant to be dispatched.
 */
export function planTableActivationNormalization(state: EditorState, changes: ChangeSet): TableActivationPlan {
  const provisional = EditorState.create({
    doc: changes.apply(state.doc),
    extensions: [markdownLanguageExtension()],
  });
  ensureSyntaxTree(provisional, provisional.doc.length, 5000);

  const tables = findNewlyActivatedTables(state, provisional, changes);
  if (tables.length === 0) {
    return EMPTY_PLAN;
  }

  const edits: TableActivationEdit[] = [];
  let seedInsertPos: number | null = null;

  for (const table of tables) {
    const header = table.firstChild;
    if (!header || header.name !== 'TableHeader') continue;
    const delimiterRow = header.nextSibling;
    if (!delimiterRow || !isAlignmentRow(delimiterRow)) continue;

    const currentText = provisional.sliceDoc(delimiterRow.from, delimiterRow.to);
    const canonicalText = canonicalDelimiterRowText(provisional, delimiterRow);
    if (currentText !== canonicalText) {
      edits.push({ from: delimiterRow.from, to: delimiterRow.to, insert: canonicalText });
    }

    if (getNavigableRows(table).length <= 1) {
      const columnCount = rowCells(provisional, header).length;
      const insertPos = insertRowAfterPosition(header);
      if (insertPos !== null && columnCount > 0) {
        edits.push({ from: insertPos, to: insertPos, insert: '\n' + buildEmptyRowText(columnCount) });
        seedInsertPos = insertPos;
      }
    }
  }

  if (edits.length === 0) {
    return EMPTY_PLAN;
  }

  let cursorPos: number | null = null;
  if (seedInsertPos !== null) {
    // Every edit strictly before the seeded row's own (pre-edits) insertion
    // point shifts where that insertion actually lands in the final
    // document — this table's own delimiter-row rewrite included, since
    // `delimiterRow.from < seedInsertPos` always holds (`seedInsertPos` is
    // that same row's own `.to`). Edits at-or-after `seedInsertPos`
    // (this row-seed edit itself, or a later table's edits) never affect
    // it, so a plain sum over "from < seedInsertPos" is exact.
    const delta = edits
      .filter((edit) => edit.from < seedInsertPos!)
      .reduce((sum, edit) => sum + (edit.insert.length - (edit.to - edit.from)), 0);
    cursorPos = seedInsertPos + delta + 1 + emptyRowCellOffset(0);
  }

  return { edits, cursorPos };
}

/**
 * The single production entry point — one `EditorState.transactionFilter`
 * registration, wired in `buildEditorExtensions.ts` alongside
 * `orderedListStructuralNormalization()`, under the same `!readOnly`-only
 * gate (a note embed's read-only nested view already blocks every
 * doc-changing transaction, so this has nothing to do there).
 */
export function tableActivationNormalization(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) {
      return tr;
    }
    const plan = planTableActivationNormalization(tr.startState, tr.changes);
    if (plan.edits.length === 0) {
      return tr;
    }
    const spec: TransactionSpec = { changes: plan.edits as TableActivationEdit[], sequential: true };
    if (plan.cursorPos !== null) {
      return [tr, { ...spec, selection: { anchor: plan.cursorPos } }];
    }
    return [tr, spec];
  });
}
