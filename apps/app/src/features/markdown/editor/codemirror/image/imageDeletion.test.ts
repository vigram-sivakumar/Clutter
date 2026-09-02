import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';

import { computeImageDeletionRange } from './imageDeletion';

const IMAGE_MD = '![Mountain view](https://example.com/mountain.jpg)';

describe('computeImageDeletionRange', () => {
  it('deletes the image plus one adjacent blank line, leaving a single blank line between the surrounding paragraphs', () => {
    const doc = `Some text\n\n${IMAGE_MD}\n\nMore text`;
    const state = EditorState.create({ doc });
    const nodeFrom = doc.indexOf(IMAGE_MD);

    const { from, to } = computeImageDeletionRange(state, nodeFrom);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('Some text\n\nMore text');
  });

  it('preserves surrounding content exactly (only the image paragraph is removed)', () => {
    const doc = `Line one\nLine two\n\n${IMAGE_MD}\n\nLine three\nLine four`;
    const state = EditorState.create({ doc });
    const nodeFrom = doc.indexOf(IMAGE_MD);

    const { from, to } = computeImageDeletionRange(state, nodeFrom);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('Line one\nLine two\n\nLine three\nLine four');
  });

  it('falls back to the following blank line when there is no preceding one', () => {
    const doc = `${IMAGE_MD}\n\nMore text`;
    const state = EditorState.create({ doc });

    const { from, to } = computeImageDeletionRange(state, 0);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('More text');
  });

  it('deletes just its own line (plus trailing newline) when adjacent to real content on both sides', () => {
    const doc = `Before\n${IMAGE_MD}\nAfter`;
    const state = EditorState.create({ doc });
    const nodeFrom = doc.indexOf(IMAGE_MD);

    const { from, to } = computeImageDeletionRange(state, nodeFrom);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('Before\nAfter');
  });

  it('deletes everything when the image is the only content in the document', () => {
    const state = EditorState.create({ doc: IMAGE_MD });

    const { from, to } = computeImageDeletionRange(state, 0);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);

    expect(result).toBe('');
  });

  it('handles the image as the very first line with a following blank line and trailing content', () => {
    const doc = `${IMAGE_MD}\n\nAfter`;
    const state = EditorState.create({ doc });

    const { from, to } = computeImageDeletionRange(state, 0);
    expect(from).toBe(0);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);
    expect(result).toBe('After');
  });

  it('handles the image as the very last line with a preceding blank line', () => {
    const doc = `Before\n\n${IMAGE_MD}`;
    const state = EditorState.create({ doc });
    const nodeFrom = doc.indexOf(IMAGE_MD);

    const { from, to } = computeImageDeletionRange(state, nodeFrom);
    expect(to).toBe(doc.length);
    const result = state.doc.toString().slice(0, from) + state.doc.toString().slice(to);
    expect(result).toBe('Before');
  });
});
