// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { foldEffect, foldedRanges } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';

function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return createEditorView({ doc, parent, extensions: [markdownLanguageExtension()] });
}

function foldedRangeList(view: EditorView): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    ranges.push({ from, to });
  });
  return ranges;
}

/** Dispatches a real `keydown` so CM6's own keymap resolution runs. */
function pressAlt(view: EditorView, key: 'ArrowUp' | 'ArrowDown'): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
}

describe('foldAwareMoveLineKeymap — root-cause regression: Alt-ArrowUp/Alt-ArrowDown must never corrupt a fold adjacent to the moved line', () => {
  it('the reported bug, reproduced exactly: cursor on the line after a folded region, Alt-Up moves it above the WHOLE folded block, which stays folded', () => {
    const doc = 'Parent\n    hidden child\nCurrent line';
    const view = mount(doc);
    const parentLine = view.state.doc.line(1);
    const childLine = view.state.doc.line(2);
    view.dispatch({ effects: [foldEffect.of({ from: parentLine.to, to: childLine.to })] });
    view.dispatch({ selection: { anchor: doc.indexOf('Current line') } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('Current line\nParent\n    hidden child');
    const folds = foldedRangeList(view);
    expect(folds).toHaveLength(1);
    // The fold still covers exactly "hidden child" at its new position —
    // not a corrupted, near-zero-width residual range (the confirmed
    // native-`moveLine` failure mode this fix replaces).
    const newParentLine = view.state.doc.line(2);
    const newChildLine = view.state.doc.line(3);
    expect(folds[0]).toEqual({ from: newParentLine.to, to: newChildLine.to });
  });

  it('the inverse: cursor on the line before a folded region, Alt-Down moves it below the whole folded block, which stays folded', () => {
    const doc = 'Current line\nParent\n    hidden child\nafter';
    const view = mount(doc);
    const parentLine = view.state.doc.line(2);
    const childLine = view.state.doc.line(3);
    view.dispatch({ effects: [foldEffect.of({ from: parentLine.to, to: childLine.to })] });
    view.dispatch({ selection: { anchor: doc.indexOf('Current line') } });

    pressAlt(view, 'ArrowDown');

    expect(view.state.doc.toString()).toBe('Parent\n    hidden child\nCurrent line\nafter');
    const folds = foldedRangeList(view);
    expect(folds).toHaveLength(1);
    const newParentLine = view.state.doc.line(1);
    const newChildLine = view.state.doc.line(2);
    expect(folds[0]).toEqual({ from: newParentLine.to, to: newChildLine.to });
  });

  it('moving the folded block itself (cursor on the fold owner line): Alt-Down moves the whole owner+hidden-content unit past the next line, still folded', () => {
    const doc = 'Parent\n    hidden child\nSibling below';
    const view = mount(doc);
    const parentLine = view.state.doc.line(1);
    const childLine = view.state.doc.line(2);
    view.dispatch({ effects: [foldEffect.of({ from: parentLine.to, to: childLine.to })] });
    view.dispatch({ selection: { anchor: 2 } }); // cursor on "Parent"

    pressAlt(view, 'ArrowDown');

    expect(view.state.doc.toString()).toBe('Sibling below\nParent\n    hidden child');
    const folds = foldedRangeList(view);
    expect(folds).toHaveLength(1);
    const newParentLine = view.state.doc.line(2);
    const newChildLine = view.state.doc.line(3);
    expect(folds[0]).toEqual({ from: newParentLine.to, to: newChildLine.to });
  });

  it('moving the folded block itself: Alt-Up moves the whole owner+hidden-content unit past the previous line, still folded', () => {
    const doc = 'Sibling above\nParent\n    hidden child';
    const view = mount(doc);
    const parentLine = view.state.doc.line(2);
    const childLine = view.state.doc.line(3);
    view.dispatch({ effects: [foldEffect.of({ from: parentLine.to, to: childLine.to })] });
    view.dispatch({ selection: { anchor: doc.indexOf('Parent') + 2 } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('Parent\n    hidden child\nSibling above');
    const folds = foldedRangeList(view);
    expect(folds).toHaveLength(1);
    const newParentLine = view.state.doc.line(1);
    const newChildLine = view.state.doc.line(2);
    expect(folds[0]).toEqual({ from: newParentLine.to, to: newChildLine.to });
  });

  it('an ordinary move with no fold anywhere near it behaves identically to native moveLineUp/moveLineDown', () => {
    const doc = 'Line one\nLine two\nLine three';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: doc.indexOf('Line two') } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('Line two\nLine one\nLine three');
    expect(foldedRangeList(view)).toEqual([]);
  });

  it('a fold elsewhere in the document, unrelated to the moved lines, is left completely untouched', () => {
    const doc = 'Heading\n    heading body\nLine one\nLine two';
    const view = mount(doc);
    const headingLine = view.state.doc.line(1);
    const bodyLine = view.state.doc.line(2);
    view.dispatch({ effects: [foldEffect.of({ from: headingLine.to, to: bodyLine.to })] });
    view.dispatch({ selection: { anchor: doc.indexOf('Line two') } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('Heading\n    heading body\nLine two\nLine one');
    const folds = foldedRangeList(view);
    expect(folds).toHaveLength(1);
    expect(folds[0]).toEqual({ from: headingLine.to, to: bodyLine.to });
  });

  it('at the document boundary (nothing to move into), declines — no crash, no-op, matching native behavior', () => {
    const view = mount('Only line');
    view.dispatch({ selection: { anchor: 0 } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('Only line');
  });

  it('with a non-empty (multi-line) selection, still relocates the whole selected block past an adjacent fold', () => {
    const doc = 'Parent\n    hidden child\nFirst\nSecond';
    const view = mount(doc);
    const parentLine = view.state.doc.line(1);
    const childLine = view.state.doc.line(2);
    view.dispatch({ effects: [foldEffect.of({ from: parentLine.to, to: childLine.to })] });
    view.dispatch({ selection: { anchor: doc.indexOf('First'), head: doc.indexOf('Second') + 'Second'.length } });

    pressAlt(view, 'ArrowUp');

    expect(view.state.doc.toString()).toBe('First\nSecond\nParent\n    hidden child');
    expect(foldedRangeList(view)).toHaveLength(1);
  });
});
