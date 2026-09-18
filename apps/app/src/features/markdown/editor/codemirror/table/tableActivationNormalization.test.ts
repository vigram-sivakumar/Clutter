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

describe('tableActivationNormalization — trigger point', () => {
  it('does not touch the source while the delimiter row is still an invalid/mismatched column count', () => {
    // Header has 2 columns; only one delimiter cell typed so far — GFM's
    // own column-count check means this never parses as a Table yet.
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| ---');
    expect(state.doc.toString()).toBe('| Name | Age |\n| ---');
    expect(findAllTables(state)).toHaveLength(0);
  });

  it('normalizes the instant the delimiter row becomes a syntactically valid Table (reported repro: no trailing pipe, no body row)', () => {
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

    expect(state.doc.toString()).toBe('| Name | Age |\n| --- | - |\n| | |');
    expect(findAllTables(state)).toHaveLength(1);
  });

  it('places the cursor in the first cell of the freshly-inserted empty row', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- | -');

    const lines = state.doc.toString().split('\n');
    const lastLine = lines[lines.length - 1]!;
    expect(lastLine).toBe('| | |');
    const lastLineStart = state.doc.length - lastLine.length;
    // "| | |" — first cell's single-space gap sits right after the
    // opening pipe, i.e. local offset 1.
    expect(state.selection.main.head).toBe(lastLineStart + 1);
    expect(state.selection.main.empty).toBe(true);
  });
});

describe('tableActivationNormalization — separator width is irrelevant to the trigger', () => {
  // Single-shot insertion (the same path a paste or programmatic insert
  // takes) — deliberately not `typeAtEnd`'s keystroke-by-keystroke
  // simulation here: for a separator wider than one dash, GFM's own
  // trailing-pipe-optional grammar means activation already fires at the
  // *first* dash of the final column (see the next `describe` block), so
  // simulating further individual keystrokes after that point would be
  // typing into wherever the now-relocated cursor sits, not into the old
  // cell — a caret/focus consequence, not a normalization-correctness
  // question, and explicitly out of this task's scope. This block only
  // asserts the eventual, steady-state document is canonical regardless
  // of width.
  it.each(['-', '--', '---', '----', '------'])('normalizes a %s-wide separator to canonical form', (dashes) => {
    const state = makeState('| Name | Age |\n');
    const result = dispatchEdit(state, {
      from: state.doc.length,
      to: state.doc.length,
      insert: `| ${dashes} | ${dashes}`,
    });

    expect(findAllTables(result)).toHaveLength(1);
    expect(result.doc.toString()).toBe(`| Name | Age |\n| ${dashes} | ${dashes} |\n| | |`);
  });

  it('activates at the first dash of the final column, not once that column\'s full width is typed', () => {
    // Documents the actual trigger point precisely: with the first column
    // already a valid multi-dash cell, one single dash in the second
    // column is already enough for both `delimiterLine` and the
    // column-count check to pass.
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| ---- | ');
    expect(findAllTables(state)).toHaveLength(0);

    state = typeAtEnd(state, '-');
    expect(findAllTables(state)).toHaveLength(1);
    expect(state.doc.toString()).toBe('| Name | Age |\n| ---- | - |\n| | |');
  });
});

describe('tableActivationNormalization — preserves what the user actually typed', () => {
  it('keeps each column\'s own dash count/alignment markers, never inventing a uniform width', () => {
    const state = makeState('| Name | Age |\n');
    const result = dispatchEdit(state, {
      from: state.doc.length,
      to: state.doc.length,
      insert: '| :---- | --:',
    });

    expect(result.doc.toString()).toBe('| Name | Age |\n| :---- | --: |\n| | |');
  });
});

describe('tableActivationNormalization — already-complete input is left alone', () => {
  it('does not insert a body row when a full table (with data) is pasted in one transaction', () => {
    const state = makeState('');
    const pasted = '| Name | Age |\n| --- | --- |\n| Bob | 30 |';
    const result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });

    expect(result.doc.toString()).toBe(pasted);
  });

  it('fixes a missing trailing pipe on paste even when data rows already exist, without inserting an extra blank row', () => {
    const state = makeState('');
    const pasted = '| Name | Age |\n| --- | ---\n| Bob | 30 |';
    const result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });

    expect(result.doc.toString()).toBe('| Name | Age |\n| --- | --- |\n| Bob | 30 |');
  });

  it('is idempotent: pasting text already in canonical (trailing-pipe, blank-row-present) form makes no further edits', () => {
    const state = makeState('Some text\n\n');
    const canonical = '| A | B |\n| - | - |\n| | |';
    const result = dispatchEdit(state, { from: state.doc.length, to: state.doc.length, insert: canonical });

    expect(result.doc.toString()).toBe('Some text\n\n' + canonical);
  });
});

describe('tableActivationNormalization — only fires once per table, not on every subsequent edit', () => {
  it('does not re-trigger (or move the cursor) when editing inside an already-active table', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- | ---'); // activates once
    const afterActivation = state.doc.toString();

    // Now edit inside the already-active table's header cell.
    const headerEnd = state.doc.line(1).text.indexOf(' |'); // just after "Name"
    state = dispatchEdit(state, { from: headerEnd, to: headerEnd, insert: 'X' });

    expect(state.doc.toString()).toBe(afterActivation.replace('Name', 'NameX'));
    // No second blank row appeared and no extra normalization ran.
    expect(findAllTables(state)).toHaveLength(1);
  });
});

describe('planTableActivationNormalization — pure function', () => {
  it('returns no edits for a transaction with no doc change candidates', () => {
    const state = makeState('| Name | Age |\n| --- | --- |\n| | |');
    const changes = state.changes({ from: 0, to: 0, insert: '' });
    const plan = planTableActivationNormalization(state, changes);
    expect(plan.edits).toEqual([]);
    expect(plan.cursorPos).toBeNull();
  });
});
