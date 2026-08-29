import { insertNewlineAndIndent } from '@codemirror/commands';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownIndentMore } from '../indent/markdownIndentKeymap';
import { resolveLineIndentContext } from '../indent/markdownIndentContext';
import { markdownLanguageExtension } from '../markdownLanguage';
import {
  exitLazyContinuationBulletLookalike,
  markdownEnterCommand,
} from './markdownEnterKeymap';
import { deleteBulletMarkerSeparator } from './markdownEnterKeymap';
import { deleteMarkupBackward } from '@codemirror/lang-markdown';

/**
 * Same `|`-marker fixture convention as `markdownEnterKeymap.test.ts`.
 */
function parse(source: string): EditorState {
  const pos = source.indexOf('|');
  const text = source.slice(0, pos) + source.slice(pos + 1);
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
  return text.slice(0, pos) + '|' + text.slice(pos);
}

type Handler = 'markdown' | 'default';

function pressEnter(state: EditorState): { state: EditorState; handledBy: Handler } {
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

function enter(source: string): { rendered: string; handledBy: Handler } {
  const result = pressEnter(parse(source));
  return { rendered: render(result.state), handledBy: result.handledBy };
}

describe('exitLazyContinuationBulletLookalike: Enter preserves physical indentation on a bullet-looking lazy-continuation line', () => {
  describe('unaffected: a genuinely recognized ListItem still uses existing CM6 behavior', () => {
    it('Case A — "* Parent\\n  * Child|" (2sp, real nested ListItem): unchanged, new sibling at Child\'s own level', () => {
      expect(enter('* Parent\n  * Child|')).toEqual({
        rendered: '* Parent\n  * Child\n  * |',
        handledBy: 'markdown',
      });
    });

    it('Case B — "* Parent\\n    * Child|" (4sp, still a real nested ListItem: Parent content-col 2, threshold 6): unchanged', () => {
      expect(enter('* Parent\n    * Child|')).toEqual({
        rendered: '* Parent\n    * Child\n    * |',
        handledBy: 'markdown',
      });
    });
  });

  describe('the critical fallback: bullet-looking but swallowed as lazy continuation', () => {
    it('Case C — "* Parent\\n        - Child|" (8sp, Parent content-col 2, threshold 6, 8>=6): preserves physical indentation, no marker repeated', () => {
      const result = enter('* Parent\n        - Child|');
      expect(result.handledBy).toBe('markdown');
      expect(result.rendered).toBe('* Parent\n        - Child\n        |');
    });

    it('the new line is indented to match the physical line, NOT Parent\'s shallower level', () => {
      const { rendered } = enter('* Parent\n        - Child|');
      const doc = rendered.replace('|', '');
      const lines = doc.split('\n');
      const childIndent = /^ */.exec(lines[1] ?? '')![0].length;
      const newLineIndent = /^ */.exec(lines[2] ?? '')![0].length;
      expect(newLineIndent).toBe(childIndent);
      expect(newLineIndent).not.toBe(2); // Parent's own (wrong, pre-fix) level
    });

    it('the existing "- Child" line is not rewritten — only the new line/break is inserted', () => {
      const { rendered } = enter('* Parent\n        - Child|');
      const doc = rendered.replace('|', '');
      const lines = doc.split('\n');
      expect(lines[0]).toBe('* Parent');
      expect(lines[1]).toBe('        - Child'); // byte-for-byte unchanged
    });

    it('cursor lands at the end of the new, indentation-only line', () => {
      const result = pressEnter(parse('* Parent\n        - Child|'));
      const lines = result.state.doc.toString().split('\n');
      expect(lines[2]).toBe('        '); // 8 spaces, no marker
      expect(result.state.selection.main.head).toBe(result.state.doc.length);
    });

    it('reparse consistency: the incremental result matches a fresh full parse of the same final text (locked 2026-08-29 narrowing)', () => {
      const result = pressEnter(parse('* Parent\n        - Child|'));
      const finalDoc = result.state.doc.toString();

      function dumpTree(state: EditorState): string {
        let out = '';
        syntaxTree(state).iterate({
          enter: (n) => {
            out += `${n.name}[${n.from},${n.to}) `;
          },
        });
        return out;
      }

      const incrementalTree = dumpTree(result.state);
      const freshState = EditorState.create({
        doc: finalDoc,
        extensions: [markdownLanguageExtension()],
      });
      ensureSyntaxTree(freshState, freshState.doc.length, 5000);
      const freshTree = dumpTree(freshState);

      expect(incrementalTree).toBe(freshTree);
    });
  });

  describe('narrowing (locked 2026-08-29): the fallback fires ONLY when the cursor is at the exact end of the physical line', () => {
    it('cursor before the end of the lazy-continuation line: fallback declines, ordinary CM6 character-split behavior applies instead', () => {
      // "* Parent\n        - Chi|ld" — cursor mid-word, not at line end.
      const before = parse('* Parent\n        - Chi|ld');
      expect(
        exitLazyContinuationBulletLookalike({ state: before, dispatch: () => {} })
      ).toBe(false);
    });

    it('cursor immediately before the bullet-lookalike prefix (inside its own leading whitespace): fallback declines', () => {
      // "* Parent\n  |      - Child" — cursor inside the leading whitespace,
      // well before both the marker and the end of the line.
      const before = parse('* Parent\n  |        - Child');
      expect(
        exitLazyContinuationBulletLookalike({ state: before, dispatch: () => {} })
      ).toBe(false);
    });

    it('cursor at the exact end of the line: fallback still fires (the one case it exists for)', () => {
      const before = parse('* Parent\n        - Child|');
      expect(
        exitLazyContinuationBulletLookalike({ state: before, dispatch: () => {} })
      ).toBe(true);
    });

    it('one character before the end of the line: fallback declines even though the rest of the guard would otherwise match', () => {
      const source = '* Parent\n        - Child';
      const state = EditorState.create({
        doc: source,
        selection: EditorSelection.cursor(source.length - 1), // right before the final "d"
        extensions: [markdownLanguageExtension()],
      });
      ensureSyntaxTree(state, state.doc.length, 5000);
      expect(exitLazyContinuationBulletLookalike({ state, dispatch: () => {} })).toBe(false);
    });
  });

  describe('multiple depths — the actual Tab sequence that produced the original screenshot', () => {
    /**
     * Reproduces the exact repro: start from a normally-nested fixture and
     * apply real Tab presses (2-space increments) until the parser stops
     * recognizing the line as its own ListItem, then verify Enter at every
     * depth along the way.
     */
    function tabTimes(state: EditorState, times: number): EditorState {
      let s = state;
      for (let i = 0; i < times; i++) {
        const lineStart = s.doc.toString().lastIndexOf('Bullet 5');
        s = s.update({ selection: EditorSelection.cursor(lineStart) }).state;
        const target = { state: s, dispatch: (tr: Transaction) => (s = tr.state) };
        markdownIndentMore(target);
      }
      ensureSyntaxTree(s, s.doc.length, 5000);
      return s;
    }

    function classify(state: EditorState, lineText: string): string {
      const pos = state.doc.toString().lastIndexOf(lineText);
      const line = state.doc.lineAt(pos);
      return resolveLineIndentContext(state, line).kind;
    }

    it('depth-by-depth: fallback only activates once the line stops being its own ListItem', () => {
      const base = EditorState.create({
        doc: '* Bullet 1\n* Bullet 2\n  * Bullet 3\n    * Bullet 4\n      * Bullet 5',
        extensions: [markdownLanguageExtension()],
      });
      ensureSyntaxTree(base, base.doc.length, 5000);

      const seen: Array<{
        tabs: number;
        classification: string;
        physicalIndent: number;
        enterHandledBy: Handler;
        newLineIndent: number | null;
      }> = [];

      for (let tabs = 0; tabs <= 4; tabs++) {
        const state = tabTimes(base, tabs);
        const classification = classify(state, 'Bullet 5');
        const lineStart = state.doc.toString().lastIndexOf('Bullet 5');
        const line = state.doc.lineAt(lineStart);
        const physicalIndent = /^ */.exec(line.text)![0].length;
        const cursor = line.to;
        const withCursor = state.update({ selection: EditorSelection.cursor(cursor) }).state;
        const result = pressEnter(withCursor);
        const resultLines = result.state.doc.toString().split('\n');
        const newLine = resultLines[resultLines.length - 1] ?? '';
        const newLineIndent = /^ *$/.test(newLine) ? newLine.length : null;
        seen.push({ tabs, classification, physicalIndent, enterHandledBy: result.handledBy, newLineIndent });
      }

      // Up through however many Tabs keep Bullet 5 a real ListItem, Enter
      // uses ordinary CM6 continuation (new line ends with a marker, not
      // tracked here). Once classification flips to 'paragraph', our
      // fallback must fire and the new line must be indentation-only,
      // matching the physical line's own leading whitespace at that exact
      // Tab depth (never frozen at an earlier, shallower value).
      const firstParagraphIndex = seen.findIndex((s) => s.classification === 'paragraph');
      expect(firstParagraphIndex).toBeGreaterThan(-1); // the transition does happen within this range

      for (let i = firstParagraphIndex; i < seen.length; i++) {
        const entry = seen[i]!;
        expect(entry.classification).toBe('paragraph');
        expect(entry.enterHandledBy).toBe('markdown');
        expect(entry.newLineIndent).toBe(entry.physicalIndent);
      }
    });
  });

  function declines(state: EditorState): boolean {
    return exitLazyContinuationBulletLookalike({ state, dispatch: () => {} }) === false;
  }

  describe('scope: unaffected constructs', () => {
    it('ordered lists are not touched by this fallback (regex excludes digits)', () => {
      // Whatever CM6's own behavior is here, our new command must not be
      // the one that fired.
      expect(declines(parse('1. Parent\n        1. Child|'))).toBe(true);
    });

    it('blockquotes are not touched ("> text|")', () => {
      expect(declines(parse('> text|'))).toBe(true);
    });

    it('fenced code content is not touched, even if it looks like a bullet', () => {
      expect(declines(parse('```\ncode\n        - looks like a bullet|\n```'))).toBe(true);
    });

    it('a blank line is not touched', () => {
      expect(declines(parse('Text\n|\nmore'))).toBe(true);
    });

    it('an ordinary paragraph with no bullet-looking text is not touched', () => {
      expect(declines(parse('Some plain text|'))).toBe(true);
    });

    it('a genuinely recognized ListItem line is not touched (declines so continueMarkup can run)', () => {
      expect(declines(parse('* Parent\n  * Child|'))).toBe(true);
    });
  });

  describe('Enter -> Backspace regression: the already-fixed empty-item behavior must not regress', () => {
    it('"* Text|" Enter, then one Backspace, returns to "* Text\\n" (unchanged from the locked behavior)', () => {
      let state = parse('* Text|');
      const enterTarget = { state, dispatch: (tr: Transaction) => (state = tr.state) };
      expect(markdownEnterCommand(enterTarget)).toBe(true);
      expect(state.doc.toString()).toBe('* Text\n* ');

      let handledBy: 'clutter' | 'cm6' | 'none';
      const bsTarget = { state, dispatch: (tr: Transaction) => (state = tr.state) };
      if (deleteBulletMarkerSeparator(bsTarget)) {
        handledBy = 'clutter';
      } else if (deleteMarkupBackward(bsTarget)) {
        handledBy = 'cm6';
      } else {
        handledBy = 'none';
      }

      expect(handledBy).toBe('clutter');
      expect(state.doc.toString()).toBe('* Text\n');
    });
  });
});
