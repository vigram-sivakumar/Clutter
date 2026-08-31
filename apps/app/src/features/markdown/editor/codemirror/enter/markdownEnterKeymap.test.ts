import { history, insertNewlineAndIndent, redo, undo, undoDepth } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import {
  EditorSelection,
  EditorState,
  type Transaction,
} from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterCommand } from './markdownEnterKeymap';

/**
 * Documents are written with `|` marking the cursor, and results are read
 * back the same way, so each expectation is the literal text a user would
 * see. `_` stands for a trailing space, which would otherwise be invisible
 * (and stripped by editors) in these fixtures.
 */
function parse(source: string): EditorState {
  const doc = source.replace(/_/g, ' ');
  const pos = doc.indexOf('|');
  const text = doc.slice(0, pos) + doc.slice(pos + 1);
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension()],
  });
  ensureSyntaxTree(state, text.length, 5000);
  return state;
}

function render(state: EditorState): string {
  const pos = state.selection.main.head;
  const text = state.doc.toString();
  return (text.slice(0, pos) + '|' + text.slice(pos)).replace(
    / (?=\n|$)/g,
    '_'
  );
}

type Handler = 'markdown' | 'default';

/**
 * One Enter press through the real chain: our single Enter binding first,
 * then — exactly as `defaultKeymap` does at lower precedence — CM6's
 * generic `insertNewlineAndIndent`.
 */
function pressEnter(state: EditorState): {
  state: EditorState;
  handledBy: Handler;
} {
  let dispatched: Transaction | null = null;
  const target = {
    state,
    dispatch: (transaction: Transaction) => {
      dispatched = transaction;
    },
  };

  let handledBy: Handler = 'markdown';
  if (!markdownEnterCommand(target)) {
    handledBy = 'default';
    insertNewlineAndIndent(target);
  }

  const next = dispatched ? (dispatched as Transaction).state : state;
  ensureSyntaxTree(next, next.doc.length, 5000);
  return { state: next, handledBy };
}

/** Presses Enter `times` times, returning the rendered document each press. */
function pressEnterTimes(source: string, times: number): string[] {
  let state = parse(source);
  const steps: string[] = [];
  for (let i = 0; i < times; i += 1) {
    state = pressEnter(state).state;
    steps.push(render(state));
  }
  return steps;
}

function handlerFor(source: string): Handler {
  return pressEnter(parse(source)).handledBy;
}

