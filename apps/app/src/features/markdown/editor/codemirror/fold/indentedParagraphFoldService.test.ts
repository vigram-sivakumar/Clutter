import { describe, expect, it } from 'vitest';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { computeIndentedParagraphFold } from './indentedParagraphFoldService';

function stateFor(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  // Force a fresh resolve against the now-complete tree — mirrors
  // `forceParsing`'s own effect without needing a live `EditorView`.
  syntaxTree(state);
  return state;
}

describe('computeIndentedParagraphFold', () => {
  it('returns null for an ordinary single-line paragraph', () => {
    const state = stateFor('Just one line');
    expect(computeIndentedParagraphFold(state, state.doc.line(1))).toBeNull();
  });

  it('returns null for two ordinary lines merged into one Paragraph node (no indentation relationship)', () => {
    const state = stateFor('Line one\nLine two, same indentation');
    expect(computeIndentedParagraphFold(state, state.doc.line(1))).toBeNull();
  });

  it('returns null when queried on the child line itself, not the parent — only the true owner line can fold', () => {
    const state = stateFor('Parent\n    Child');
    expect(computeIndentedParagraphFold(state, state.doc.line(2))).toBeNull();
  });

  it('returns {from: end of parent line, to: end of last indented child line} for a genuine parent/child pair', () => {
    const state = stateFor('Parent\n    Child\n    More child');
    const parentLine = state.doc.line(1);
    const lastChildLine = state.doc.line(3);
    expect(computeIndentedParagraphFold(state, parentLine)).toEqual({
      from: parentLine.to,
      to: lastChildLine.to,
    });
  });

  it('stops absorbing at the first line back at (or above) the parent\'s own indentation', () => {
    const state = stateFor('Parent\n    Child\nSibling');
    const parentLine = state.doc.line(1);
    const childLine = state.doc.line(2);
    expect(computeIndentedParagraphFold(state, parentLine)).toEqual({ from: parentLine.to, to: childLine.to });
  });

  it('stops absorbing at a blank line — a blank line is a hard stop, never bridged toward more-indented content beyond it', () => {
    const state = stateFor('Parent\n\n    Indented after blank');
    expect(computeIndentedParagraphFold(state, state.doc.line(1))).toBeNull();
  });

  it('the indentation threshold is a plain "greater than," not a multiple of 4', () => {
    const state = stateFor('Parent\n Child indented by exactly one space');
    const parentLine = state.doc.line(1);
    const childLine = state.doc.line(2);
    expect(computeIndentedParagraphFold(state, parentLine)).toEqual({ from: parentLine.to, to: childLine.to });
  });

  it('a heading line never produces a paragraph fold', () => {
    const state = stateFor('# Heading\n    indented text under it');
    expect(computeIndentedParagraphFold(state, state.doc.line(1))).toBeNull();
  });

  it('a list item\'s own marker line never produces a paragraph fold (resolveLineIndentContext routes it to kind: "list")', () => {
    const state = stateFor('- Item\n    nested continuation');
    expect(computeIndentedParagraphFold(state, state.doc.line(1))).toBeNull();
  });

  it('a fenced code opening line never produces a paragraph fold', () => {
    const state = stateFor('```ts\n    indented-looking code line\n```');
    expect(computeIndentedParagraphFold(state, state.doc.line(1))).toBeNull();
  });

  it('a deeply-indented parent (itself not at column 0) can still own an even-deeper child', () => {
    const state = stateFor('    Parent at 4\n        Child at 8');
    const parentLine = state.doc.line(1);
    const childLine = state.doc.line(2);
    expect(computeIndentedParagraphFold(state, parentLine)).toEqual({ from: parentLine.to, to: childLine.to });
  });
});
