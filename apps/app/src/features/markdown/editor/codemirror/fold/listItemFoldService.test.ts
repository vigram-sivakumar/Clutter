import { describe, expect, it } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { getFoldRange } from './foldSemantics';

function stateFor(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

describe('list fold eligibility — former list-fold service regression cases', () => {
  it.each([
    ['leaf task', '- [ ] Parent\nSibling paragraph', 1],
    ['ordered sibling', '1. Parent\nSibling', 1],
    ['bullet sibling', '- Parent\nSibling', 1],
    ['task with nested paragraph', '- [ ] Parent\n    Child paragraph\nSibling paragraph', 1],
    ['ordered with children', '1. Parent\n    Nested paragraph\n    - Nested item\n2. Another item', 1],
    ['nested bullet parent', '- Parent\n    - Child\n        - Grandchild\nSibling', 1],
    ['nested bullet child', '- Parent\n    - Child\n        - Grandchild\nSibling', 2],
    ['blank-line separated descendants', '- Parent\n\n    - Child\nSibling', 1],
    ['nested sibling', '- Parent\n    - Child\n    - Sibling', 2],
    ['checked task', '- [x] Parent\n    Child', 1],
    ['ordered hard-break', '1. Parent\\\n   Child\\\n   More', 1],
    ['hard-break continuation', '1. Parent\\\n   Child\\\n   More', 2],
    ['nested fenced-code parent', '- Parent\n    ' + '~~~\n    code\n    ~~~', 1],
  ] as const)('%s cannot own a fold', (_label, doc, ownerLine) => {
    const state = stateFor(doc);
    const line = state.doc.line(ownerLine);
    expect(getFoldRange(state, line)).toBeNull();
  });

  it('retains heading and fenced-code eligibility', () => {
    for (const doc of ['# Heading\nbody', '~~~\ncode\n~~~']) {
      const state = stateFor(doc);
      const line = state.doc.line(1);
      expect(getFoldRange(state, line)).not.toBeNull();
    }
  });
});