describe('markdownEnterCommand', () => {
  describe('empty list continuation removes one structural level', () => {
    it('removes an empty ordered item', () => {
      expect(pressEnterTimes('1. Text|', 2)).toEqual([
        '1. Text\n2. |',
        '1. Text\n|',
      ]);
    });

    it('removes an empty bullet item', () => {
      expect(pressEnterTimes('- Text|', 2)).toEqual([
        '- Text\n- |',
        '- Text\n|',
      ]);
    });

    it('removes an empty item for every bullet marker', () => {
      expect(pressEnterTimes('* Text|', 2)).toEqual([
        '* Text\n* |',
        '* Text\n|',
      ]);
      expect(pressEnterTimes('+ Text|', 2)).toEqual([
        '+ Text\n+ |',
        '+ Text\n|',
      ]);
    });

    it('removes an empty task item, and keeps CM6 unchecking the continuation', () => {
      expect(pressEnterTimes('- [ ] Task|', 2)).toEqual([
        '- [ ] Task\n- [ ] |',
        '- [ ] Task\n|',
      ]);
      expect(pressEnterTimes('- [x] Completed|', 2)).toEqual([
        '- [x] Completed\n- [ ] |',
        '- [x] Completed\n|',
      ]);
    });

    it('still clears an empty item from the third item on (CM6 already did)', () => {
      expect(pressEnterTimes('1. a\n2. b\n3. c|', 2)).toEqual([
        '1. a\n2. b\n3. c\n4. |',
        '1. a\n2. b\n3. c\n|',
      ]);
    });

    it('unwinds a nested list one level per press, not straight to column 0', () => {
      expect(pressEnterTimes('- Parent\n  - Child|', 3)).toEqual([
        '- Parent\n  - Child\n  - |',
        '- Parent\n  - Child\n- |',
        '- Parent\n  - Child\n|',
      ]);
    });

    it('unwinds a mixed nested list one level per press', () => {
      expect(pressEnterTimes('1. Parent\n   - Child|', 3)).toEqual([
        '1. Parent\n   - Child\n   - |',
        '1. Parent\n   - Child\n2. |',
        '1. Parent\n   - Child\n|',
      ]);
    });
  });

  describe('empty blockquote continuation removes one quote level', () => {
    it('leaves a normal empty line below a single-level quote', () => {
      expect(pressEnterTimes('> Text|', 2)).toEqual([
        '> Text\n> |',
        '> Text\n|',
      ]);
    });

    it('unwinds a nested quote one level per press', () => {
      expect(pressEnterTimes('>> Text|', 3)).toEqual([
        '>> Text\n>> |',
        '>> Text\n>|',
        '>> Text\n|',
      ]);
    });

    it('unwinds a triple-nested quote one level per press', () => {
      expect(pressEnterTimes('>>> Text|', 4)).toEqual([
        '>>> Text\n>>> |',
        '>>> Text\n>>|',
        '>>> Text\n>|',
        '>>> Text\n|',
      ]);
    });
  });

  describe('quote + list unwinds the list level before the quote level', () => {
    it('drops the bullet, then the quote', () => {
      expect(pressEnterTimes('> - Text|', 3)).toEqual([
        '> - Text\n> - |',
        '> - Text\n> |',
        '> - Text\n|',
      ]);
    });

    it('drops the ordered marker, then the quote', () => {
      expect(pressEnterTimes('> 1. Text|', 3)).toEqual([
        '> 1. Text\n> 2. |',
        '> 1. Text\n> |',
        '> 1. Text\n|',
      ]);
    });

    it('drops the bullet, then one quote level at a time', () => {
      expect(pressEnterTimes('>> - Text|', 4)).toEqual([
        '>> - Text\n>> - |',
        '>> - Text\n>> |',
        '>> - Text\n>|',
        '>> - Text\n|',
      ]);
    });
  });

  describe('empty indentation-only continuation removes one indentation unit per press', () => {
    // The editor's configured indentUnit/tabSize are read fresh from CM6's
    // own facets (no override in this test harness, so the defaults apply:
    // a 2-space indentUnit, 4-column tabSize) — the same values `indentLess`
    // (Shift-Tab) would use, never a bespoke unit invented for this feature.
    it('steps 6 -> 4 -> 2 -> 0, one unit at a time, then falls through', () => {
      expect(pressEnterTimes('      Text|', 4)).toEqual([
        '      Text\n      |',
        '      Text\n    |',
        '      Text\n  |',
        '      Text\n|',
      ]);
      expect(handlerFor('      Text\n|')).toBe('default');
    });

    it('steps 4 -> 2 -> 0', () => {
      expect(pressEnterTimes('    Text|', 3)).toEqual([
        '    Text\n    |',
        '    Text\n  |',
        '    Text\n|',
      ]);
    });

    it('steps 2 -> 0', () => {
      expect(pressEnterTimes('  Text|', 2)).toEqual(['  Text\n  |', '  Text\n|']);
    });

    it('steps an odd remainder 3 -> 1 -> 0', () => {
      expect(pressEnterTimes('   Text|', 3)).toEqual([
        '   Text\n   |',
        '   Text\n |',
        '   Text\n|',
      ]);
    });

    it('never removes more than one unit per press, even at 8 spaces', () => {
      expect(pressEnterTimes('        Text|', 5)).toEqual([
        '        Text\n        |',
        '        Text\n      |',
        '        Text\n    |',
        '        Text\n  |',
        '        Text\n|',
      ]);
    });

    it('steps a single tab down using the same column math as spaces', () => {
      // The first Enter is CM6's own newline-and-indent (default keymap,
      // outside this feature) — it renders the new line's indentation from
      // column width via `indentString`, so a 1-tab (4-column) line already
      // continues as 4 spaces, not a literal tab. From there, our handler's
      // column math takes over: 4 columns -> minus a 2-column unit -> 2.
      expect(pressEnterTimes('\tText|', 2)).toEqual(['\tText\n    |', '\tText\n  |']);
    });

    it('steps mixed tab+space indentation down by column, not by character', () => {
      // "\t  " is 6 columns (tab=4, tabSize) + 2 spaces); same as above, the
      // first Enter is CM6's own indent (4-space-unit rendering), then our
      // handler steps 6 -> 4 -> 2 by column.
      expect(pressEnterTimes('\t  Text|', 3)).toEqual([
        '\t  Text\n      |',
        '\t  Text\n    |',
        '\t  Text\n  |',
      ]);
    });

    it('removes one unit from the indentation left by a list continuation line', () => {
      expect(pressEnterTimes('- Parent\n    continuation|', 2)).toEqual([
        '- Parent\n    continuation\n  |',
        '- Parent\n    continuation\n|',
      ]);
    });
  });

  describe('control cases stay on the existing CM6 path', () => {
    it('leaves a normal paragraph to the default keymap', () => {
      expect(handlerFor('hello|')).toBe('default');
      expect(pressEnterTimes('hello|', 2)).toEqual(['hello\n|', 'hello\n\n|']);
    });

    it('leaves a heading to the default keymap', () => {
      expect(handlerFor('# Head|')).toBe('default');
      expect(pressEnterTimes('# Head|', 1)).toEqual(['# Head\n|']);
    });

    it('leaves a thematic break to the default keymap', () => {
      expect(handlerFor('---|')).toBe('default');
      expect(pressEnterTimes('---|', 2)).toEqual(['---\n|', '---\n\n|']);
    });

    it('never touches indentation inside a fenced code block', () => {
      expect(handlerFor('```js\ncode|')).toBe('default');
      expect(pressEnterTimes('```js\n    code|', 2)).toEqual([
        '```js\n    code\n    |',
        '```js\n    code\n\n    |',
      ]);
    });

    it('keeps CM6 blank-line handling for a genuinely non-tight list', () => {
      expect(pressEnterTimes('- a\n\n- b|', 2)).toEqual([
        '- a\n\n- b\n\n- |',
        '- a\n\n- b\n\n|',
      ]);
    });

    it('continues, rather than removes, a list item that has content', () => {
      expect(pressEnterTimes('1. Text\n2. something|', 1)).toEqual([
        '1. Text\n2. something\n3. |',
      ]);
    });

    it('leaves a genuinely empty unindented line to the default keymap', () => {
      expect(handlerFor('hello\n|')).toBe('default');
    });

    it('content-start on an ordered item splits and shifts forward (see "ordered content-start split" below)', () => {
      expect(pressEnterTimes('1. Text\n2. |rest', 1)).toEqual([
        '1. Text\n2._\n3. |rest',
      ]);
    });
  });

  describe('list-marker content-start split preserves the complete marker + separator', () => {
    // Root cause and investigation: preserveListMarkerOnContentStartSplit's
    // own doc comment in markdownEnterKeymap.ts. insertNewlineContinueMarkupCommand
    // (@codemirror/lang-markdown) otherwise consumes the original line's own
    // separator into the change that builds the new line, leaving a bare
    // "-"/"*"/"+"/"1." behind instead of "- "/"* "/"+ "/"1. ".

    it.each(['-', '*', '+'])('"%s Text" at content-start: the original marker keeps its separator', (marker) => {
      expect(pressEnterTimes(`${marker} |Text`, 1)).toEqual([`${marker}_\n${marker} |Text`]);
    });

    it.each(['-', '*', '+'])('nested "%s Text" at content-start: indent, marker, and separator all preserved', (marker) => {
      expect(pressEnterTimes(`${marker} Parent\n  ${marker} |Text`, 1)).toEqual([
        `${marker} Parent\n  ${marker}_\n  ${marker} |Text`,
      ]);
    });

    it('three levels deep: content-start still preserves the deepest item\'s own marker', () => {
      expect(pressEnterTimes('- L1\n  - L2\n    - |Deepest', 1)).toEqual([
        '- L1\n  - L2\n    -_\n    - |Deepest',
      ]);
    });

    it('before the marker: unaffected, falls through to the default keymap exactly as before', () => {
      expect(handlerFor('|- Text')).toBe('default');
      expect(pressEnterTimes('|- Text', 1)).toEqual(['\n|- Text']);
    });

    it('mid-word: unaffected, ordinary split with a fresh marker on each half', () => {
      expect(pressEnterTimes('- Te|xt', 1)).toEqual(['- Te\n- |xt']);
    });

    it('end-of-line: unaffected, ordinary new empty item', () => {
      expect(pressEnterTimes('- Text|', 1)).toEqual(['- Text\n- |']);
    });

    it('empty list item: unaffected, still the existing "exit the list" gesture', () => {
      expect(pressEnterTimes('- one\n- |', 1)).toEqual(['- one\n|']);
    });

    it('ordered content-start split: new item keeps the split point\'s own number, the moved content shifts forward by one (2026-08-31, locked)', () => {
      expect(pressEnterTimes('1. |Text', 1)).toEqual(['1._\n2. |Text']);
    });

    it('ordered content-start split with a wider marker: "10. |Text"', () => {
      expect(pressEnterTimes('10. |Text', 1)).toEqual(['10._\n11. |Text']);
    });

    it('paren-style ordered content-start split: "1) |Text"', () => {
      expect(pressEnterTimes('1) |Text', 1)).toEqual(['1)_\n2) |Text']);
    });

    it('normal nested Enter away from content-start is unaffected', () => {
      expect(pressEnterTimes('- Parent\n  - Child|', 1)).toEqual(['- Parent\n  - Child\n  - |']);
    });
  });

  describe('ordered content-start split: repeated Enter continues the sequence (2026-08-31)', () => {
    it('repeated presses at the freshly-created content-start position never duplicate a literal', () => {
      // Each press splits the *current* content-start item again: the
      // fresh empty item keeps that press's own split-point number, and
      // the moved content shifts forward by one again — never the same
      // literal twice, matching the locked invariant exactly.
      expect(pressEnterTimes('1. |Text', 3)).toEqual([
        '1._\n2. |Text',
        '1._\n2._\n3. |Text',
        '1._\n2._\n3._\n4. |Text',
      ]);
    });

    it('a real sequential run (1/2/3) splitting at the last item shifts only the split point and its own tail, never the untouched head', () => {
      expect(pressEnterTimes('1. One\n2. Two\n3. |Three', 3)).toEqual([
        '1. One\n2. Two\n3._\n4. |Three',
        '1. One\n2. Two\n3._\n4._\n5. |Three',
        '1. One\n2. Two\n3._\n4._\n5._\n6. |Three',
      ]);
    });

    it('splitting a middle item shifts every subsequent sequential sibling, not just the immediate next one', () => {
      expect(pressEnterTimes('7. Seven\n8. Eight\n9. |Nine', 1)).toEqual([
        '7. Seven\n8. Eight\n9._\n10. |Nine',
      ]);
    });

    it('multi-digit marker: "10. Ten\\n11. Eleven\\n12. |Twelve"', () => {
      expect(pressEnterTimes('10. Ten\n11. Eleven\n12. |Twelve', 1)).toEqual([
        '10. Ten\n11. Eleven\n12._\n13. |Twelve',
      ]);
    });

    it('paren delimiter shifts and preserves the delimiter through repeated presses', () => {
      expect(pressEnterTimes('3) |Three', 2)).toEqual([
        '3)_\n4) |Three',
        '3)_\n4)_\n5) |Three',
      ]);
    });

    it('nested (4-space) content-start split shifts correctly at depth', () => {
      expect(pressEnterTimes('1. Parent\n    1. One\n    2. Two\n    3. |Three', 1)).toEqual([
        '1. Parent\n    1. One\n    2. Two\n    3._\n    4. |Three',
      ]);
    });

    it('manual/irregular numbering: the split point shifts, but an unrelated earlier manual number is never touched', () => {
      // "99" is never renumbered toward "2" — this command has no notion
      // of "the list should be sequential"; it only ever shifts the split
      // point's own literal and its own already-sequential tail, exactly
      // like every other renumberSequentialTail call site in this
      // codebase.
      expect(pressEnterTimes('1. One\n99. Two\n100. |Three', 1)).toEqual([
        '1. One\n99. Two\n100._\n101. |Three',
      ]);
    });

    it('manual/irregular numbering: a later, still-sequential tail after the split point still shifts', () => {
      expect(pressEnterTimes('1. One\n99. |Two\n100. Three', 1)).toEqual([
        '1. One\n99._\n100. |Two\n101. Three',
      ]);
    });

    it('a 9->10 digit-width growth on a multi-line split-point item with a sufficiently-margined nested child still grows correctly (2026-08-31, nestedContentSurvivesGrowth)', () => {
      // "9. Nine" owns a nested child at 4-space indentation - one column
      // of margin past "9. "'s own 3-column content column - which is
      // exactly enough to survive the digit-width growth to "10. " (whose
      // own content column is 4). See the dedicated
      // nestedContentSurvivesGrowth describe block below for the full
      // margin/zero-margin regression matrix.
      expect(
        pressEnterTimes('9. |Nine\n    1. Nested child', 1)
      ).toEqual(['9._\n10. |Nine\n    1. Nested child']);
    });

    it('bullet content-start splits remain completely unaffected by the ordered-only change', () => {
      expect(pressEnterTimes('- |Text', 1)).toEqual(['-_\n- |Text']);
      expect(pressEnterTimes('- One\n- |Two', 1)).toEqual(['- One\n-_\n- |Two']);
    });

    it('is one atomic undo step per press, and undo restores the exact prior document', () => {
      const doc = '1. Text';
      const pos = doc.indexOf('Text');
      let state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(pos),
        extensions: [markdownLanguageExtension(), history()],
      });
      ensureSyntaxTree(state, doc.length, 5000);

      function press(s: EditorState): EditorState {
        let dispatched: Transaction | null = null;
        const target = { state: s, dispatch: (tr: Transaction) => { dispatched = tr; } };
        markdownEnterCommand(target);
        if (!dispatched) throw new Error('nothing dispatched');
        return (dispatched as Transaction).state;
      }

      const afterFirst = press(state);
      expect(undoDepth(afterFirst)).toBe(1);
      const afterSecond = press(afterFirst);
      expect(undoDepth(afterSecond)).toBe(2);

      let undone = afterSecond;
      undo({ state: undone, dispatch: (tr) => { undone = tr.state; } });
      expect(undone.doc.toString()).toBe(afterFirst.doc.toString());

      let redone = undone;
      redo({ state: redone, dispatch: (tr) => { redone = tr.state; } });
      expect(redone.doc.toString()).toBe(afterSecond.doc.toString());
    });
  });

  describe('content-start split on a multi-line lazy-continuation item: nestedContentSurvivesGrowth (2026-08-31)', () => {
    it('a wrapped multi-line paragraph item still grows 9 -> 10 correctly (not the risky-rewrite fallback)', () => {
      expect(pressEnterTimes('9. |Nine\n    wrapped continuation', 1)).toEqual([
        '9._\n10. |Nine\n    wrapped continuation',
      ]);
    });

    it('repeated Enter on the wrapped multi-line item continues the sequence, never repeating a literal', () => {
      expect(pressEnterTimes('9. |Nine\n    wrapped continuation', 3)).toEqual([
        '9._\n10. |Nine\n    wrapped continuation',
        '9._\n10._\n11. |Nine\n    wrapped continuation',
        '9._\n10._\n11._\n12. |Nine\n    wrapped continuation',
      ]);
    });

    it('99 -> 100 width transition with wrapped continuation content', () => {
      expect(pressEnterTimes('99. |Ninety\n     wrapped continuation', 1)).toEqual([
        '99._\n100. |Ninety\n     wrapped continuation',
      ]);
    });

    it('999 -> 1000 width transition with wrapped continuation content', () => {
      expect(pressEnterTimes('999. |NineNine\n      wrapped continuation', 1)).toEqual([
        '999._\n1000. |NineNine\n      wrapped continuation',
      ]);
    });

    it('lazy continuation at zero indentation margin (exactly the old content column) still grows safely', () => {
      expect(pressEnterTimes('9. |Nine\n   zero margin continuation', 1)).toEqual([
        '9._\n10. |Nine\n   zero margin continuation',
      ]);
    });

    it('lazy continuation with an indentation margin still grows safely', () => {
      expect(pressEnterTimes('9. |Nine\n       wide margin continuation', 1)).toEqual([
        '9._\n10. |Nine\n       wide margin continuation',
      ]);
    });

    it('a genuine nested ordered-list child still falls back to the conservative (duplicate-literal) behavior', () => {
      expect(pressEnterTimes('9. |Nine\n   1. Child', 1)).toEqual(['9._\n9. |Nine\n   1. Child']);
    });

    it('a genuine nested bullet-list child still falls back to the conservative (duplicate-literal) behavior', () => {
      expect(pressEnterTimes('9. |Nine\n   - Child', 1)).toEqual(['9._\n9. |Nine\n   - Child']);
    });

    it('nested (4-space) list-item depth: wrapped continuation still grows correctly', () => {
      expect(
        pressEnterTimes('1. Parent\n    9. |Nine\n        wrapped continuation', 1)
      ).toEqual(['1. Parent\n    9._\n    10. |Nine\n        wrapped continuation']);
    });

    it('paren-style delimiter with wrapped continuation content', () => {
      expect(pressEnterTimes('9) |Nine\n    wrapped continuation', 1)).toEqual([
        '9)_\n10) |Nine\n    wrapped continuation',
      ]);
    });

    it('irregular numbering elsewhere in the list is untouched, but a still-sequential tail after the split point still shifts', () => {
      expect(
        pressEnterTimes('1. One\n99. |Two\n    wrapped continuation\n100. Three', 1)
      ).toEqual(['1. One\n99._\n100. |Two\n    wrapped continuation\n101. Three']);
    });

    it('bullet markers with wrapped continuation content remain completely unaffected', () => {
      expect(pressEnterTimes('- |Text\n    wrapped continuation', 1)).toEqual([
        '-_\n- |Text\n    wrapped continuation',
      ]);
    });

    it('is one atomic undo step for the lazy-continuation growth path', () => {
      const doc = '9. Nine\n    wrapped continuation';
      const pos = doc.indexOf('Nine');
      const state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(pos),
        extensions: [markdownLanguageExtension(), history()],
      });
      ensureSyntaxTree(state, doc.length, 5000);

      let dispatched: Transaction | null = null;
      const target = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
      markdownEnterCommand(target);
      if (!dispatched) throw new Error('nothing dispatched');
      const after = (dispatched as Transaction).state;

      expect(undoDepth(after)).toBe(1);
      expect(after.doc.toString()).toBe('9. \n10. Nine\n    wrapped continuation');

      let undone = after;
      undo({ state: undone, dispatch: (tr) => { undone = tr.state; } });
      expect(undone.doc.toString()).toBe(doc);

      let redone = undone;
      redo({ state: redone, dispatch: (tr) => { redone = tr.state; } });
      expect(redone.doc.toString()).toBe(after.doc.toString());
    });
  });

  describe('content-start split with a genuine nested block child: margin-based nestedContentSurvivesGrowth (2026-08-31)', () => {
    it('the exact reported case: a nested ordered list with sufficient (1-column) margin grows correctly', () => {
      expect(pressEnterTimes('7.\n8.\n9. |One\n    1. Two', 1)).toEqual([
        '7.\n8.\n9._\n10. |One\n    1. Two',
      ]);
    });

    it('zero-margin nested ordered list falls back to the conservative (duplicate-literal) behavior', () => {
      expect(pressEnterTimes('9. |One\n   1. Two', 1)).toEqual(['9._\n9. |One\n   1. Two']);
    });

    it('zero-margin nested bullet list falls back to the conservative (duplicate-literal) behavior', () => {
      expect(pressEnterTimes('9. |One\n   - Two', 1)).toEqual(['9._\n9. |One\n   - Two']);
    });

    it('99 -> 100 with a sufficiently-margined nested ordered list', () => {
      expect(pressEnterTimes('99. |One\n     1. Two', 1)).toEqual(['99._\n100. |One\n     1. Two']);
    });

    it('999 -> 1000 with a sufficiently-margined nested ordered list', () => {
      expect(pressEnterTimes('999. |One\n      1. Two', 1)).toEqual([
        '999._\n1000. |One\n      1. Two',
      ]);
    });

    it('nested outer depth: 4-space (one chained level)', () => {
      expect(pressEnterTimes('1. Parent\n    9. |One\n        1. Two', 1)).toEqual([
        '1. Parent\n    9._\n    10. |One\n        1. Two',
      ]);
    });

    it('nested outer depth: 8-space (two chained levels)', () => {
      expect(
        pressEnterTimes('1. Parent\n    1. Mid\n        9. |One\n            1. Two', 1)
      ).toEqual(['1. Parent\n    1. Mid\n        9._\n        10. |One\n            1. Two']);
    });

    it('nested outer depth: 12-space (three chained levels)', () => {
      expect(
        pressEnterTimes(
          '1. Parent\n    1. Mid\n        1. Mid2\n            9. |One\n                1. Two',
          1
        )
      ).toEqual([
        '1. Parent\n    1. Mid\n        1. Mid2\n            9._\n            10. |One\n                1. Two',
      ]);
    });

    it('repeated Enter continues the sequence past the width-crossing boundary, nested content stays correctly attached throughout', () => {
      expect(pressEnterTimes('9. |One\n    1. Two', 3)).toEqual([
        '9._\n10. |One\n    1. Two',
        '9._\n10._\n11. |One\n    1. Two',
        '9._\n10._\n11._\n12. |One\n    1. Two',
      ]);
    });

    it('paren delimiter with a sufficiently-margined nested ordered list', () => {
      expect(pressEnterTimes('9) |One\n    1) Two', 1)).toEqual(['9)_\n10) |One\n    1) Two']);
    });

    it('irregular numbering: the split point grows, nested content stays attached, and a still-sequential tail after it shifts', () => {
      expect(pressEnterTimes('1. One\n9. |Two\n    1. Nested\n10. Three', 1)).toEqual([
        '1. One\n9._\n10. |Two\n    1. Nested\n11. Three',
      ]);
    });

    it('is one atomic undo step for the nested-block-with-sufficient-margin growth path', () => {
      const doc = '9. One\n    1. Two';
      const pos = doc.indexOf('One');
      const state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(pos),
        extensions: [markdownLanguageExtension(), history()],
      });
      ensureSyntaxTree(state, doc.length, 5000);

      let dispatched: Transaction | null = null;
      const target = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
      markdownEnterCommand(target);
      if (!dispatched) throw new Error('nothing dispatched');
      const after = (dispatched as Transaction).state;

      expect(undoDepth(after)).toBe(1);
      expect(after.doc.toString()).toBe('9. \n10. One\n    1. Two');

      let undone = after;
      undo({ state: undone, dispatch: (tr) => { undone = tr.state; } });
      expect(undone.doc.toString()).toBe(doc);

      let redone = undone;
      redo({ state: redone, dispatch: (tr) => { redone = tr.state; } });
      expect(redone.doc.toString()).toBe(after.doc.toString());
    });
  });

  describe('same-line marker collapse: Enter continues the first (outermost) marker, not the deepest', () => {
    // Closes a documented gap (docs/list-item-architecture-odr.md §6/§12):
    // continueFirstSameLineListLevel was previously live-verified only, no
    // automated coverage. Also the first automated coverage of the
    // 2026-08-29 ordered/mixed-kind extension of the same mechanism.

    it('two-deep same-line bullet chain: "- - Text" continues at the first level', () => {
      expect(pressEnterTimes('- - Text|', 1)).toEqual(['- - Text\n- |']);
    });

    it('four-deep same-line bullet chain: "- - - - Text" still continues at the first level', () => {
      expect(pressEnterTimes('- - - - Text|', 1)).toEqual(['- - - - Text\n- |']);
    });

    it('same-line ordered chain: "1. 1. 1. Text" continues at the first level, marker copied verbatim', () => {
      expect(pressEnterTimes('1. 1. 1. Text|', 1)).toEqual(['1. 1. 1. Text\n1. |']);
    });

    it('mixed-kind same-line chain: "- 1. - Text" continues at the first (bullet) level', () => {
      expect(pressEnterTimes('- 1. - Text|', 1)).toEqual(['- 1. - Text\n- |']);
    });

    it('mixed-kind same-line chain starting ordered: "1. - Text" continues at the first (ordered) level', () => {
      expect(pressEnterTimes('1. - Text|', 1)).toEqual(['1. - Text\n1. |']);
    });

    it('genuine multi-line nesting (different physical lines) is unaffected — continues at the deepest, real level', () => {
      expect(pressEnterTimes('- Parent\n  - Child|', 1)).toEqual(['- Parent\n  - Child\n  - |']);
      expect(pressEnterTimes('1. Parent\n   1. Child|', 1)).toEqual([
        '1. Parent\n   1. Child\n   2. |',
      ]);
    });

    it('a mid-line Enter on a same-line chain falls through to ordinary splitting, not this command', () => {
      expect(pressEnterTimes('- - Te|xt', 1)).toEqual(['- - Te\n  - |xt']);
    });
  });

  describe('spurious tail renumbering on lazy-continuation Enter (2026-08-30 fix)', () => {
    it('Enter at the end of a multi-line lazy-continuation paragraph does not renumber later siblings', () => {
      const before =
        '1. One\n2. Two\n3. Three\n4. One\n5. Two\n6. Four\nThis a paragraph that breaks the list|\n7. here\n8. One\n9. Numer';
      const after = pressEnterTimes(before, 1)[0]!;
      // The paragraph gets an ordinary newline continuation; every later
      // sibling's own literal number is untouched - no 7->8, 8->9, 9->10.
      expect(after).toContain('7. here');
      expect(after).toContain('8. One');
      expect(after).toContain('9. Numer');
      expect(after).not.toContain('8. here');
      expect(after).not.toContain('9. One');
      expect(after).not.toContain('10. Numer');
    });

    it('the exact reported shape: item 6 unchanged, item 7 still reads "7."', () => {
      const before = '6. Four\nThis a paragraph that breaks the list|\n7. here';
      const after = pressEnterTimes(before, 1)[0]!;
      expect(after).toContain('6. Four');
      expect(after).toContain('7. here');
      expect(after).not.toContain('8. here');
    });

    it('a genuine new item (Enter at the end of a real marker line) still renumbers the tail correctly - fix does not over-suppress', () => {
      // "8. One" is a real ListItem's own marker line; Enter here inserts
      // a real new "9. " item and must still shift what was "9." to "10."
      const before = '7. here\n8. One|\n9. Numer';
      const after = pressEnterTimes(before, 1)[0]!;
      expect(after).toContain('9. ');
      expect(after).toContain('10. Numer');
    });

    it('empty-line-exit with a real following item still closes the numbering gap - fix does not collide with this legitimate case', () => {
      // Pressing Enter on a truly empty second item exits/removes it;
      // the following "3." must still shift down to "2." to close the gap
      // this departure leaves - this is a different, legitimate renumber
      // this fix must never suppress.
      const before = '1. One\n2. |\n3. Three';
      const after = pressEnterTimes(before, 1)[0]!;
      expect(after).toContain('2. Three');
      expect(after).not.toContain('3. Three');
    });

    it('trailing whitespace before the cursor (non-zero-width main edit) is still caught', () => {
      const before = '6. Four\nThis a paragraph that breaks the list   |\n7. here';
      const after = pressEnterTimes(before, 1)[0]!;
      expect(after).toContain('7. here');
      expect(after).not.toContain('8. here');
    });

    it('reproduces identically on a bullet list too (no digit involved, but the same "no marker created" defect shape) - confirms the fix is scoped to ordered-only via BARE_DIGIT_RUN, bullets have nothing to renumber anyway', () => {
      const before = '- Four\nThis a paragraph that breaks the list|\n- here';
      const after = pressEnterTimes(before, 1)[0]!;
      expect(after).toContain('- here');
    });
  });
});
