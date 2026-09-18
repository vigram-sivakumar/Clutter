import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAllTables, findEnclosingTable } from './tableGeometry';
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
// Every test below activates a table sitting at the very end of the
// document, so a trailing "\n" is always created too — a real, editable
// blank line for the root cursor to land on below the table (the whole
// point of this file's own cursor-safety block further down).
const CANONICAL_TABLE = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n${CANONICAL_BLANK_ROW}\n`;

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

  it('places the cursor on a real editable line below the table, never inside it', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |');

    expect(state.doc.toString()).toBe(CANONICAL_TABLE);
    // The freshly-created blank line below the table (this document had
    // nothing after the table, so one was created) — the very last,
    // empty line.
    expect(state.selection.main.head).toBe(state.doc.length);
    expect(state.selection.main.empty).toBe(true);
    expect(findEnclosingTable(state, state.selection.main.head)).toBeNull();
  });
});

describe('tableActivationNormalization — cursor safety: the root selection must never land inside the table\'s own range', () => {
  it('the invariant, directly: selection never resolves inside findEnclosingTable\'s own range after activation', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |');

    const table = findAllTables(state)[0]!;
    const head = state.selection.main.head;
    expect(head < table.from || head >= table.to).toBe(true);
    expect(findEnclosingTable(state, head)).toBeNull();
  });

  it('creates a new blank line below the table when nothing already follows it', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |');

    // Exactly one blank trailing line was added — not two, not zero.
    expect(state.doc.toString()).toBe(CANONICAL_TABLE);
    expect(state.doc.toString().endsWith(`${CANONICAL_BLANK_ROW}\n`)).toBe(true);
  });

  it('reuses an already-existing following blank line instead of creating a redundant extra one', () => {
    // A genuine blank line already separates where the table will
    // activate from more content below — a blank line always ends the
    // table's own leaf, so this blank line is real, pre-existing,
    // table-external content, not something this fix needs to create.
    const state = makeState('| Name | Age |\n| -\n\nSomething else.');
    const closePos = state.doc.line(2).to; // end of the still-unclosed "| -"
    const activated = dispatchEdit(state, { from: closePos, to: closePos, insert: '|' }); // "| -" → "| -|"

    expect(activated.doc.toString()).toBe(
      '| Name | Age |\n| ---- | --- |\n|      |     |\n\nSomething else.'
    );
    // Cursor lands at the start of the pre-existing blank line (line 4)
    // — not a second, redundant blank line created after it.
    const blankLine = activated.doc.line(4);
    expect(blankLine.text).toBe('');
    expect(activated.selection.main.head).toBe(blankLine.from);
    expect(findEnclosingTable(activated, activated.selection.main.head)).toBeNull();
  });

  it('Enter at the reported bug position cannot insert a line inside or before the table', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |'); // activates; selection now below the table
    const beforeEnter = state.doc.toString();

    // A plain Enter at the current (post-activation) selection — the
    // exact interaction the bug report singles out.
    state = dispatchEdit(state, { from: state.selection.main.head, to: state.selection.main.head, insert: '\n' });

    // The table's own three lines are completely unchanged; only a new
    // blank line was added *after* everything, where the cursor already
    // safely was.
    expect(state.doc.toString()).toBe(beforeEnter + '\n');
    expect(findAllTables(state)).toHaveLength(1);
    const table = findAllTables(state)[0]!;
    expect(state.doc.sliceString(table.from, table.to)).toBe(CANONICAL_TABLE.trimEnd());
  });

  it('typing at the reported bug position cannot create stray text around the table', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |');

    state = typeAtEnd(state, 'Hello world');

    // The typed text landed entirely on the safe line below the table's
    // own three lines, which are byte-for-byte unchanged — an exact
    // string match here proves no character was spliced into them. (Prior
    // to tableLazyAbsorptionGuard.ts, a weaker "does the table's own
    // .to-bounded slice still match" check would have been a false
    // negative: @lezer/markdown's own Table extension used to grow a
    // Table node's `.to` to absorb an immediately-following non-blank,
    // non-pipe line like "Hello world" — that's now fixed, so "Hello
    // world" is ordinary paragraph text below the table, unrelated to
    // this invariant either way.)
    expect(state.doc.toString()).toBe(CANONICAL_TABLE + 'Hello world');
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
    expect(state.doc.toString()).toBe('| Name |\n| ---- |\n|      |\n');
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
    expect(result.doc.toString()).toBe('| Name | Age |\n| :--- | --- |\n|      |     |\n');
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
    expect(state.doc.toString()).toBe('| Name | Age |\n| :---- | --- |\n|      |     |\n');
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
