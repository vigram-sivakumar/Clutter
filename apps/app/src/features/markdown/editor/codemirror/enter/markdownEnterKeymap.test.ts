import { insertNewlineAndIndent } from '@codemirror/commands';
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

    it('content-start on an ordered item preserves the marker rather than incrementing (see "ordered content-start split" below)', () => {
      expect(pressEnterTimes('1. Text\n2. |rest', 1)).toEqual([
        '1. Text\n2._\n2. |rest',
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

    it('ordered content-start split: marker copied verbatim, never incremented (2026-08-29 extension)', () => {
      expect(pressEnterTimes('1. |Text', 1)).toEqual(['1._\n1. |Text']);
    });

    it('ordered content-start split with a wider marker: "10. |Text"', () => {
      expect(pressEnterTimes('10. |Text', 1)).toEqual(['10._\n10. |Text']);
    });

    it('paren-style ordered content-start split: "1) |Text"', () => {
      expect(pressEnterTimes('1) |Text', 1)).toEqual(['1)_\n1) |Text']);
    });

    it('normal nested Enter away from content-start is unaffected', () => {
      expect(pressEnterTimes('- Parent\n  - Child|', 1)).toEqual(['- Parent\n  - Child\n  - |']);
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
});
