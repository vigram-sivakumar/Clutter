import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, type ChangeSet, type Extension, type TransactionSpec } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { markdownLanguageExtension } from '../markdownLanguage';
import { splitDelimiterRowCells } from './tableAlignment';
import {
  buildWidthMatchedRowText,
  findEnclosingTable,
  getNavigableRows,
  insertRowAfterPosition,
  isAlignmentRow,
  widthMatchedRowCellOffset,
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
 * 1. **Delimiter-row completion** — the row is rewritten to
 *    `"| c1 | c2 | ... |"`, each column's dash count normalized to match
 *    its own header cell's width — "the established table formatting
 *    rules" (`computeColumnWidths`'s own doc comment) — while any
 *    alignment colon actually typed (`:left`, `right:`, `:center:`) is
 *    preserved. Width normalization here *supersedes* this module's own
 *    earlier, narrower decision to preserve exactly whatever dash count
 *    was typed — that covered *whether* to touch width at all; the
 *    header-matching rule is the follow-up decision on what the
 *    normalized width actually is.
 * 2. **First-row seeding** — only when the table has *zero* navigable
 *    body rows yet (a brand-new table, exactly the reported scenario),
 *    one blank row is appended — each of its cells padded out to that
 *    same header-matched column width via `buildWidthMatchedRowText`, so
 *    the seeded row lines up under the header/separator exactly — and the
 *    selection is placed in its first cell, mirroring
 *    `tableCellNavigation.ts`'s own `enterCommand` shape (Enter-in-the-
 *    header already does the analogous construction on an explicit
 *    keypress, just with `buildEmptyRowText`'s uniform single-space
 *    cells, correct for that call site — not this one, which needs each
 *    column's own already-established width). A paste of an already-
 *    complete table (real data rows already present) is left untouched.
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
 * Each column's target **total gap width** — padding included, the same
 * unit `padCellContent`/`buildWidthMatchedRowText` already work in — "the
 * established table formatting rules": a column's width matches its own
 * header cell's own gap width (`" Name "` is 6; `Math.max(1, text.length)
 * + 2` reconstructs that from the trimmed header text alone), the same
 * convention this codebase's own Markdown formatting already follows
 * elsewhere (a column's rendered width is set by its widest cell — for a
 * table that has only just activated, with no data rows yet, that's the
 * header). Supersedes this module's own earlier, narrower "preserve
 * exactly the dash count the user typed, never invent a width" decision
 * (see this file's own git history / `docs/editor-architecture-decisions.md`)
 * — that decision covered *whether* to normalize width at all; this is
 * the follow-up product decision on *what* the normalized width should be.
 */
function computeColumnWidths(state: EditorState, header: SyntaxNode): number[] {
  return rowCells(state, header).map((cell) => Math.max(1, cell.text.length) + 2);
}

/**
 * `"| c1 | c2 | ... |"`, each column's separator cell rebuilt to its
 * header-matched `widths[i]` (a *total gap* width — see
 * `computeColumnWidths`), preserving whatever alignment colons were
 * actually typed (`:left`, `right:`, `:center:`) — a colon counts against
 * its own column's target width alongside the row template's own
 * mandatory single leading/trailing space (`dashCount = max(1, width - 2
 * - colonCount)`), so total cell width still equals `widths[i]` in the
 * common case; only clamped wider when `width` is too small to fit even
 * one dash alongside the colons actually present (an edge case no
 * realistic header width triggers).
 */
function canonicalDelimiterRowText(delimiterRowText: string, widths: readonly number[]): string {
  const rawCells = splitDelimiterRowCells(delimiterRowText);
  const cells = rawCells.map((raw, i) => {
    const left = raw.startsWith(':');
    const right = raw.endsWith(':');
    const colonCount = (left ? 1 : 0) + (right ? 1 : 0);
    const dashCount = Math.max(1, (widths[i] ?? 3) - 2 - colonCount);
    return (left ? ':' : '') + '-'.repeat(dashCount) + (right ? ':' : '');
  });
  return '| ' + cells.join(' | ') + ' |';
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
  let seedWidths: number[] | null = null;

  for (const table of tables) {
    const header = table.firstChild;
    if (!header || header.name !== 'TableHeader') continue;
    const delimiterRow = header.nextSibling;
    if (!delimiterRow || !isAlignmentRow(delimiterRow)) continue;

    const widths = computeColumnWidths(provisional, header);
    const currentText = provisional.sliceDoc(delimiterRow.from, delimiterRow.to);
    const canonicalText = canonicalDelimiterRowText(currentText, widths);
    if (currentText !== canonicalText) {
      edits.push({ from: delimiterRow.from, to: delimiterRow.to, insert: canonicalText });
    }

    if (getNavigableRows(table).length <= 1) {
      const insertPos = insertRowAfterPosition(header);
      if (insertPos !== null && widths.length > 0) {
        edits.push({ from: insertPos, to: insertPos, insert: '\n' + buildWidthMatchedRowText(widths) });
        seedInsertPos = insertPos;
        seedWidths = widths;
      }
    }
  }

  if (edits.length === 0) {
    return EMPTY_PLAN;
  }

  let cursorPos: number | null = null;
  if (seedInsertPos !== null && seedWidths !== null) {
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
    cursorPos = seedInsertPos + delta + 1 + widthMatchedRowCellOffset(seedWidths, 0);
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
