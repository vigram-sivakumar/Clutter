import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAllTables } from './tableGeometry';
import { planTableActivationNormalization, tableActivationNormalization } from './tableActivationNormalization';

/**
 * The real editor's own extension pairing for anything table-related:
 * `markdownLanguageExtension()` (GFM `Table` grammar) alongside this
 * module's own filter — matching `orderedListStructuralNormalization.test.ts`'s
 * `makeState` convention of driving the real production extension stack,
 * not a reduced stand-in.
 */
function makeState(doc: string, pos = 0): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension(), tableActivationNormalization()],
  });
}

/** Dispatches one raw `{from,to,insert}` edit through the real filter chain — the same path a keystroke or paste ultimately takes. */
function dispatchEdit(state: EditorState, spec: { from: number; to: number; insert?: string }): EditorState {
  let dispatched: Transaction | null = null;
  const view = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
  view.dispatch(state.update({ changes: spec }));
  if (!dispatched) throw new Error('nothing dispatched');
  return (dispatched as Transaction).state;
}

/** Types `text` one character at a time at the document's end, exactly reproducing a real human keystroke sequence (the reported repro) rather than a single bulk insert. */
function typeAtEnd(state: EditorState, text: string): EditorState {
  let s = state;
  for (const ch of text) {
    s = dispatchEdit(s, { from: s.doc.length, to: s.doc.length, insert: ch });
  }
  return s;
}

