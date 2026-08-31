import {
  deleteCharBackward,
  deleteCharForward,
  history,
  insertNewlineAndIndent,
  redo,
  undo,
  undoDepth,
} from '@codemirror/commands';
import { deleteMarkupBackward } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type StateCommand, type Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import {
  deleteBulletMarkerSeparator,
  deleteCompleteListItemSelection,
  markdownEnterCommand,
} from '../enter/markdownEnterKeymap';
import { markdownIndentLess, markdownIndentMore } from '../indent/markdownIndentKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { insertOrderedListMarkerSeparator } from './orderedListMarkerCreation';
import {
  nearestOrderedListStructural,
  orderedListStructuralNormalization,
  planStructuralOrderedListNormalization,
} from './orderedListStructuralNormalization';

/**
 * The real editor's own extension composition (`MarkdownEditor.tsx`) —
 * every test below drives real production `StateCommand`s against a
 * state carrying this exact stack, so a command's own internal
 * `.update()` calls (e.g. `orderedListTabNormalization.ts`'s provisional
 * reparse, or upstream `continueMarkup`'s own dispatch) exercise the same
 * recursive-filter composition the real app does — not a reduced,
 * filter-free stand-in.
 */
function makeState(doc: string, pos: number): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension(), orderedListStructuralNormalization(), history()],
  });
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

function runCommand(command: StateCommand, state: EditorState): EditorState {
  let dispatched: Transaction | null = null;
  const target = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
  const handled = command(target);
  if (!handled) {
    throw new Error('command declined');
  }
  if (!dispatched) {
    throw new Error('command handled but dispatched nothing');
  }
  return (dispatched as Transaction).state;
}

// Mirrors the real editor's full key-resolution chain: this codebase's own
// Markdown-aware command(s) first, then CM6's generic fallback exactly as
// `createEditorView.ts`'s own lower-precedence `defaultKeymap` provides.
const backspaceChain: StateCommand = (target) =>
  deleteBulletMarkerSeparator(target) ||
  deleteCompleteListItemSelection(target) ||
  deleteMarkupBackward(target) ||
  deleteCharBackward(target as unknown as EditorView);

const deleteChain: StateCommand = (target) =>
  deleteCompleteListItemSelection(target) || deleteCharForward(target as unknown as EditorView);

const enterChain: StateCommand = (target) =>
  markdownEnterCommand(target) || insertNewlineAndIndent(target as unknown as EditorView);

function pressEnter(state: EditorState): EditorState {
  return runCommand(enterChain, state);
}
function pressBackspace(state: EditorState): EditorState {
  return runCommand(backspaceChain, state);
}
function pressDelete(state: EditorState): EditorState {
  return runCommand(deleteChain, state);
}
function pressTab(state: EditorState): EditorState {
  return runCommand(markdownIndentMore, state);
}
function pressShiftTab(state: EditorState): EditorState {
  return runCommand(markdownIndentLess, state);
}
function pressSpace(state: EditorState): EditorState {
  return runCommand(insertOrderedListMarkerSeparator, state);
}

/** Applies a raw `{from,to,insert}` edit through the real dispatch/filter chain — the way a selection-delete or a paste ultimately reaches the document. */
function rawEdit(state: EditorState, spec: { from: number; to: number; insert?: string }): EditorState {
  let dispatched: Transaction | null = null;
  const view = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
  view.dispatch(state.update({ changes: spec }));
  return (dispatched as unknown as Transaction).state;
}

