// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { redo, undo, history } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';

function hasNode(state: EditorState, name: string): boolean {
  let found = false;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name) {
        found = true;
      }
    },
  });
  return found;
}

function typeSpace(state: EditorState, pos: number) {
  return state.update({
    changes: { from: pos, to: pos, insert: ' ' },
    selection: { anchor: pos + 1 },
    userEvent: 'input.type',
  }).state;
}

describe('orderedListParagraphInterrupt', () => {
  it('typing the completing Space on "1." immediately below a paragraph produces a real OrderedList — no blank line inserted', () => {
    const state = EditorState.create({
      doc: 'Paragraph text here\n1.',
      selection: { anchor: 22 },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, 22);

    expect(after.doc.toString()).toBe('Paragraph text here\n1. ');
    expect(after.doc.toString()).not.toMatch(/\n\n/);
    expect(hasNode(after, 'OrderedList')).toBe(true);
    expect(hasNode(after, 'ListItem')).toBe(true);
  });

  it.each(['2.', '9.', '10.', '99.'])('marker %s behaves the same as "1."', (marker) => {
    const doc = `Paragraph\n${marker}`;
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, doc.length);

    expect(after.doc.toString()).toBe(`Paragraph\n${marker} `);
    expect(hasNode(after, 'OrderedList')).toBe(true);
  });

  it('a marker indented 4+ spaces remains ordinary paragraph text — deliberately out of scope', () => {
    const doc = 'Paragraph\n    1.';
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, doc.length);

    expect(after.doc.toString()).toBe('Paragraph\n    1. ');
    expect(hasNode(after, 'OrderedList')).toBe(false);
  });

  it('does not widen scope to a marker with real content — native CommonMark behavior for that case is unchanged', () => {
    const state = EditorState.create({
      doc: 'Paragraph\n2. A',
      extensions: [markdownLanguageExtension()],
    });

    expect(hasNode(state, 'OrderedList')).toBe(false);
  });

  it('does not affect bullets — a separate, unrelated Setext-heading collision, out of scope', () => {
    const state = EditorState.create({
      doc: 'Paragraph\n-',
      extensions: [markdownLanguageExtension()],
    });

    expect(hasNode(state, 'BulletList')).toBe(false);
  });

  it('already-native cases (doc start, blank-line-preceded) are unaffected', () => {
    const atStart = EditorState.create({ doc: '1.', extensions: [markdownLanguageExtension()] });
    expect(hasNode(atStart, 'OrderedList')).toBe(true);

    const afterBlank = EditorState.create({ doc: 'Paragraph\n\n1.', extensions: [markdownLanguageExtension()] });
    expect(hasNode(afterBlank, 'OrderedList')).toBe(true);
  });

  it('caret position and undo/redo remain correct across the completing Space', () => {
    const state = EditorState.create({
      doc: 'Paragraph\n1.',
      selection: { anchor: 12 },
      extensions: [markdownLanguageExtension(), history()],
    });

    const afterSpace = typeSpace(state, 12);
    expect(afterSpace.selection.main.head).toBe(13);

    let current = afterSpace;
    const dispatch = (tr: { state: EditorState }) => {
      current = tr.state;
    };

    undo({ state: current, dispatch });
    expect(current.doc.toString()).toBe('Paragraph\n1.');
    expect(current.selection.main.head).toBe(12);

    redo({ state: current, dispatch });
    expect(current.doc.toString()).toBe('Paragraph\n1. ');
    expect(current.selection.main.head).toBe(13);
  });
});
