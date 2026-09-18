import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState, type ChangeSet, type Extension, type TransactionSpec } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { markdownLanguageExtension } from '../markdownLanguage';
import { splitPipeRowCells } from './tableAlignment';
import { buildWidthMatchedRowText, findEnclosingTable, widthMatchedRowCellOffset } from './tableGeometry';

/**
 * The transaction-level counterpart to `orderedListStructuralNormalization.ts`,
 * for keeping a table's persisted Markdown source complete the moment the
 * user has committed to typing one — never merely because Lezer's `Table`
 * node happens to already recognize the row.
 *
 * **Why not just watch for a new `Table` node (this module's own earlier
 * design).** GFM's own delimiter-row grammar (`@lezer/markdown`'s
 * `delimiterLine` regex, confirmed directly against the installed source)
 * makes leading/trailing pipes optional and only requires the delimiter
 * row's *own* cell count to match the header's — so `Table` recognition
 * fires well into typing the *last* column's own cell, long after the
 * *first* cell (the one the user actually just finished) closed. Worse,
 * for a header with more than one column, a delimiter row with *fewer*
 * cells than the header (exactly the moment right after the first cell's
 * own closing `|` — the trigger this module now targets) **never**
 * parses as a `Table` node at all (confirmed empirically: Lezer leaves
 * both lines as one plain `Paragraph`, no `TableHeader`/`TableDelimiter`
 * classification whatsoever) — so a `Table`-node-based trigger could
 * never fire at the moment this task requires even in principle. Per
 * this task's own instruction not to lean on `Table`-node recognition,
 * and per this finding that the tree offers *no* structure to read at
 * the moment that matters, detection here is necessarily a plain textual
 * scan over the two lines involved — the "cleanest place" the tree
 * inspection this task asked for actually turned up.
 *
 * **Trigger, precisely**: on the line the user just edited, does the text
 * *from the start of the line* already form one complete delimiter cell
 * — `\|?\s*:?-+:?\s*\|` (an optional leading pipe, one valid GFM
 * alignment/dash cell, then a *required* closing pipe)? If so, and the
 * line directly above looks like a plausible table header (non-blank,
 * contains a `|`), and this exact line wasn't already part of a
 * recognized `Table` before this edit (the same `findEnclosingTable`
 * re-trigger guard this module's earlier design already established —
 * still correct and still needed for the case where the table *has*
 * since become a genuine multi-column `Table` and the user is now
 * editing inside it, e.g. adding an alignment colon), this line has just
 * become the table's own delimiter row. Deliberately independent of how
 * many columns the header actually declares or how many the user has
 * typed so far in *this* row — completing column 1's own cell is enough,
 * matching this task's own worked example (a 2-column header activated
 * from a 1-cell `"| - |"` delimiter row).
 *
 * **On activation**: the delimiter row is rewritten to
 * `"| c1 | c2 | ... |"`, one cell per header column — not per column
 * actually typed so far — each dash count normalized to match its own
 * header cell's width ("the established table formatting rules",
 * `computeColumnWidths`'s own doc comment), any alignment colon the user
 * did type preserved. If the line immediately below doesn't already look
 * like a real data row, one blank row is appended, each cell padded to
 * that same header-matched width (`buildWidthMatchedRowText`), and the
 * selection lands in its first cell — mirroring `tableCellNavigation.ts`'s
 * own `enterCommand` shape, just width-matched rather than uniform
 * single-space (correct for that call site, not this one).
 *
 * A `FencedCode`/`CodeBlock` guard excludes the one case textual
 * scanning alone can't tell apart from a real table: a `"| - |"`-shaped
 * line typed inside a code block. Deliberately does not attempt
 * blockquote/list-nested tables — no other construct in this codebase
 * supports tables in those contexts either.
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

/** One complete GFM delimiter cell, from the very start of the line: an optional leading pipe, a valid `:?-+:?` alignment/dash cell, then a *required* closing pipe — exactly "the user has finished typing the first separator cell" (this module's own trigger condition), independent of anything after that closing pipe. */
const FIRST_CELL_COMPLETE = /^\s*\|?\s*:?-+:?\s*\|/;

