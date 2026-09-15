// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { foldEffect, foldedRanges } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';
import {
  DEFAULT_IMAGE_UI_STATE,
  getImageUiState,
  hasImageUiStateEntry,
  imageUiStateField,
  setImageUiState,
} from '../image/imageUiState';

/**
 * `imageUiStateField` is only registered by `embedLivePreview()`/
 * `imageLivePreview()` in the real app (`buildEditorExtensions.ts`) — these
 * tests need only the bare state field, not the full widget/decoration
 * machinery, so it's included directly, the same minimal-extension
 * discipline `foldAwareMoveLineKeymap.test.ts` already uses for
 * `foldEffect` (dispatching state effects directly rather than driving the
 * real toggle UI).
 */
function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return createEditorView({ doc, parent, extensions: [markdownLanguageExtension(), imageUiStateField] });
}

/** Dispatches a real `keydown` so CM6's own keymap resolution runs. */
function pressAlt(view: EditorView, key: 'ArrowUp' | 'ArrowDown'): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
}

/** Marks the whole physical line `lineNumber` as a collapsed embed occurrence — every embed construct in these tests occupies exactly one physical line, so the line's own `[from, to)` is the node's own span. */
function collapseEmbedLine(view: EditorView, lineNumber: number): void {
  const line = view.state.doc.line(lineNumber);
  view.dispatch({
    effects: setImageUiState.of({ pos: line.from, to: line.to, state: { ...DEFAULT_IMAGE_UI_STATE, collapsed: true } }),
  });
}

