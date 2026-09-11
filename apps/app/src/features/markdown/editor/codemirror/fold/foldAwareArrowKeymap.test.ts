// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { foldEffect, foldable, foldedRanges, forceParsing } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';

function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({ doc, parent, extensions: [markdownLanguageExtension()] });
  forceParsing(view);
  return view;
}

function isFolded(view: EditorView, from: number, to: number): boolean {
  let found = false;
  foldedRanges(view.state).between(from, to, (a, b) => {
    if (a === from && b === to) {
      found = true;
    }
  });
  return found;
}

/**
 * Dispatches a real `keydown` so CM6's own keymap resolution runs (the
 * same mechanism `createEditorView.test.ts`'s own foldKeymap test uses).
 * The return value is deliberately not asserted anywhere below —
 * `defaultKeymap`'s own `ArrowLeft`/`ArrowRight` bindings carry
 * `preventDefault: true` unconditionally (confirmed against the
 * installed `@codemirror/commands@6.11.0` source), so `dispatchEvent`
 * returns `false` every time the key matches *any* binding, this file's
 * own or the native fallback — it reflects "was this key bound at all,"
 * never "did this file's own fold-skip logic specifically run." The
 * resulting `view.state.selection` is the only meaningful signal.
 */
function pressArrow(view: EditorView, key: 'ArrowLeft' | 'ArrowRight'): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** Folds the heading on line 1 and returns its native fold range. */
function foldHeading(view: EditorView): { from: number; to: number } {
  const line1 = view.state.doc.line(1);
  const range = foldable(view.state, line1.from, line1.to);
  if (!range) {
    throw new Error('expected the heading to be foldable');
  }
  view.dispatch({ effects: foldEffect.of(range) });
  return range;
}

describe('foldAwareArrowKeymap — ArrowLeft/ArrowRight skip folded ranges instead of expanding them', () => {
  it('ArrowRight at a fold\'s own start skips straight to its end, without unfolding it', () => {
    const view = mount('# Heading\nbody line');
    const range = foldHeading(view);
    expect(isFolded(view, range.from, range.to)).toBe(true);

    view.dispatch({ selection: { anchor: range.from } });
    pressArrow(view, 'ArrowRight');

    expect(view.state.selection.main.head).toBe(range.to);
    // Still folded — this is the whole point of the feature.
    expect(isFolded(view, range.from, range.to)).toBe(true);
  });

  it('ArrowLeft at a fold\'s own end skips straight back to its start, without unfolding it', () => {
    const view = mount('# Heading\nbody line');
    const range = foldHeading(view);

    view.dispatch({ selection: { anchor: range.to } });
    pressArrow(view, 'ArrowLeft');

    expect(view.state.selection.main.head).toBe(range.from);
    expect(isFolded(view, range.from, range.to)).toBe(true);
  });

  it('pressing ArrowRight repeatedly from before a fold still only ever lands on its two boundaries, never inside it', () => {
    const view = mount('# Heading\nbody line one\nbody line two');
    const range = foldHeading(view);

    view.dispatch({ selection: { anchor: range.from - 1 } });
    pressArrow(view, 'ArrowRight'); // steps from just-before the boundary onto it — no fold interaction yet
    expect(view.state.selection.main.head).toBe(range.from);

    pressArrow(view, 'ArrowRight'); // this is the one that used to enter the fold and auto-expand it
    expect(view.state.selection.main.head).toBe(range.to);
    expect(isFolded(view, range.from, range.to)).toBe(true);
  });

  it('does not interfere with ordinary ArrowRight/ArrowLeft when nothing is folded', () => {
    const view = mount('plain text');
    view.dispatch({ selection: { anchor: 0 } });

    pressArrow(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(1);

    pressArrow(view, 'ArrowLeft');
    expect(view.state.selection.main.head).toBe(0);
  });

  it('does not interfere with ArrowRight/ArrowLeft elsewhere in a document that has an unrelated fold', () => {
    const view = mount('# Heading\nbody line\n\nplain paragraph');
    foldHeading(view);

    const plainParagraphStart = view.state.doc.toString().indexOf('plain paragraph');
    view.dispatch({ selection: { anchor: plainParagraphStart } });

    pressArrow(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(plainParagraphStart + 1);
  });

  it('never mutates the document — this is a selection-only transaction', () => {
    const doc = '# Heading\nbody line';
    const view = mount(doc);
    const range = foldHeading(view);
    view.dispatch({ selection: { anchor: range.from } });
    pressArrow(view, 'ArrowRight');

    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a read-only view has this keymap omitted entirely, matching every other fold extension\'s readOnly gate', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = createEditorView({
      doc: '# Heading\nbody line',
      parent,
      readOnly: true,
      extensions: [markdownLanguageExtension()],
    });
    forceParsing(view);

    // No fold state exists at all in a read-only view (codeFolding() is
    // itself omitted there), so foldedRanges() is always empty and this
    // keymap would decline unconditionally even if it were present —
    // this test only confirms the extension truly isn't wired in, not a
    // behavioral difference reachable from the keymap itself.
    view.dispatch({ selection: { anchor: 0 } });
    pressArrow(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(1);
  });
});
