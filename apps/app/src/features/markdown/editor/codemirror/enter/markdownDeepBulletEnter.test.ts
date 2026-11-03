import { insertNewlineAndIndent } from '@codemirror/commands';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownIndentMore } from '../indent/markdownIndentKeymap';
import { resolveLineIndentContext } from '../indent/markdownIndentContext';
import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterCommand } from './markdownEnterKeymap';
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

/** `markdown`: a Clutter Enter handler or CodeMirror's Markdown continuation ran; `default`: the chain declined and CodeMirror's generic newline-and-indent ran. */
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

/**
 * Enter on a bullet-looking line that the parser did NOT make a list item. A line indented 4+ columns past its
 * parent's content column is lazy-continuation text of the parent's paragraph (`* Parent` / `        - Child`), however
 * much it looks like a bullet. Clutter has no special handler for it any more: it is a continuation line of the parent
 * item (`isListContinuationLine`), so Enter skips CodeMirror's Markdown list command (which would size the new line
 * from the parent marker's width, 2 columns) and CodeMirror's own `insertNewlineAndIndent` copies the line's own
 * indentation. No marker is invented, because the line was never a list item.
 */
describe('Enter on a bullet-looking lazy-continuation line is CodeMirror\'s generic newline-and-indent', () => {
  describe('unaffected: a genuinely recognized ListItem still uses the Markdown continuation', () => {
    it('Case A — "* Parent\\n  * Child|" (2sp, real nested ListItem): new sibling at Child\'s own level', () => {
      expect(enter('* Parent\n  * Child|')).toEqual({
        rendered: '* Parent\n  * Child\n  * |',
        handledBy: 'markdown',
      });
    });

    it('Case B — "* Parent\\n    * Child|" (4sp, still a real nested ListItem: Parent content-col 2, threshold 6)', () => {
      expect(enter('* Parent\n    * Child|')).toEqual({
        rendered: '* Parent\n    * Child\n    * |',
        handledBy: 'markdown',
      });
    });
  });

  describe('bullet-looking but swallowed as lazy continuation', () => {
    it('Case C — "* Parent\\n        - Child|" (8sp): the generic newline keeps the physical indentation, no marker repeated', () => {
      const result = enter('* Parent\n        - Child|');
      expect(result.handledBy).toBe('default');
      expect(result.rendered).toBe('* Parent\n        - Child\n        |');
    });

    it('the new line matches the physical line, NOT Parent\'s shallower level', () => {
      const { rendered } = enter('* Parent\n        - Child|');
      const lines = rendered.replace('|', '').split('\n');
      const childIndent = /^ */.exec(lines[1] ?? '')![0].length;
      const newLineIndent = /^ */.exec(lines[2] ?? '')![0].length;
      expect(newLineIndent).toBe(childIndent);
      expect(newLineIndent).not.toBe(2); // Parent's own marker width, what the native Markdown command would use
    });

    it('the existing "- Child" line is not rewritten — only the new line is inserted', () => {
      const lines = enter('* Parent\n        - Child|').rendered.replace('|', '').split('\n');
      expect(lines[0]).toBe('* Parent');
      expect(lines[1]).toBe('        - Child'); // byte-for-byte unchanged
    });

    it('cursor lands at the end of the new, indentation-only line', () => {
      const result = pressEnter(parse('* Parent\n        - Child|'));
      expect(result.state.doc.toString().split('\n')[2]).toBe('        '); // 8 spaces, no marker
      expect(result.state.selection.main.head).toBe(result.state.doc.length);
    });

    it('reparse consistency: the incremental result matches a fresh full parse of the same final text', () => {
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

      const freshState = EditorState.create({ doc: finalDoc, extensions: [markdownLanguageExtension()] });
      ensureSyntaxTree(freshState, freshState.doc.length, 5000);
      expect(dumpTree(result.state)).toBe(dumpTree(freshState));
    });

    it('an ordered lookalike behaves the same: "1. Parent\\n        1. Child|"', () => {
      expect(enter('1. Parent\n        1. Child|')).toEqual({
        rendered: '1. Parent\n        1. Child\n        |',
        handledBy: 'default',
      });
    });

    it('with the caret inside the line, Enter is the ordinary character split at the same indentation', () => {
      expect(enter('* Parent\n        - Chi|ld')).toEqual({
        rendered: '* Parent\n        - Chi\n        |ld',
        handledBy: 'default',
      });
    });
  });

  describe('multiple depths — the actual Tab sequence that produced the original screenshot', () => {
    /**
     * Start from a normally-nested fixture and apply real Tab presses until the parser stops recognizing the line as
     * its own ListItem, then verify Enter at every depth along the way.
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
      return resolveLineIndentContext(state, state.doc.lineAt(pos)).kind;
    }

    it('once the line stops being its own ListItem, Enter is the generic newline at the physical indentation', () => {
      const base = EditorState.create({
        doc: '* Bullet 1\n* Bullet 2\n  * Bullet 3\n    * Bullet 4\n      * Bullet 5',
        extensions: [markdownLanguageExtension()],
      });
      ensureSyntaxTree(base, base.doc.length, 5000);

      const seen: Array<{
        classification: string;
        physicalIndent: number;
        enterHandledBy: Handler;
        newLineIndent: number | null;
      }> = [];

      for (let tabs = 0; tabs <= 4; tabs++) {
        const state = tabTimes(base, tabs);
        const classification = classify(state, 'Bullet 5');
        const line = state.doc.lineAt(state.doc.toString().lastIndexOf('Bullet 5'));
        const physicalIndent = /^ */.exec(line.text)![0].length;
        const withCursor = state.update({ selection: EditorSelection.cursor(line.to) }).state;
        const result = pressEnter(withCursor);
        const newLine = result.state.doc.toString().split('\n').pop() ?? '';
        seen.push({
          classification,
          physicalIndent,
          enterHandledBy: result.handledBy,
          newLineIndent: /^ *$/.test(newLine) ? newLine.length : null,
        });
      }

      const firstParagraphIndex = seen.findIndex((s) => s.classification === 'paragraph');
      expect(firstParagraphIndex).toBeGreaterThan(-1); // the transition does happen within this range

      for (let i = firstParagraphIndex; i < seen.length; i++) {
        const entry = seen[i]!;
        expect(entry.classification).toBe('paragraph');
        expect(entry.enterHandledBy).toBe('default');
        expect(entry.newLineIndent).toBe(entry.physicalIndent);
      }
    });
  });

  describe('scope: other constructs are unaffected', () => {
    it('blockquotes keep their prefix ("> text|")', () => {
      expect(enter('> text|')).toEqual({ rendered: '> text\n> |', handledBy: 'markdown' });
    });

    it('fenced code content is not treated as list text, even if it looks like a bullet', () => {
      const result = enter('```\ncode\n        - looks like a bullet|\n```');
      expect(result.handledBy).toBe('default');
      expect(result.rendered).toBe('```\ncode\n        - looks like a bullet\n        |\n```');
    });

    it('a blank line and an ordinary paragraph use the generic newline', () => {
      expect(enter('Text\n|\nmore').handledBy).toBe('default');
      expect(enter('Some plain text|')).toEqual({ rendered: 'Some plain text\n|', handledBy: 'default' });
    });

    it('a genuinely recognized ListItem line still goes through the Markdown continuation', () => {
      expect(enter('* Parent\n  * Child|').handledBy).toBe('markdown');
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