// Header "Name" (4 chars) / "Age" (3 chars) → canonical target widths are
// fixed throughout this file: column 1 always normalizes to 4 dashes
// (matching "Name"), column 2 to 3 dashes (matching "Age") — "the
// established table formatting rules" (computeColumnWidths's own doc
// comment), regardless of what separator width was actually typed.
const CANONICAL_HEADER = '| Name | Age |';
const CANONICAL_SEPARATOR = '| ---- | --- |';
const CANONICAL_BLANK_ROW = '|      |     |';
const CANONICAL_TABLE = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n${CANONICAL_BLANK_ROW}`;

describe('tableActivationNormalization — trigger point', () => {
  it('does not touch the source while the delimiter row is still an invalid/mismatched column count', () => {
    // Header has 2 columns; only one delimiter cell typed so far — GFM's
    // own column-count check means this never parses as a Table yet.
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| ---');
    expect(state.doc.toString()).toBe('| Name | Age |\n| ---');
    expect(findAllTables(state)).toHaveLength(0);
  });

  it('normalizes the instant the delimiter row becomes a syntactically valid Table (reported repro: incomplete second separator, no trailing pipe, no body row)', () => {
    let state = makeState('| Name | Age |\n');
    // Reproduces the bug report keystroke-by-keystroke. Precisely, per
    // GFM's own trailing-pipe-optional delimiter grammar, the row already
    // becomes a valid 2-column Table at "| --- | -" — the *first* dash of
    // the second column, one keystroke earlier than the report's own
    // "soon as the second `---` is typed" phrasing suggests (confirmed by
    // the dedicated trigger-point test below). Typing stops there: any
    // further keystroke would land wherever the cursor relocated to after
    // activation (the new row this fix seeds) rather than back in column
    // 2 — a caret/focus consequence explicitly out of this task's scope.
    state = typeAtEnd(state, '| --- | -');

    expect(state.doc.toString()).toBe(CANONICAL_TABLE);
    expect(findAllTables(state)).toHaveLength(1);
  });

  it('places the cursor in the first cell of the freshly-inserted empty row', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- | -');

    const lines = state.doc.toString().split('\n');
    const lastLine = lines[lines.length - 1]!;
    expect(lastLine).toBe(CANONICAL_BLANK_ROW);
    const lastLineStart = state.doc.length - lastLine.length;
    // "|      |     |" — first cell's content-start position sits right
    // after its own single leading padding space, i.e. local offset 2
    // ("|" then one space).
    expect(state.selection.main.head).toBe(lastLineStart + 2);
    expect(state.selection.main.empty).toBe(true);
  });
});

describe('tableActivationNormalization — separator width follows the header-matched formatting rule, not what was typed', () => {
  // Single-shot insertion (the same path a paste or programmatic insert
  // takes) — deliberately not `typeAtEnd`'s keystroke-by-keystroke
  // simulation here: for a separator wider than one dash, GFM's own
  // trailing-pipe-optional grammar means activation already fires at the
  // *first* dash of the final column (see the dedicated trigger-point
  // test below), so simulating further individual keystrokes after that
  // point would be typing into wherever the now-relocated cursor sits,
  // not into the old cell — a caret/focus consequence, not a
  // normalization-correctness question, and explicitly out of this
  // task's scope. This block only asserts the eventual, steady-state
  // document is canonical regardless of what width was typed.
  it.each(['-', '--', '---', '----', '------'])(
    'normalizes activation from a %s-wide separator to the header-matched canonical width',
    (dashes) => {
      const state = makeState('| Name | Age |\n');
      const result = dispatchEdit(state, {
        from: state.doc.length,
        to: state.doc.length,
        insert: `| ${dashes} | ${dashes}`,
      });

      expect(findAllTables(result)).toHaveLength(1);
      expect(result.doc.toString()).toBe(CANONICAL_TABLE);
    }
  );

  it('activates at the first dash of the final column, and still normalizes to the header-matched width regardless of the single dash actually typed', () => {
    // Documents the actual trigger point precisely: with the first column
    // already a valid multi-dash cell, one single dash in the second
    // column is already enough for both `delimiterLine` and the
    // column-count check to pass — and the eventual output is the same
    // canonical width the table would reach from any other input.
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| ---- | ');
    expect(findAllTables(state)).toHaveLength(0);

    state = typeAtEnd(state, '-');
    expect(findAllTables(state)).toHaveLength(1);
    expect(state.doc.toString()).toBe(CANONICAL_TABLE);
  });

  it('activates a single-column table from a single "| - |" separator, normalized to its own header width', () => {
    // A single-column delimiter row needs its own closing pipe to form
    // even one complete `delimiterLine` group at all (there is no second
    // column to supply the "trailing pipe optional" fallback this file's
    // 2-column tests otherwise rely on) — activation here fires at "| -|".
    let state = makeState('| Name |\n');
    state = typeAtEnd(state, '| -|');

    expect(findAllTables(state)).toHaveLength(1);
    expect(state.doc.toString()).toBe('| Name |\n| ---- |\n|      |');
  });
});

describe('tableActivationNormalization — alignment colons are preserved; dash count is not', () => {
  it("keeps each column's own alignment markers while normalizing dash count to the header-matched width", () => {
    const state = makeState('| Name | Age |\n');
    const result = dispatchEdit(state, {
      from: state.doc.length,
      to: state.doc.length,
      insert: '| :---- | --:',
    });

    // Column 1: ":" + dashCount(4-1=3) = ":---" (still total width 6,
    // matching "Name"). Column 2: dashCount(3-1=2) + ":" = "--:"
    // (unchanged here only because it already happened to match).
    expect(result.doc.toString()).toBe('| Name | Age |\n| :--- | --: |\n|      |     |');
  });
});

describe('tableActivationNormalization — already-complete input is left alone', () => {
  it('does not insert a body row when a full, already-canonical table (with data) is pasted in one transaction', () => {
    const state = makeState('');
    const pasted = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    const result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });

    expect(result.doc.toString()).toBe(pasted);
  });

  it('fixes a missing trailing pipe and normalizes separator width on paste even when data rows already exist, without inserting an extra blank row', () => {
    const state = makeState('');
    const pasted = '| Name | Age |\n| --- | ---\n| Bob | 30 |';
    const result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });

    expect(result.doc.toString()).toBe(`${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`);
  });

  it('is idempotent: pasting text already in canonical (header-matched width, blank-row-present) form makes no further edits', () => {
    const state = makeState('Some text\n\n');
    // Single-letter headers ("A"/"B") legitimately produce a 1-dash
    // separator under the header-matching rule, so this fixture's own
    // "- | -" and single-space blank cells are already fully canonical.
    const canonical = '| A | B |\n| - | - |\n|   |   |';
    const result = dispatchEdit(state, { from: state.doc.length, to: state.doc.length, insert: canonical });

    expect(result.doc.toString()).toBe('Some text\n\n' + canonical);
  });
});

describe('tableActivationNormalization — only fires once per table, not on every subsequent edit', () => {
  it('does not re-trigger (or move the cursor) when editing inside an already-active table', () => {
    let state = makeState('| Name | Age |\n');
    // Stops exactly at the activation trigger point (see this file's own
    // "trigger point" block) — typing further via a blind end-of-doc
    // append would land in the freshly-seeded row the cursor relocates
    // to, not back in the original delimiter row.
    state = typeAtEnd(state, '| --- | -'); // activates once
    const afterActivation = state.doc.toString();
    expect(afterActivation).toBe(CANONICAL_TABLE);

    // Now edit inside the already-active table's header cell.
    const headerEnd = state.doc.line(1).text.indexOf(' |'); // just after "Name"
    state = dispatchEdit(state, { from: headerEnd, to: headerEnd, insert: 'X' });

    expect(state.doc.toString()).toBe(afterActivation.replace('Name', 'NameX'));
    // No second blank row appeared, and the (now header-mismatched, but
    // untouched-post-activation) separator width was not re-normalized.
    expect(findAllTables(state)).toHaveLength(1);
  });
});

describe('planTableActivationNormalization — pure function', () => {
  it('returns no edits for a transaction with no doc change candidates', () => {
    const state = makeState(CANONICAL_TABLE);
    const changes = state.changes({ from: 0, to: 0, insert: '' });
    const plan = planTableActivationNormalization(state, changes);
    expect(plan.edits).toEqual([]);
    expect(plan.cursorPos).toBeNull();
  });
});