describe('foldAwareMoveLineKeymap — embed outer-collapse (ImageUiState.collapsed) must survive Alt-ArrowUp/Alt-ArrowDown the same way CM6 folds do', () => {
  it('the reported bug, reproduced exactly: a collapsed embed, Alt-Up on the line below it relocates that line above the whole embed, which stays collapsed', () => {
    const doc = 'Before\n![[EmbedTarget]]\nAfter';
    const view = mount(doc);
    collapseEmbedLine(view, 2);
    view.dispatch({ selection: { anchor: doc.indexOf('After') } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('Before\nAfter\n![[EmbedTarget]]');
    const embedLine = view.state.doc.line(3);
    expect(hasImageUiStateEntry(view.state, embedLine.from)).toBe(true);
    expect(getImageUiState(view.state, embedLine.from).collapsed).toBe(true);
  });

  it('moving it back down restores the original order, embed still collapsed', () => {
    const doc = 'Before\nAfter\n![[EmbedTarget]]';
    const view = mount(doc);
    collapseEmbedLine(view, 3);
    view.dispatch({ selection: { anchor: doc.indexOf('After') } });

    pressAlt(view, 'ArrowDown');

    expect(view.state.doc.toString()).toBe('Before\n![[EmbedTarget]]\nAfter');
    const embedLine = view.state.doc.line(2);
    expect(getImageUiState(view.state, embedLine.from).collapsed).toBe(true);
  });

  it('an expanded (never-collapsed) embed stays expanded across the same move — this fix does not force collapse where none existed', () => {
    const doc = 'Before\n![[EmbedTarget]]\nAfter';
    const view = mount(doc);
    // No collapseEmbedLine call — genuinely no live entry yet, matching a
    // freshly-typed or never-toggled embed.
    view.dispatch({ selection: { anchor: doc.indexOf('After') } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('Before\nAfter\n![[EmbedTarget]]');
    const embedLine = view.state.doc.line(3);
    expect(getImageUiState(view.state, embedLine.from).collapsed).toBe(false);
  });

  it('multiple embeds: moving a line across one collapsed and one expanded embed preserves each independently — no state transfer between them', () => {
    const doc = 'Before\n![[A]]\nCurrent\n![[B]]\nAfter';
    const view = mount(doc);
    collapseEmbedLine(view, 2); // ![[A]] collapsed
    // ![[B]] left with no entry at all (expanded, never toggled).
    view.dispatch({ selection: { anchor: doc.indexOf('Current') } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('Before\nCurrent\n![[A]]\n![[B]]\nAfter');
    const aLine = view.state.doc.line(3);
    const bLine = view.state.doc.line(4);
    expect(getImageUiState(view.state, aLine.from).collapsed).toBe(true);
    expect(hasImageUiStateEntry(view.state, bLine.from)).toBe(false);
  });

  it('two occurrences of the same embedded page keep independent live collapse state — moving one never affects the other', () => {
    const doc = '![[Same Note]]\nCurrent\n![[Same Note]]';
    const view = mount(doc);
    collapseEmbedLine(view, 1); // first occurrence collapsed
    // second occurrence (line 3) left expanded.
    view.dispatch({ selection: { anchor: doc.indexOf('Current') } });

    pressAlt(view, 'ArrowDown');

    expect(view.state.doc.toString()).toBe('![[Same Note]]\n![[Same Note]]\nCurrent');
    const firstLine = view.state.doc.line(1);
    const secondLine = view.state.doc.line(2);
    expect(getImageUiState(view.state, firstLine.from).collapsed).toBe(true);
    expect(getImageUiState(view.state, secondLine.from).collapsed).toBe(false);
  });

  it('moving the embed itself (cursor on its own line) carries its collapsed state with it, with no special case needed', () => {
    const doc = '![[EmbedTarget]]\nSibling below';
    const view = mount(doc);
    collapseEmbedLine(view, 1);
    view.dispatch({ selection: { anchor: 2 } }); // cursor on the embed's own line

    pressAlt(view, 'ArrowDown');

    expect(view.state.doc.toString()).toBe('Sibling below\n![[EmbedTarget]]');
    const embedLine = view.state.doc.line(2);
    expect(getImageUiState(view.state, embedLine.from).collapsed).toBe(true);
  });

  it('mixed state: moving a line across both a folded heading and a collapsed embed preserves both, independently, in one pass each', () => {
    const doc = 'Heading\n    heading body\n![[EmbedTarget]]\nCurrent line';
    const view = mount(doc);
    const headingLine = view.state.doc.line(1);
    const bodyLine = view.state.doc.line(2);
    view.dispatch({ effects: [foldEffect.of({ from: headingLine.to, to: bodyLine.to })] });
    collapseEmbedLine(view, 3);
    view.dispatch({ selection: { anchor: doc.indexOf('Current line') } });

    // First hop: past the collapsed embed.
    pressAlt(view, 'ArrowUp');
    expect(view.state.doc.toString()).toBe('Heading\n    heading body\nCurrent line\n![[EmbedTarget]]');
    let embedLine = view.state.doc.line(4);
    expect(getImageUiState(view.state, embedLine.from).collapsed).toBe(true);

    // Second hop: past the folded heading (still folded).
    pressAlt(view, 'ArrowUp');
    expect(view.state.doc.toString()).toBe('Current line\nHeading\n    heading body\n![[EmbedTarget]]');
    const folds: Array<{ from: number; to: number }> = [];
    foldedRanges(view.state).between(0, view.state.doc.length, (from: number, to: number) => {
      folds.push({ from, to });
    });
    expect(folds).toHaveLength(1);
    const newHeadingLine = view.state.doc.line(2);
    const newBodyLine = view.state.doc.line(3);
    expect(folds[0]).toEqual({ from: newHeadingLine.to, to: newBodyLine.to });
    embedLine = view.state.doc.line(4);
    expect(getImageUiState(view.state, embedLine.from).collapsed).toBe(true);
  });

  it('a collapsed embed elsewhere in the document, unrelated to the moved lines, is left completely untouched', () => {
    const doc = '![[Untouched]]\nLine one\nLine two';
    const view = mount(doc);
    collapseEmbedLine(view, 1);
    view.dispatch({ selection: { anchor: doc.indexOf('Line two') } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('![[Untouched]]\nLine two\nLine one');
    const embedLine = view.state.doc.line(1);
    expect(getImageUiState(view.state, embedLine.from).collapsed).toBe(true);
  });
});
