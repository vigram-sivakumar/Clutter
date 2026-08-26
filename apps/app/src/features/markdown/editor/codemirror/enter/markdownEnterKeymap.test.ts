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

  describe('empty indentation-only continuation removes the indentation', () => {
    it('leaves a normal empty line under an indented block', () => {
      expect(pressEnterTimes('    Text|', 2)).toEqual([
        '    Text\n    |',
        '    Text\n|',
      ]);
    });

    it('removes deeper indentation in one press', () => {
      expect(pressEnterTimes('        Text|', 2)).toEqual([
        '        Text\n        |',
        '        Text\n|',
      ]);
    });

    it('removes the indentation left by a list continuation line', () => {
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

    it('does not fire when there is content after the cursor', () => {
      expect(pressEnterTimes('1. Text\n2. |rest', 1)).toEqual([
        '1. Text\n2.\n3. |rest',
      ]);
    });
  });
});
