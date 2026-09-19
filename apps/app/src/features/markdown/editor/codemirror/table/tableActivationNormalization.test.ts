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

/**
 * Dispatches one raw `{from,to,insert}` edit through the real filter
 * chain — the same path a keystroke or paste ultimately takes. Sets an
 * explicit resulting selection right after the inserted text — matching
 * every real typing/paste command's own behavior (`state.update()` with
 * no selection of its own would instead just map whatever the *previous*
 * selection happened to be through the change, which no real keystroke
 * or paste command ever actually leaves to chance) — so a filter's own
 * cursor-safety override (this file's whole subject) has a realistic,
 * pre-filter selection to correct in the first place.
 */
function dispatchEdit(state: EditorState, spec: { from: number; to: number; insert?: string }): EditorState {
  let dispatched: Transaction | null = null;
  const view = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
  view.dispatch(state.update({ changes: spec, selection: { anchor: spec.from + (spec.insert?.length ?? 0) } }));
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
  // Every fixture below pastes a table with nothing after it — the table
  // ends the document. Per the terminal-table safety guarantee (this
  // module's own "General terminal-table guarantee" section), that is
  // never actually "complete": with no real line following it, the root
  // caret's own natural end-of-document position sits at the table's
  // trailing boundary, which CM6 can only render as a stray full-height
  // caret spanning the widget (confirmed live: this is the exact defect
  // this guarantee exists to prevent). "Left alone" here means no *row*
  // is synthesized and no table content is rewritten beyond what's
  // already needed — not that the document goes completely untouched;
  // exactly one trailing `\n` is still appended.

  it('does not insert a body row when a full, already-canonical table (with data) is pasted in one transaction — still gets its trailing safety line', () => {
    const state = makeState('');
    const pasted = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    const result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });

    expect(result.doc.toString()).toBe(pasted + '\n');
  });

  it('fixes a missing trailing pipe and normalizes separator width on paste even when data rows already exist, without inserting an extra blank row', () => {
    const state = makeState('');
    const pasted = '| Name | Age |\n| --- | ---\n| Bob | 30 |';
    const result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });

    expect(result.doc.toString()).toBe(`${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |` + '\n');
  });

  it('is idempotent on the table\'s own content: pasting text already in canonical (header-matched width, blank-row-present) form rewrites nothing but still appends the trailing safety line when the table ends the document', () => {
    const state = makeState('Some text\n\n');
    // Single-letter headers ("A"/"B") legitimately produce a 1-dash
    // separator under the header-matching rule, so this fixture's own
    // "- | -" and single-space blank cells are already fully canonical.
    const canonical = '| A | B |\n| - | - |\n|   |   |';
    const result = dispatchEdit(state, { from: state.doc.length, to: state.doc.length, insert: canonical });

    expect(result.doc.toString()).toBe('Some text\n\n' + canonical + '\n');
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
    const plan = planTableActivationNormalization(state, changes, 0);
    expect(plan.edits).toEqual([]);
    expect(plan.cursorPos).toBeNull();
  });

  it('finds a delimiter-line candidate in the middle of a multi-line single-shot paste into an empty document', () => {
    const state = makeState('');
    const changes = state.changes({ from: 0, to: 0, insert: '| Name | Age |\n| - |\n' });
    const plan = planTableActivationNormalization(state, changes, changes.newLength);
    expect(plan.edits.length).toBeGreaterThan(0);
  });
});

/**
 * The terminal-table safety guarantee, on its own: a table must never be
 * left as the document's own final content with nothing real after it —
 * confirmed live (browser pane, real WKWebView reproduction via a user
 * report) to otherwise leave the root CM6 selection sitting at the
 * table's own trailing boundary, rendering as a stray caret spanning the
 * widget's full height (`table.from`/`table.to` both fall inside the
 * widget's own `Decoration.replace(..., {block: true})` range — the same
 * "no ordinary line to render a caret against" failure `tableRootSelectionSnap.ts`'s
 * own doc comment already names, just reached without any click or drag
 * at all: simply typing/pasting a table as the last thing in a note is
 * enough). Distinct from every test above this point, which exercises
 * the *delimiter-row-completion* trigger — every test here exercises the
 * *general* guarantee, which fires independently of that trigger (most
 * of these never touch a delimiter row in the transaction being
 * checked at all).
 */
