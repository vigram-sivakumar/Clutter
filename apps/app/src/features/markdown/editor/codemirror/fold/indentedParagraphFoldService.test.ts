import { describe, expect, it } from 'vitest';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { getFoldRange } from './foldSemantics';

function stateFor(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  // Force a fresh resolve against the now-complete tree — mirrors
  // `forceParsing`'s own effect without needing a live `EditorView`.
  syntaxTree(state);
  return state;
}

describe('paragraph folding retired — indentation is not hierarchy', () => {
  it.each([
    'Just one line',
    'Line one\nLine two, same indentation',
    'Parent\n    Child',
    'Parent\n    Child\n    More child',
    'Parent\n    Child\nSibling',
    'Parent\n\n    Indented after blank',
    'Parent\n Child indented by exactly one space',
    '   Parent at 3\n        Child at 8',
    '    Parent at 4\n        Child at 8',
    'Parent\\\n    Child',
    '- Item\n    nested continuation',
  ])('never folds any physical line of %s', (doc) => {
    const state = stateFor(doc);
    for (let n = 1; n <= state.doc.lines; n++) {
      expect(getFoldRange(state, state.doc.line(n))).toBeNull();
    }
  });
  it('keeps heading and code eligibility independent of paragraph indentation', () => {
    for (const doc of ['# Heading\n    indented text under it', '~~~ts\n    indented-looking code line\n~~~']) {
      const state = stateFor(doc);
      expect(getFoldRange(state, state.doc.line(1))).not.toBeNull();
      expect(getFoldRange(state, state.doc.line(2))).toBeNull();
    }
  });
});