/** Non-blank and contains a `|` — the minimal textual signal a line is plausibly meant as a table row (header or data), used both to recognize a candidate header line and to detect an already-present data row below a freshly-completing delimiter row. Deliberately not column-count-aware (this module's whole point is to activate before any column-count match exists). */
function isPlausibleTableLine(text: string): boolean {
  return text.trim().length > 0 && text.includes('|');
}

const EXCLUDED_BLOCK_NODES = new Set(['FencedCode', 'CodeBlock']);

/** Whether `pos` sits inside a fenced/indented code block — the one context plain textual line-scanning can't otherwise tell apart from a real table candidate. */
function isInsideExcludedBlock(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (EXCLUDED_BLOCK_NODES.has(node.name)) {
      return true;
    }
  }
  return false;
}

/**
 * Each column's target **total gap width** — padding included, the same
 * unit `padCellContent`/`buildWidthMatchedRowText` already work in — "the
 * established table formatting rules": a column's width matches its own
 * header cell's own gap width (`" Name "` is 6; `Math.max(1, text.length)
 * + 2` reconstructs that from the trimmed header text alone), the same
 * convention this codebase's own Markdown formatting already follows
 * elsewhere (a column's rendered width is set by its widest cell — for a
 * table that has only just activated, with no data rows yet, that's the
 * header). Reads the header line's own raw text via `splitPipeRowCells`
 * (plain string-splitting) rather than the tree-based `rowCells` —
 * deliberately: at the exact moment this module needs to read it, Lezer
 * has not yet classified anything as a `TableHeader` node at all (see
 * this module's own header comment).
 */
function computeColumnWidths(headerLineText: string): number[] {
  return splitPipeRowCells(headerLineText).map((cell) => Math.max(1, cell.length) + 2);
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
 * realistic header width triggers). One cell is emitted **per header
 * column**, not per column the delimiter row happens to have typed so
 * far — a delimiter row with fewer cells than the header (this module's
 * entire reason to exist) has its missing trailing columns synthesized
 * from scratch (`raw ?? ''`, no colons, header-matched dash count).
 */
function canonicalDelimiterRowText(delimiterRowText: string, widths: readonly number[]): string {
  const rawCells = splitPipeRowCells(delimiterRowText);
  const cells = widths.map((width, i) => {
    const raw = rawCells[i] ?? '';
    const left = raw.startsWith(':');
    const right = raw.endsWith(':');
    const colonCount = (left ? 1 : 0) + (right ? 1 : 0);
    const dashCount = Math.max(1, width - 2 - colonCount);
    return (left ? ':' : '') + '-'.repeat(dashCount) + (right ? ':' : '');
  });
  return '| ' + cells.join(' | ') + ' |';
}

interface ActivationCandidate {
  readonly delimLineFrom: number;
  readonly delimLineTo: number;
  readonly delimLineText: string;
  readonly headerLineText: string;
  readonly hasExistingDataRow: boolean;
}

