// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { redo, undo, history } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterKeymap } from '../enter/markdownEnterKeymap';
import { markdownIndentMore, markdownIndentLess } from '../indent/markdownIndentKeymap';
import { insertOrderedListMarkerSeparator } from './orderedListMarkerCreation';

/**
 * `|` marks the cursor; `_` stands for a trailing space (otherwise
 * invisible/stripped), matching `markdownEnterKeymap.test.ts`'s own
 * convention.
 */
function parse(source: string): EditorState {
  const doc = source.replace(/_/g, ' ');
  const pos = doc.indexOf('|');
  const text = doc.slice(0, pos) + doc.slice(pos + 1);
  return EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension(), markdownEnterKeymap(), history()],
  });
}

function render(state: EditorState): string {
  const pos = state.selection.main.head;
  const text = state.doc.toString();
  return (text.slice(0, pos) + '|' + text.slice(pos)).replace(/ (?=\n|$)/g, '_');
}

function pressSpace(state: EditorState): EditorState {
  let result = state;
  const dispatch = (tr: { state: EditorState }) => {
    result = tr.state;
  };
  const handled = insertOrderedListMarkerSeparator({ state, dispatch });
  // Space always "handles" every keystroke it doesn't decline for
  // (declining falls through to ordinary character insertion elsewhere in
  // the real keymap chain) - for tests that need the un-declined default
  // behavior, insert the space manually instead of calling this helper.
  if (!handled) {
    result = state.update({
      changes: { from: state.selection.main.head, to: state.selection.main.head, insert: ' ' },
      selection: { anchor: state.selection.main.head + 1 },
    }).state;
  }
  return result;
}

function hasNode(state: EditorState, name: string): boolean {
  let found = false;
  syntaxTree(state).iterate({ enter: (n) => { if (n.name === name) found = true; } });
  return found;
}

