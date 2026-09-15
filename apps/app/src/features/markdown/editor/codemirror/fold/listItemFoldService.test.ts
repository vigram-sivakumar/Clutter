import { describe, expect, it } from 'vitest';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { computeListItemFold } from './listItemFoldService';

function stateFor(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  syntaxTree(state);
  return state;
}

describe('computeListItemFold — root-cause regression: lazy continuation must never inflate a list/task item fold past its genuine descendants', () => {
  // Case B / C from the investigation: a marker line immediately followed
  // by an unrelated, zero-indent line with no blank line in between.
  // CommonMark's lazy-continuation rule glues this onto the same
  // ListItem/Task node, but it is never a genuine descendant, so there is
  // nothing to fold at all.
  it('a task with no nested content returns null — no fold, no toggle (Case B)', () => {
    const state = stateFor('- [ ] Parent\nSibling paragraph');
    expect(computeListItemFold(state, state.doc.line(1))).toBeNull();
  });

  it('an ordered item with a same-level sibling immediately below it returns null (Case C)', () => {
    const state = stateFor('1. Parent\nSibling');
    expect(computeListItemFold(state, state.doc.line(1))).toBeNull();
  });

  it('a plain (non-task) bullet item with no nested content also returns null', () => {
    const state = stateFor('- Parent\nSibling');
    expect(computeListItemFold(state, state.doc.line(1))).toBeNull();
  });

  // Case A: task with one genuinely nested paragraph, followed by an
  // unrelated zero-indent sibling with no blank line — the root-cause
  // reproduction from the bug report.
  it('a task with one nested paragraph child folds only the child, never the following unrelated sibling (Case A — the reported bug)', () => {
    const state = stateFor('- [ ] Parent\n    Child paragraph\nSibling paragraph');
    const parentLine = state.doc.line(1);
    const childLine = state.doc.line(2);
    expect(computeListItemFold(state, parentLine)).toEqual({ from: parentLine.to, to: childLine.to });
  });

  it('reproduces the exact reported structure: a task, a nested paragraph, then several unrelated top-level lines with no blank-line separation — none of the trailing lines are included', () => {
    const state = stateFor(
      [
        '- [ ] Hey',
        '    Date mention here',
        '[[Date mention]]',
        '[[Links]]',
        '~~[[Multi level nesting]] `Normal` text in white color~~',
        '1. Date mention',
        '[[Horizontal divider]]',
        '🍉 This is an emoji',
      ].join('\n')
    );
    const parentLine = state.doc.line(1);
    const childLine = state.doc.line(2);
    expect(computeListItemFold(state, parentLine)).toEqual({ from: parentLine.to, to: childLine.to });
  });

  // Case D: ordered item with genuinely nested content (paragraph + nested
  // bullet list), followed by a sibling ordered item.
  it('an ordered item with a nested paragraph and a nested bullet item folds both, stopping before the next ordered sibling (Case D)', () => {
    const state = stateFor('1. Parent\n    Nested paragraph\n    - Nested item\n2. Another item');
    const parentLine = state.doc.line(1);
    const nestedItemLine = state.doc.line(3);
    expect(computeListItemFold(state, parentLine)).toEqual({ from: parentLine.to, to: nestedItemLine.to });
  });

  // Case E: nested unordered lists, multiple levels — folding an ancestor
  // must include every deeper descendant; folding a middle level must
  // include only its own descendants, not the top ancestor's siblings.
  it('folding the outermost item of a 3-level nested unordered list hides Child + Grandchild, but not the following sibling (Case E)', () => {
    const state = stateFor('- Parent\n    - Child\n        - Grandchild\nSibling');
    const parentLine = state.doc.line(1);
    const grandchildLine = state.doc.line(3);
    expect(computeListItemFold(state, parentLine)).toEqual({ from: parentLine.to, to: grandchildLine.to });
  });

  it('folding the middle (Child) item of the same 3-level list hides only Grandchild, not Sibling', () => {
    const state = stateFor('- Parent\n    - Child\n        - Grandchild\nSibling');
    const childLine = state.doc.line(2);
    const grandchildLine = state.doc.line(3);
    expect(computeListItemFold(state, childLine)).toEqual({ from: childLine.to, to: grandchildLine.to });
  });

  // Loose list items — genuine nested content separated by a blank line
  // must still be recognized (blank lines bridge, they don't stop, for
  // list items specifically — unlike bare paragraph folding).
  it('bridges a blank line to reach genuinely-indented content beyond it, then stops at the next zero-indent sibling', () => {
    const state = stateFor('- [ ] Hey\n\n    Nested paragraph after blank line\n\nSibling');
    const ownerLine = state.doc.line(1);
    const nestedLine = state.doc.line(3);
    expect(computeListItemFold(state, ownerLine)).toEqual({ from: ownerLine.to, to: nestedLine.to });
  });

  it('does not fold anything when the only content after the marker is a blank line followed by an unrelated zero-indent line', () => {
    const state = stateFor('- Parent\n\nSibling');
    expect(computeListItemFold(state, state.doc.line(1))).toBeNull();
  });

  // Already-correct existing behavior (native foldable() already gave the
  // right answer here) must not regress.
  it('a genuinely blank-line-separated nested list item (no lazy continuation at all) still folds correctly', () => {
    const state = stateFor('- [ ] Hey\n  Nested paragraph child\n\n- [ ] Another item');
    const ownerLine = state.doc.line(1);
    const nestedLine = state.doc.line(2);
    expect(computeListItemFold(state, ownerLine)).toEqual({ from: ownerLine.to, to: nestedLine.to });
  });

  it('the existing nested-bullet-list-with-leaf-sibling case still folds correctly (pre-existing regression guard)', () => {
    const state = stateFor('- Parent\n    - Nested\n- Leaf');
    const parentLine = state.doc.line(1);
    const nestedLine = state.doc.line(2);
    expect(computeListItemFold(state, parentLine)).toEqual({ from: parentLine.to, to: nestedLine.to });
  });

  // Non-owner lines and non-list lines never produce a fold.
  it('returns null when queried on the child line itself, not the marker/owner line', () => {
    const state = stateFor('- Parent\n    Child\nSibling');
    expect(computeListItemFold(state, state.doc.line(2))).toBeNull();
  });

  it('returns null for a non-list line entirely (a plain paragraph)', () => {
    const state = stateFor('Just a paragraph\n    with indentation');
    expect(computeListItemFold(state, state.doc.line(1))).toBeNull();
  });

  // Indentation threshold correctness — must not be stricter than the
  // canonical "greater than the owner's own indentation" model
  // markdownIndentContext.ts already establishes, and must not
  // accidentally exclude a legitimate continuation indented by only one
  // space more than the marker line.
  it('a nested-list marker at the outer item\'s own indentation level (not indented further) is correctly excluded — it is a sibling, not a descendant', () => {
    const state = stateFor('- Parent\n- Sibling item\n    Sibling\'s own nested content');
    // Parent has nothing indented past its own (0) indentation directly
    // beneath it — "- Sibling item" is itself at indentation 0.
    expect(computeListItemFold(state, state.doc.line(1))).toBeNull();
  });

  it('a fenced code block nested inside a list item is included as a genuine descendant', () => {
    const state = stateFor('- Parent\n    ```ts\n    const x = 1\n    ```\nSibling');
    const parentLine = state.doc.line(1);
    const fenceCloseLine = state.doc.line(4);
    expect(computeListItemFold(state, parentLine)).toEqual({ from: parentLine.to, to: fenceCloseLine.to });
  });
});