/**
 * Every line this transaction just edited that has, as of `provisional`
 * (post-edit), just completed its own first delimiter cell, sitting
 * directly below a plausible header line.
 *
 * A change's own *edited range*, not just its two boundary points, is
 * what must be scanned: for a single-point insert spanning several new
 * lines (a paste, most notably into an otherwise-empty document, or
 * anywhere the pasted delimiter line isn't the paste's own first or last
 * line), `changes.mapPos` of the collapsed `fromA === toA` boundary can
 * only ever land at the *very start or very end* of the newly-inserted
 * text — `provisional.doc.lineAt` of either edge lands on the pasted
 * content's first or last line, never a delimiter line sitting somewhere
 * in the *middle* of a multi-line paste (confirmed directly: a one-shot
 * paste of a 3-line table from an empty document was silently missed
 * entirely under a boundary-only scan). Walking every line between the
 * mapped start and end of the *edited range* fixes this uniformly for
 * both a single keystroke (one line, same behavior as before) and a
 * multi-line paste (every candidate line actually gets examined).
 *
 * The re-trigger guard — was this change already inside a recognized
 * `Table` before it happened — checks `fromA`/`toA` directly, in
 * `startState`'s own coordinates (no backward-mapping through `changes`
 * ever needed, matching `orderedListStructuralNormalization.ts`'s own
 * `collectStructuralCandidates` pattern): if *either* edited boundary
 * already sat inside an existing `Table`, this edit is happening inside
 * an already-active table (another header keystroke, an alignment-colon
 * change on the delimiter row itself) and the whole edited range is
 * skipped, not just the touched line — this module has no opinion about
 * any table once it has already activated.
 */
function findActivationCandidates(
  startState: EditorState,
  provisional: EditorState,
  changes: ChangeSet
): ActivationCandidate[] {
  const found: ActivationCandidate[] = [];
  const seen = new Set<number>();

  changes.iterChanges((fromA, toA) => {
    if (findEnclosingTable(startState, fromA) || findEnclosingTable(startState, toA)) {
      return;
    }

    const newFrom = changes.mapPos(fromA, -1);
    const newTo = changes.mapPos(toA, 1);
    const firstLineNumber = provisional.doc.lineAt(newFrom).number;
    const lastLineNumber = provisional.doc.lineAt(newTo).number;

    for (let lineNumber = firstLineNumber; lineNumber <= lastLineNumber; lineNumber++) {
      const delimLine = provisional.doc.line(lineNumber);
      if (seen.has(delimLine.from)) continue;
      if (!FIRST_CELL_COMPLETE.test(delimLine.text)) continue;
      if (delimLine.number <= 1) continue;

      const headerLine = provisional.doc.line(delimLine.number - 1);
      if (!isPlausibleTableLine(headerLine.text)) continue;
      if (isInsideExcludedBlock(provisional, headerLine.from)) continue;

      seen.add(delimLine.from);
      const nextLine = delimLine.number < provisional.doc.lines ? provisional.doc.line(delimLine.number + 1) : null;
      found.push({
        delimLineFrom: delimLine.from,
        delimLineTo: delimLine.to,
        delimLineText: delimLine.text,
        headerLineText: headerLine.text,
        hasExistingDataRow: nextLine !== null && isPlausibleTableLine(nextLine.text),
      });
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

  const candidates = findActivationCandidates(state, provisional, changes);
  if (candidates.length === 0) {
    return EMPTY_PLAN;
  }

  const edits: TableActivationEdit[] = [];
  let seedInsertPos: number | null = null;
  let seedWidths: number[] | null = null;

  for (const candidate of candidates) {
    const widths = computeColumnWidths(candidate.headerLineText);
    const canonicalText = canonicalDelimiterRowText(candidate.delimLineText, widths);
    if (candidate.delimLineText !== canonicalText) {
      edits.push({ from: candidate.delimLineFrom, to: candidate.delimLineTo, insert: canonicalText });
    }

    if (!candidate.hasExistingDataRow && widths.length > 0) {
      edits.push({
        from: candidate.delimLineTo,
        to: candidate.delimLineTo,
        insert: '\n' + buildWidthMatchedRowText(widths),
      });
      seedInsertPos = candidate.delimLineTo;
      seedWidths = widths;
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
    // `delimLineFrom <= delimLineTo === seedInsertPos` always holds.
    // Edits at-or-after `seedInsertPos` (this row-seed edit itself, or a
    // later candidate's edits) never affect it, so a plain sum over
    // "from < seedInsertPos" is exact.
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