describe('insertOrderedListMarkerSeparator — normalization on marker creation', () => {
  describe('isolated new list (Paragraph-interrupt case)', () => {
    it.each([
      ['1.', '1'],
      ['2.', '1'],
      ['9.', '1'],
      ['10.', '1'],
      ['99.', '1'],
      ['100.', '1'],
    ])('marker %s, no siblings, normalizes to %s', (marker, expected) => {
      const state = parse(`Paragraph\n${marker}|`);
      const after = pressSpace(state);
      expect(render(after)).toBe(`Paragraph\n${expected}. |`);
      expect(hasNode(after, 'OrderedList')).toBe(true);
    });

    it('marker already correct (1.) is left untouched, still gets the Space', () => {
      const state = parse('Paragraph\n1.|');
      const after = pressSpace(state);
      expect(render(after)).toBe('Paragraph\n1. |');
    });

    it(') delimiter: "99)" normalizes to "1)" - delimiter preserved', () => {
      const state = parse('Paragraph\n99)|');
      const after = pressSpace(state);
      expect(after.doc.toString()).toBe('Paragraph\n1) ');
      expect(after.selection.main.head).toBe(after.doc.length);
      expect(hasNode(after, 'OrderedList')).toBe(true);
    });
  });

  describe('joining an existing sequential list', () => {
    it('"1. One\\n2. Two\\n99." normalizes the new item to 3', () => {
      const state = parse('1. One\n2. Two\n99.|');
      const after = pressSpace(state);
      expect(render(after)).toBe('1. One\n2. Two\n3. |');
    });

    it('"5. One\\n6. Two\\n99." normalizes to 7 (baseline = last sibling, not global sequence)', () => {
      const state = parse('5. One\n6. Two\n99.|');
      const after = pressSpace(state);
      expect(render(after)).toBe('5. One\n6. Two\n7. |');
    });
  });

  describe('joining an existing irregular list', () => {
    it('"1. One\\n5. Two\\n99." normalizes to 6, not 1 and not preserved 99', () => {
      const state = parse('1. One\n5. Two\n99.|');
      const after = pressSpace(state);
      expect(render(after)).toBe('1. One\n5. Two\n6. |');
    });
  });

  describe('manual number edits remain unrestricted', () => {
    it('editing an existing item\'s digit run (3 -> 99) is an ordinary text edit, untouched by this command', () => {
      const doc = '1. One\n2. Two\n3. Three';
      const state = EditorState.create({ doc, extensions: [markdownLanguageExtension(), markdownEnterKeymap()] });
      const threePos = doc.indexOf('3. Three');
      const after = state.update({ changes: { from: threePos, to: threePos + 1, insert: '99' } }).state;
      expect(after.doc.toString()).toBe('1. One\n2. Two\n99. Three');
      expect(hasNode(after, 'OrderedList')).toBe(true);
    });

    it('the command itself declines (returns false) for a Space press inside existing content', () => {
      const state = parse('1. One\n2. Two\n3. Th|ree');
      let handled = false;
      insertOrderedListMarkerSeparator({
        state,
        dispatch: () => {
          handled = true;
        },
      });
      expect(handled).toBe(false);
    });

    it('the command declines for a Space press after a marker that already has content', () => {
      const state = parse('1. One|');
      let handled = false;
      insertOrderedListMarkerSeparator({
        state,
        dispatch: () => {
          handled = true;
        },
      });
      expect(handled).toBe(false);
    });
  });

  describe('bullets are untouched', () => {
    it.each(['-', '*', '+'])('bullet marker %s: command declines, falls through to ordinary Space', (marker) => {
      const state = parse(`Paragraph\n${marker}|`);
      let handled = false;
      insertOrderedListMarkerSeparator({
        state,
        dispatch: () => {
          handled = true;
        },
      });
      expect(handled).toBe(false);
    });
  });

  describe('typing content after normalization', () => {
    it('isolated case: normalized "1. " survives typed content, stays a real OrderedList', () => {
      const state = parse('Paragraph\n99.|');
      const afterSpace = pressSpace(state);
      const pos = afterSpace.selection.main.head;
      const withContent = afterSpace.update({
        changes: { from: pos, to: pos, insert: 'One' },
        selection: { anchor: pos + 3 },
      }).state;
      expect(withContent.doc.toString()).toBe('Paragraph\n1. One');
      expect(hasNode(withContent, 'OrderedList')).toBe(true);
      expect(hasNode(withContent, 'ListItem')).toBe(true);
    });

    it('join case: normalized "3. " survives typed content, list stays intact', () => {
      const state = parse('1. One\n2. Two\n99.|');
      const afterSpace = pressSpace(state);
      const pos = afterSpace.selection.main.head;
      const withContent = afterSpace.update({
        changes: { from: pos, to: pos, insert: 'Three' },
        selection: { anchor: pos + 5 },
      }).state;
      expect(withContent.doc.toString()).toBe('1. One\n2. Two\n3. Three');
      expect(hasNode(withContent, 'OrderedList')).toBe(true);
    });
  });

  describe('undo/redo', () => {
    it('one atomic transaction: undo restores the exact pre-Space document and caret', () => {
      const before = parse('Paragraph\n99.|');
      const after = pressSpace(before);
      expect(render(after)).toBe('Paragraph\n1. |');

      let current = after;
      const dispatch = (tr: { state: EditorState }) => {
        current = tr.state;
      };

      undo({ state: current, dispatch });
      expect(current.doc.toString()).toBe('Paragraph\n99.');
      expect(current.selection.main.head).toBe(13);

      redo({ state: current, dispatch });
      expect(render(current)).toBe('Paragraph\n1. |');
    });

    it('undo/redo for the join case', () => {
      const before = parse('1. One\n2. Two\n99.|');
      const after = pressSpace(before);
      expect(render(after)).toBe('1. One\n2. Two\n3. |');

      let current = after;
      const dispatch = (tr: { state: EditorState }) => {
        current = tr.state;
      };

      undo({ state: current, dispatch });
      expect(current.doc.toString()).toBe('1. One\n2. Two\n99.');

      redo({ state: current, dispatch });
      expect(render(current)).toBe('1. One\n2. Two\n3. |');
    });
  });

  describe('caret position', () => {
    it('caret lands immediately after the separator, whether or not a rewrite happened', () => {
      const alreadyCorrect = pressSpace(parse('Paragraph\n1.|'));
      expect(render(alreadyCorrect)).toBe('Paragraph\n1. |');

      const rewritten = pressSpace(parse('Paragraph\n99.|'));
      expect(render(rewritten)).toBe('Paragraph\n1. |');

      const wideRewrite = pressSpace(parse('Paragraph\n100.|'));
      expect(render(wideRewrite)).toBe('Paragraph\n1. |');
    });
  });

  describe('Tab / Shift-Tab after normalization', () => {
    it('Tab and Shift-Tab operate normally on the normalized item', () => {
      const state = parse('Paragraph\n99.|');
      const afterSpace = pressSpace(state);
      expect(render(afterSpace)).toBe('Paragraph\n1. |');

      let current = afterSpace;
      const dispatch = (tr: { state: EditorState }) => {
        current = tr.state;
      };

      markdownIndentMore({ state: current, dispatch });
      expect(current.doc.toString()).toBe('Paragraph\n    1. ');

      markdownIndentLess({ state: current, dispatch });
      expect(current.doc.toString()).toBe('Paragraph\n1. ');
    });
  });

  describe('paragraph interruption + widened listMarkerParagraphInterrupt interaction', () => {
    it('the isolated-list case genuinely interrupts a paragraph (no blank line introduced)', () => {
      const state = parse('Paragraph text here\n99.|');
      const after = pressSpace(state);
      expect(after.doc.toString()).toBe('Paragraph text here\n1. ');
      expect(after.doc.toString()).not.toMatch(/\n\n/);
      expect(hasNode(after, 'OrderedList')).toBe(true);
    });

    it('a genuinely separate OrderedList after a paragraph (blank-line-separated) is unaffected by this command', () => {
      // Different, pre-existing structural list - "99." here starts a
      // brand-new isolated list separated by a blank line; this command
      // still normalizes it as an isolated list (same rule, not a special
      // case) - confirms no interaction/regression with the blank-line
      // scenario.
      const state = parse('Paragraph\n\n99.|');
      const after = pressSpace(state);
      expect(render(after)).toBe('Paragraph\n\n1. |');
    });

    it('a genuinely separate OrderedList after a heading is unaffected by this command (still isolated-list rule)', () => {
      const state = parse('## Heading\n\n99.|');
      const after = pressSpace(state);
      expect(render(after)).toBe('## Heading\n\n1. |');
    });

    it('a genuinely separate OrderedList after an HR is unaffected by this command (still isolated-list rule)', () => {
      const state = parse('---\n\n99.|');
      const after = pressSpace(state);
      expect(render(after)).toBe('---\n\n1. |');
    });
  });
});
