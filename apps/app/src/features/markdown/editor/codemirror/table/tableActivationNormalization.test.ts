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

/** Types `text` one character at a time at the document's end, exactly reproducing a real human keystroke sequence rather than a single bulk insert. */
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
// established table formatting rules", regardless of how many columns
// the delimiter row had actually typed at the moment of activation.
const CANONICAL_HEADER = '| Name | Age |';
const CANONICAL_SEPARATOR = '| ---- | --- |';
const CANONICAL_BLANK_ROW = '|      |     |';
const CANONICAL_TABLE = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n${CANONICAL_BLANK_ROW}`;

describe('tableActivationNormalization — trigger point: activates on the first separator cell\'s own closing pipe', () => {
  it('does not activate while the first cell has no closing pipe yet', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| -');
    expect(state.doc.toString()).toBe('| Name | Age |\n| -');
    expect(findAllTables(state)).toHaveLength(0);
  });

  it('does not activate for a longer dash run with no closing pipe yet', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| ---');
    expect(state.doc.toString()).toBe('| Name | Age |\n| ---');
    expect(findAllTables(state)).toHaveLength(0);
  });

  it('activates the instant the first cell\'s own closing pipe is typed — before any second column content exists at all', () => {
    let state = makeState('| Name | Age |\n');
    // Exactly the task's own worked example: a 2-column header, but the
    // delimiter row so far has only ever had ONE cell typed.
    state = typeAtEnd(state, '| - |');

    expect(state.doc.toString()).toBe(CANONICAL_TABLE);
    expect(findAllTables(state)).toHaveLength(1);
  });

  it('reproduces the original bug report precisely: activates at "| --- |", one full cell earlier than a Table-node-based trigger ever could', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |');

    expect(state.doc.toString()).toBe(CANONICAL_TABLE);
    expect(findAllTables(state)).toHaveLength(1);
  });

  it('places the cursor in the first cell of the freshly-inserted empty row', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |');

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

describe('tableActivationNormalization — activation is independent of the header\'s own column count', () => {
  it.each(['-', '--', '---', '----', '------'])(
    'activates from a %s-wide first cell alone, normalizing every column (including ones never typed) to the header-matched width',
    (dashes) => {
      let state = makeState('| Name | Age |\n');
      state = typeAtEnd(state, `| ${dashes} |`);

      expect(findAllTables(state)).toHaveLength(1);
      expect(state.doc.toString()).toBe(CANONICAL_TABLE);
    }
  );

  it('activates a single-column table the same way, from its own single "| - |" cell', () => {
    let state = makeState('| Name |\n');
    state = typeAtEnd(state, '| -|');

    expect(findAllTables(state)).toHaveLength(1);
    expect(state.doc.toString()).toBe('| Name |\n| ---- |\n|      |');
  });
});

describe('tableActivationNormalization — alignment colons are preserved on the columns actually typed', () => {
  it('keeps the first column\'s own alignment marker while synthesizing the untyped second column from the header', () => {
    const state = makeState('| Name | Age |\n');
    const result = dispatchEdit(state, {
      from: state.doc.length,
      to: state.doc.length,
      insert: '| :---- |',
    });

    // Column 1: ":" + dashCount(6-2-1=3) = ":---" (total width 6,
    // matching "Name"). Column 2 was never typed at all — synthesized
    // plainly from the header, no colon.
    expect(result.doc.toString()).toBe('| Name | Age |\n| :--- | --- |\n|      |     |');
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
    state = typeAtEnd(state, '| --- |'); // activates once
    const afterActivation = state.doc.toString();
    expect(afterActivation).toBe(CANONICAL_TABLE);

    // Now edit inside the already-active table's header cell.
    const headerEnd = state.doc.line(1).text.indexOf(' |'); // just after "Name"
    state = dispatchEdit(state, { from: headerEnd, to: headerEnd, insert: 'X' });

    expect(state.doc.toString()).toBe(afterActivation.replace('Name', 'NameX'));
    expect(findAllTables(state)).toHaveLength(1);
  });

  it('does not re-trigger when adding an alignment colon to an already-active delimiter row', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |');
    expect(state.doc.toString()).toBe(CANONICAL_TABLE);

    // Insert ":" right before the first column's own dash run.
    const delimLineStart = state.doc.line(2).from;
    const colonPos = delimLineStart + 2; // "| " then the dash run starts
    state = dispatchEdit(state, { from: colonPos, to: colonPos, insert: ':' });

    // Un-renormalized (correctly — this module has no opinion once a
    // table is already active): the colon is simply inserted as raw
    // text, widening column 1 by one character rather than being
    // reconciled back down to the header-matched width.
    expect(state.doc.toString()).toBe('| Name | Age |\n| :---- | --- |\n|      |     |');
    expect(findAllTables(state)).toHaveLength(1);
  });
});

describe('tableActivationNormalization — code fences are not mistaken for tables', () => {
  it('does not activate a "| - |"-shaped line inside a fenced code block', () => {
    let state = makeState('```\n| Name | Age |\n');
    state = typeAtEnd(state, '| - |\n```');

    expect(state.doc.toString()).toBe('```\n| Name | Age |\n| - |\n```');
    expect(findAllTables(state)).toHaveLength(0);
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

  it('finds a delimiter-line candidate in the middle of a multi-line single-shot paste into an empty document', () => {
    const state = makeState('');
    const changes = state.changes({ from: 0, to: 0, insert: '| Name | Age |\n| - |\n' });
    const plan = planTableActivationNormalization(state, changes);
    expect(plan.edits.length).toBeGreaterThan(0);
  });
});