describe('orderedListStructuralNormalization — production regression suite', () => {
  describe('real Enter, Backspace, Delete, selection-delete', () => {
    it('real Enter creating a genuine split normalizes the newly isolated list to 1', () => {
      const doc = '1. One\n2. Two\n3. Three\n4. Four\n5. Five\n6. Six\nThis a paragraph that breaks the list\n7. here\n8. One\n9. Numer';
      const pos = doc.indexOf('This a paragraph');
      const state = pressEnter(makeState(doc, pos));
      expect(state.doc.toString()).toBe(
        '1. One\n2. Two\n3. Three\n4. Four\n5. Five\n6. Six\n\nThis a paragraph that breaks the list\n1. here\n2. One\n3. Numer'
      );
    });

    it('real Backspace removing a blank-line boundary merges two lists correctly', () => {
      const doc = '1. One\n2. Two\n3. Three\n\nParagraph here\n\n1. Four';
      const pos = doc.indexOf('\n\nParagraph') + 1; // start of the blank line
      const state = pressBackspace(makeState(doc, pos + 1));
      expect(state.doc.toString()).toBe('1. One\n2. Two\n3. Three\nParagraph here\n\n4. Four');
    });

    it('real Delete removing a blank-line boundary merges two lists correctly', () => {
      const doc = '1. One\n2. Two\n3. Three\n\nParagraph here\n\n1. Four';
      const pos = doc.indexOf('Three') + 'Three'.length;
      const state = pressDelete(makeState(doc, pos));
      expect(state.doc.toString()).toBe('1. One\n2. Two\n3. Three\nParagraph here\n\n4. Four');
    });

    it('real selection-delete spanning a blank-line boundary merges two lists and shifts the full joining tail', () => {
      const doc = '1. One\n2. Two\n\nParagraph\n\n1. Four\n2. Five';
      const from = doc.indexOf('Two') + 'Two'.length;
      const to = from + 1;
      const state = rawEdit(makeState(doc, from), { from, to });
      expect(state.doc.toString()).toBe('1. One\n2. Two\nParagraph\n\n3. Four\n4. Five');
    });
  });

  describe('nesting depth: 4, 8, 12+ spaces', () => {
    // Genuine N-space nesting is reached by chaining N/4 real nested list
    // levels (this codebase's own 4-space indentation unit — each level's
    // marker sits at its immediate container's own content column), not
    // by indenting a single-level item directly to N spaces: a marker
    // indented more than ~4 columns past its *immediate* container's own
    // content column is not recognized as a nested list at all (confirmed
    // directly — with `IndentedCode` removed from this grammar, over-
    // indented content falls back to plain paragraph continuation text,
    // never a nested block), so "8-space nesting" means two real chained
    // levels (4 + 4), and "12-space" means three (4 + 4 + 4).
    const levels: readonly { readonly depth: number; readonly prefix: string; readonly pad: string }[] = [
      { depth: 4, prefix: '1. Parent\n', pad: '    ' },
      { depth: 8, prefix: '1. Parent\n    1. Mid\n', pad: '        ' },
      { depth: 12, prefix: '1. Parent\n    1. Mid\n        1. Mid2\n', pad: '            ' },
    ];

    for (const { depth, prefix, pad } of levels) {
      it(`merge at ${depth}-space nesting normalizes correctly`, () => {
        const doc = `${prefix}${pad}1. One\n${pad}2. Two\n\n${pad}Paragraph here\n\n${pad}1. Four`;
        const pos = doc.indexOf('\n\n' + pad + 'Paragraph') + 1;
        const state = pressBackspace(makeState(doc, pos + 1));
        expect(state.doc.toString()).toBe(
          `${prefix}${pad}1. One\n${pad}2. Two\n${pad}Paragraph here\n\n${pad}3. Four`
        );
      });

      it(`split at ${depth}-space nesting normalizes the new list to 1`, () => {
        const doc = `${prefix}${pad}1. One\n${pad}2. Two\n${pad}3. Three\n${pad}Paragraph here\n${pad}7. Four`;
        const pos = doc.indexOf(pad + 'Paragraph here');
        const state = pressEnter(makeState(doc, pos));
        expect(state.doc.toString()).toContain(`\n\n${pad}Paragraph here\n${pad}1. Four`);
      });
    }
  });

  describe('mixed bullet/ordered nesting', () => {
    it('an ordered list nested inside a bullet list normalizes only the ordered level', () => {
      const doc = '- Bullet\n    1. One\n    2. Two\n\n    Paragraph\n\n    1. Four';
      const pos = doc.indexOf('\n\n    Paragraph') + 1;
      const state = pressBackspace(makeState(doc, pos + 1));
      expect(state.doc.toString()).toBe('- Bullet\n    1. One\n    2. Two\n    Paragraph\n\n    3. Four');
    });
  });

  describe('multiple structural changes in one transaction', () => {
    it('Case A: three independent source lists joining the same destination in one transaction', () => {
      const doc = '1. A\n2. B\n\nPara1\n\n1. C\n\nPara2\n\n1. D\n\nPara3\n\n1. E';
      const b1 = doc.indexOf('\n\nPara1');
      const b2 = doc.indexOf('\n\nPara2');
      const b3 = doc.indexOf('\n\nPara3');

      const s = makeState(doc, 0);
      let dispatched: Transaction | null = null;
      const view = { state: s, dispatch: (tr: Transaction) => { dispatched = tr; } };
      view.dispatch(
        s.update({
          changes: [
            { from: b1, to: b1 + 1 },
            { from: b2, to: b2 + 1 },
            { from: b3, to: b3 + 1 },
          ],
        })
      );
      const combined = (dispatched as unknown as Transaction).state;

      expect(combined.doc.toString()).toBe('1. A\n2. B\nPara1\n\n3. C\nPara2\n\n4. D\nPara3\n\n5. E');
    });

    it('Case B: split + merge in the same transaction', () => {
      const doc = '1. A\n2. B\n\nPara1\n\n1. C\n2. D\nPara2\n3. E';
      const mergeBoundary = doc.indexOf('\n\nPara1');
      const splitPoint = doc.indexOf('\nPara2');
      const state = makeState(doc, 0);
      let dispatched: Transaction | null = null;
      const view = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
      view.dispatch(
        state.update({
          changes: [
            { from: mergeBoundary, to: mergeBoundary + 1 },
            { from: splitPoint, to: splitPoint, insert: '\n' },
          ],
        })
      );
      expect((dispatched as unknown as Transaction).state.doc.toString()).toBe(
        '1. A\n2. B\nPara1\n\n3. C\n4. D\n\nPara2\n1. E'
      );
    });
  });

  describe('a single original OrderedList partially affected (requirement B)', () => {
    it('a contiguous middle run departs to its own new list, leaving the head untouched and the tail re-isolated', () => {
      // Changing the delimiter of items 3 and 4 (contiguous) splits the
      // original 5-item list into three pieces: {1,2} (unaffected, no
      // gap to close since nothing departs from *after* them), the
      // departed {3,4} pair (a genuinely new isolated list, renumbers to
      // 1),2)), and {5} (also now isolated by the split, renumbers to 1.
      // per Rule 3) — all three consequences of a single transaction
      // partially affecting one original list.
      const doc = '1. One\n2. Two\n3. Three\n4. Four\n5. Five';
      const dot3 = doc.indexOf('3. Three') + 1;
      const dot4 = doc.indexOf('4. Four') + 1;
      const state = makeState(doc, 0);
      let dispatched: Transaction | null = null;
      const view = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
      view.dispatch(
        state.update({
          changes: [
            { from: dot3, to: dot3 + 1, insert: ')' },
            { from: dot4, to: dot4 + 1, insert: ')' },
          ],
        })
      );
      expect((dispatched as unknown as Transaction).state.doc.toString()).toBe(
        '1. One\n2. Two\n1) Three\n2) Four\n1. Five'
      );
    });

    it('a departure from the middle of a list closes the gap for the remaining tail (listHasOtherMembers preserved)', () => {
      // Only item 3's delimiter changes: it becomes its own isolated
      // 1-item list, and the tail {4,5} — no longer adjacent to {1,2}
      // through item 3 — becomes its own newly isolated list too,
      // renumbering from 1. The head {1,2} has other members remaining
      // (itself), so the guard does not suppress this normalization.
      const doc = '1. One\n2. Two\n3. Three\n4. Four\n5. Five';
      const pos = doc.indexOf('3. Three') + 1;
      const state = rawEdit(makeState(doc, 0), { from: pos, to: pos + 1, insert: ')' });
      expect(state.doc.toString()).toBe('1. One\n2. Two\n1) Three\n1. Four\n2. Five');
    });
  });

  describe('irregular existing numbering', () => {
    it('destination baseline preserved, not globally resequenced', () => {
      const doc = '1. A\n5. B\n\nPara\n\n99. C\n100. D';
      const pos = doc.indexOf('\n\nPara');
      const state = pressBackspace(makeState(doc, pos + 1));
      expect(state.doc.toString()).toBe('1. A\n5. B\nPara\n\n6. C\n7. D');
    });
  });

  describe('manual digit edits near structural candidates', () => {
    it('a manual digit edit produces zero renumbering even with an unrelated structural candidate present', () => {
      const doc = '1. One\n99. Two\n3. Three\n\nParagraph\n\n7. Four';
      const digitFrom = doc.indexOf('99');
      const state = rawEdit(makeState(doc, digitFrom), { from: digitFrom, to: digitFrom + 2, insert: '2' });
      expect(state.doc.toString()).toBe('1. One\n2. Two\n3. Three\n\nParagraph\n\n7. Four');
    });
  });

  describe('Space marker creation composes without double-processing', () => {
    it('99. + Space normalizes correctly with the structural filter also present', () => {
      const doc = '1. One\n2. Two\n99.';
      const state = pressSpace(makeState(doc, doc.length));
      expect(state.doc.toString()).toBe('1. One\n2. Two\n3. ');
    });
  });

  describe('Tab/Shift-Tab immediately after normalization', () => {
    it('Tab then Shift-Tab round-trips exactly with the structural filter also present', () => {
      const doc = '1. A\n2. B\n3. C';
      const afterTab = pressTab(makeState(doc, doc.length));
      expect(afterTab.doc.toString()).toBe('1. A\n2. B\n    1. C');
      const afterShiftTab = pressShiftTab(makeState(afterTab.doc.toString(), afterTab.doc.length));
      expect(afterShiftTab.doc.toString()).toBe('1. A\n2. B\n3. C');
    });
  });

  describe('. and ) delimiters', () => {
    it('. delimiter preserved through merge', () => {
      const doc = '1. One\n2. Two\n\nParagraph\n\n1. Four';
      const pos = doc.indexOf('\n\nParagraph');
      const state = pressBackspace(makeState(doc, pos + 1));
      expect(state.doc.toString()).toBe('1. One\n2. Two\nParagraph\n\n3. Four');
    });

    it(') delimiter preserved through merge', () => {
      const doc = '1) One\n2) Two\n\nParagraph\n\n1) Four';
      const pos = doc.indexOf('\n\nParagraph');
      const state = pressBackspace(makeState(doc, pos + 1));
      expect(state.doc.toString()).toBe('1) One\n2) Two\nParagraph\n\n3) Four');
    });
  });

  describe('9 -> 10 width transition and risky-rewrite protection', () => {
    it('a single-line joined item safely grows from 9 to 10', () => {
      const doc = '1. A\n2. B\n3. C\n4. D\n5. E\n6. F\n7. G\n8. H\n9. I\n\nParagraph\n\n1. Ten';
      const pos = doc.indexOf('\n\nParagraph');
      const state = pressBackspace(makeState(doc, pos + 1));
      expect(state.doc.toString()).toContain('10. Ten');
    });

    it('a multi-line joined item declines the risky 9->10 rewrite to avoid corrupting nested content', () => {
      const doc =
        '1. A\n2. B\n3. C\n4. D\n5. E\n6. F\n7. G\n8. H\n9. I\n\nParagraph\n\n1. Ten\n    1. Nested child';
      const pos = doc.indexOf('\n\nParagraph');
      const state = pressBackspace(makeState(doc, pos + 1));
      // The risky rewrite is declined: the joined item keeps its own
      // literal "1." rather than growing to "10." and breaking the
      // nested child's own indentation alignment.
      expect(state.doc.toString()).toContain('1. Ten\n    1. Nested child');
      expect(state.doc.toString()).not.toContain('10. Ten');
    });
  });

  describe('undo/redo atomicity', () => {
    it('a chained multi-list normalization is one atomic undo/redo step', () => {
      const doc = '1. A\n2. B\n\nPara1\n\n1. C\n\nPara2\n\n1. D';
      const b1 = doc.indexOf('\n\nPara1');
      const b2 = doc.indexOf('\n\nPara2');
      const state = makeState(doc, 0);
      let dispatched: Transaction | null = null;
      const view = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
      view.dispatch(
        state.update({
          changes: [
            { from: b1, to: b1 + 1 },
            { from: b2, to: b2 + 1 },
          ],
        })
      );
      const after = (dispatched as unknown as Transaction).state;
      expect(undoDepth(after)).toBe(1);
      expect(after.doc.toString()).toBe('1. A\n2. B\nPara1\n\n3. C\nPara2\n\n4. D');

      let undone = after;
      undo({ state: undone, dispatch: (tr) => { undone = tr.state; } });
      expect(undone.doc.toString()).toBe(doc);

      let redone = undone;
      redo({ state: redone, dispatch: (tr) => { redone = tr.state; } });
      expect(redone.doc.toString()).toBe('1. A\n2. B\nPara1\n\n3. C\nPara2\n\n4. D');
    });

    it('a real Enter-triggered split is one atomic undo/redo step', () => {
      const doc = '1. One\n2. Two\n3. Three\nThis a paragraph that breaks the list\n7. here';
      const pos = doc.indexOf('This a paragraph');
      const after = pressEnter(makeState(doc, pos));
      expect(undoDepth(after)).toBe(1);

      let undone = after;
      undo({ state: undone, dispatch: (tr) => { undone = tr.state; } });
      expect(undone.doc.toString()).toBe(doc);
    });
  });

  describe('candidate discovery: no fixed hop count', () => {
    it('nearestOrderedListStructural and enclosingOrderedLists are exported and reusable directly', () => {
      const doc = '1. One\n2. Two\n\nParagraph\n\n1. Four';
      const state = makeState(doc, 0);
      const pos = doc.indexOf('\n\nParagraph');
      expect(nearestOrderedListStructural(state, pos, -1)).not.toBeNull();
      expect(nearestOrderedListStructural(state, pos, 1)).not.toBeNull();
    });

    it('a plain non-list edit produces zero candidates (cheap no-op)', () => {
      const doc = '1. One\n2. Two\n3. Three';
      const state = makeState(doc, 0);
      const changes = state.changes([{ from: 4, to: 4, insert: 'XYZ' }]);
      const edits = planStructuralOrderedListNormalization(state, changes);
      expect(edits).toEqual([]);
    });
  });
});
