// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';

import { computeEmbedRemovalRange, removeEmbed } from './embedRemovalRange';

const IMAGE_MD = '![Mountain view](https://example.com/mountain.jpg)';

describe('computeEmbedRemovalRange', () => {
  it('deletes the embed plus one adjacent blank line, leaving a single blank line between the surrounding paragraphs', () => {
    const doc = `Some text\n\n${IMAGE_MD}\n\nMore text`;
    const state = EditorState.create({ doc });
    const nodeFrom = doc.indexOf(IMAGE_MD);

    const { from, to } = computeEmbedRemovalRange(state, nodeFrom);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('Some text\n\nMore text');
  });

  it('preserves surrounding content exactly (only the embed paragraph is removed)', () => {
    const doc = `Line one\nLine two\n\n${IMAGE_MD}\n\nLine three\nLine four`;
    const state = EditorState.create({ doc });
    const nodeFrom = doc.indexOf(IMAGE_MD);

    const { from, to } = computeEmbedRemovalRange(state, nodeFrom);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('Line one\nLine two\n\nLine three\nLine four');
  });

  it('falls back to the following blank line when there is no preceding one', () => {
    const doc = `${IMAGE_MD}\n\nMore text`;
    const state = EditorState.create({ doc });

    const { from, to } = computeEmbedRemovalRange(state, 0);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('More text');
  });

  it('deletes just its own line (plus trailing newline) when adjacent to real content on both sides', () => {
    const doc = `Before\n${IMAGE_MD}\nAfter`;
    const state = EditorState.create({ doc });
    const nodeFrom = doc.indexOf(IMAGE_MD);

    const { from, to } = computeEmbedRemovalRange(state, nodeFrom);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('Before\nAfter');
  });

  it('deletes everything when the embed is the only content in the document', () => {
    const state = EditorState.create({ doc: IMAGE_MD });

    const { from, to } = computeEmbedRemovalRange(state, 0);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('');
  });

  it('handles the embed as the very first line with a following blank line and trailing content', () => {
    const doc = `${IMAGE_MD}\n\nAfter`;
    const state = EditorState.create({ doc });

    const { from, to } = computeEmbedRemovalRange(state, 0);
    expect(from).toBe(0);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);
    expect(result).toBe('After');
  });

  it('handles the embed as the very last line with a preceding blank line', () => {
    const doc = `Before\n\n${IMAGE_MD}`;
    const state = EditorState.create({ doc });
    const nodeFrom = doc.indexOf(IMAGE_MD);

    const { from, to } = computeEmbedRemovalRange(state, nodeFrom);
    expect(to).toBe(doc.length);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);
    expect(result).toBe('Before');
  });
});

describe('removeEmbed — shared document action', () => {
  it.each([IMAGE_MD, '![[photo.png]]', '![[document.pdf]]', '![[Note]]', '![[unknown.zip]]'])(
    'removes %s in one undoable edit without changing neighbouring paragraphs',
    (source) => {
      const doc = `Before\n\n${source}\n\nAfter`;
      const view = new EditorView({ state: EditorState.create({ doc, extensions: [history()] }) });
      try {
        removeEmbed(view, doc.indexOf(source));
        expect(view.state.doc.toString()).toBe('Before\n\nAfter');
        expect(undo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(doc);
      } finally {
        view.destroy();
      }
    }
  );
});