describe('tableActivationNormalization — terminal-table safety: a table never ends the document with no real line after it', () => {
  it('1: a table is the only content in the document — activating it still leaves a real line below', () => {
    let state = makeState('| Name | Age |\n');
    state = typeAtEnd(state, '| --- |');

    expect(state.doc.toString()).toBe(CANONICAL_TABLE);
    expect(state.doc.toString().endsWith('\n')).toBe(true);
  });

  it('2: user types a complete table (header, delimiter, and a real data row) one keystroke at a time and stops at document end', () => {
    // The exact reported repro: nothing about the *final* keystroke here
    // touches a delimiter row at all (it completes the data row's own
    // closing pipe, long after the delimiter row itself already
    // activated the table), so `findActivationCandidates` reports zero
    // candidates for it — only the general terminal-table check (not the
    // delimiter-row-completion trigger) can catch this.
    // Built via one bulk edit first (so the delimiter row's own
    // activation — and whatever row-seeding it triggers — happens
    // entirely inside that one edit, not interleaved with the keystroke
    // under test), then the data row's own still-open closing pipe is
    // typed as a single, separate, final keystroke.
    const withOpenDataRow = dispatchEdit(makeState(''), {
      from: 0,
      to: 0,
      insert: `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n|  | 30 `,
    });
    const beforeFinalKeystroke = withOpenDataRow.doc.toString();

    const state = typeAtEnd(withOpenDataRow, '|'); // the data row's own closing pipe — the last keystroke

    expect(state.doc.toString()).toBe(beforeFinalKeystroke + '|' + '\n');
    expect(findAllTables(state)).toHaveLength(1);
    expect(state.selection.main.head).toBe(state.doc.length);
    expect(findEnclosingTable(state, state.selection.main.head)).toBeNull();
  });

  it('3: a complete table is pasted into an otherwise-empty document in one transaction', () => {
    const state = makeState('');
    const pasted = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    const result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });

    expect(result.doc.toString()).toBe(pasted + '\n');
    expect(findAllTables(result)).toHaveLength(1);
    expect(result.selection.main.head).toBe(result.doc.length);
    expect(findEnclosingTable(result, result.selection.main.head)).toBeNull();
  });

  it('4: a complete table is pasted at the end of an existing document', () => {
    const state = makeState('Some notes above.\n\n');
    const pasted = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    const result = dispatchEdit(state, { from: state.doc.length, to: state.doc.length, insert: pasted });

    expect(result.doc.toString()).toBe('Some notes above.\n\n' + pasted + '\n');
    expect(result.selection.main.head).toBe(result.doc.length);
    expect(findEnclosingTable(result, result.selection.main.head)).toBeNull();
  });

  it('5: a table followed by an existing paragraph is left completely untouched — no line is added when real content already follows', () => {
    const state = makeState('');
    const doc = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |\n\nA paragraph after the table.`;
    const result = dispatchEdit(state, { from: 0, to: 0, insert: doc });

    expect(result.doc.toString()).toBe(doc);
  });

  it('6: a table immediately followed by another (terminal) table only ever safety-guards the truly last one', () => {
    const state = makeState('');
    const firstTable = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    // "City" (4 chars) / "Zip" (3 chars) — same target widths as "Name"/
    // "Age", so this second table's own separator is already canonical
    // too, coincidentally reusing the identical dash counts.
    const secondTable = '| City | Zip |\n| ---- | --- |\n| NYC | 10001 |';
    const doc = firstTable + '\n\n' + secondTable;
    const result = dispatchEdit(state, { from: 0, to: 0, insert: doc });

    expect(result.doc.toString()).toBe(doc + '\n');
    const tables = findAllTables(result);
    expect(tables).toHaveLength(2);
    // The first table's own trailing boundary is real, pre-existing
    // content (the second table starts right after its blank-line gap) —
    // never touched by this guarantee.
    expect(result.doc.sliceString(tables[0]!.from, tables[0]!.to)).toBe(firstTable);
    expect(result.selection.main.head).toBe(result.doc.length);
    expect(findEnclosingTable(result, result.selection.main.head)).toBeNull();
  });

  it('7/8: root selection is never inside either table\'s own range across every scenario above — the giant full-height cursor\'s own precondition never holds', () => {
    const pasted = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    const scenarios = [
      dispatchEdit(makeState(''), { from: 0, to: 0, insert: pasted }),
      dispatchEdit(makeState('Some notes above.\n\n'), {
        from: 'Some notes above.\n\n'.length,
        to: 'Some notes above.\n\n'.length,
        insert: pasted,
      }),
    ];
    for (const result of scenarios) {
      for (const table of findAllTables(result)) {
        const head = result.selection.main.head;
        // The invariant `tableRootSelectionSnap.ts` itself documents:
        // never `>= table.from && < table.to`, and never exactly
        // `table.to` when a real line follows — both checked directly
        // against the actual selection, not inferred.
        expect(head < table.from || head >= table.to).toBe(true);
        expect(findEnclosingTable(result, head)).toBeNull();
      }
    }
  });

  it('9: the cursor lands on a genuine, empty, editable line immediately after the terminal table — not merely "somewhere safe"', () => {
    const state = makeState('');
    const pasted = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    const result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });

    const lastLine = result.doc.line(result.doc.lines);
    expect(lastLine.text).toBe('');
    expect(result.selection.main.head).toBe(lastLine.from);
    expect(result.selection.main.empty).toBe(true);
  });

  it('10: deleting the content after a table (leaving the table newly terminal) is caught the same way as typing/pasting one — the check is not activation-trigger-specific', () => {
    const tableText = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    const state = makeState(tableText + '\n\nSome paragraph to delete.');
    const table = findAllTables(state)[0]!;
    expect(table.to).toBe(tableText.length);

    // Delete everything after the table in one transaction (a real
    // select-and-Delete, or the end state of repeated Backspace) — no
    // delimiter row is touched at all, so `findActivationCandidates`
    // reports nothing; only the general terminal-table check can fire.
    const result = dispatchEdit(state, { from: table.to, to: state.doc.length, insert: '' });

    expect(result.doc.toString()).toBe(tableText + '\n');
    expect(findAllTables(result)).toHaveLength(1);
    expect(result.selection.main.head).toBe(result.doc.length);
    expect(findEnclosingTable(result, result.selection.main.head)).toBeNull();
  });

  it('does not re-fire on a later, unrelated edit once the trailing line already exists', () => {
    const state = makeState('');
    const pasted = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    let result = dispatchEdit(state, { from: 0, to: 0, insert: pasted });
    expect(result.doc.toString()).toBe(pasted + '\n');

    // Typing on the now-existing trailing line must not add a second one.
    result = typeAtEnd(result, 'x');
    expect(result.doc.toString()).toBe(pasted + '\nx');
  });

  it('never steals focus for an edit elsewhere in a larger document that merely also contains a terminal table further down', () => {
    const withTerminalTable = `${CANONICAL_HEADER}\n${CANONICAL_SEPARATOR}\n| Bob | 30 |`;
    const state = makeState('Line one.\n\n' + withTerminalTable);
    const insertPos = 'Line one'.length; // inside the *first* line, nowhere near the table
    const result = dispatchEdit(state, { from: insertPos, to: insertPos, insert: '!' });

    // The trailing safety line is still added (the invariant holds)...
    expect(result.doc.toString()).toBe('Line one!.\n\n' + withTerminalTable + '\n');
    // ...but the cursor stayed exactly where the user was actually typing.
    expect(result.selection.main.head).toBe(insertPos + 1);
  });
});
