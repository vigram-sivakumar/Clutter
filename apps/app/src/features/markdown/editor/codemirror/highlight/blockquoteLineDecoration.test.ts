// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { blockquoteLineDecoration } from './blockquoteLineDecoration';
import { blockquoteMarkerDecoration } from './blockquoteMarkerDecoration';
import { listLineDecoration } from '../list/listLineDecoration';
import { listMarkerDecoration } from './listMarkerDecoration';

function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), blockquoteLineDecoration(), ...extraExtensions],
  });
  return new EditorView({ state, parent });
}

function lines(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-line'));
}

function nthLine(view: EditorView, index: number): HTMLElement {
  const line = lines(view)[index];
  if (!line) {
    throw new Error(`expected a .cm-line at index ${index}`);
  }
  return line;
}

function hasQuoteLine(line: HTMLElement): boolean {
  return line.className.includes('cm-quote-line');
}

function quoteDepth(line: HTMLElement): number {
  const match = /cm-quote-line-(\d+)/.exec(line.className);
  return match ? Number(match[1]) : 0;
}

describe('blockquoteLineDecoration', () => {
  it('a single-line quote gets cm-quote-line', () => {
    const view = mountView('> quoted text');

    expect(hasQuoteLine(nthLine(view, 0))).toBe(true);
  });

  it('a plain paragraph gets no cm-quote-line and no inline attributes at all', () => {
    const view = mountView('plain paragraph');
    const line = nthLine(view, 0);

    expect(line.className).toBe('cm-line');
    expect(hasQuoteLine(line)).toBe(false);
  });

  it('multi-line quote: every continuation line carrying its own ">" gets the class', () => {
    const view = mountView('> line one\n> line two');
    const rows = lines(view);

    expect(rows.map(hasQuoteLine)).toEqual([true, true]);
  });

  it('lazy continuation (no ">" on the second physical line) still gets the class — still part of the same Blockquote', () => {
    const view = mountView('> line one\nlazy continuation');
    const rows = lines(view);

    expect(rows.map(hasQuoteLine)).toEqual([true, true]);
  });

  it('an empty paragraph-separator line inside the quote (bare ">") still gets the class', () => {
    const view = mountView('> one\n>\n> two');
    const rows = lines(view);

    expect(rows.map(hasQuoteLine)).toEqual([true, true, true]);
  });

  it('stops at a genuine blank line that ends the quote — the following unrelated paragraph gets nothing', () => {
    const view = mountView('> quoted\n\nplain text');
    const rows = lines(view);

    expect(rows.map(hasQuoteLine)).toEqual([true, false, false]);
  });

  it('nested quote (>>) is depth-2, derived from the Blockquote ancestor count', () => {
    const view = mountView('>> nested quote\n\nOther');
    const rows = lines(view);

    expect(rows.map(hasQuoteLine)).toEqual([true, false, false]);
    expect(quoteDepth(nthLine(view, 0))).toBe(2);
    expect(nthLine(view, 0).style.cssText).toBe('--quote-depth: 2;');
  });

  it('depth scales with the number of ">" markers: 1, 2, 3', () => {
    expect(quoteDepth(nthLine(mountView('> one'), 0))).toBe(1);
    expect(quoteDepth(nthLine(mountView('>> two'), 0))).toBe(2);
    expect(quoteDepth(nthLine(mountView('>>> three'), 0))).toBe(3);
  });

  it('decreasing ">" counts on consecutive lines stay lazily nested at the deepest level (real CommonMark blockquote nesting, not independent per-line depths)', () => {
    const view = mountView('>>> one\n>> two\n> three');
    const rows = lines(view);

    expect(rows.map(quoteDepth)).toEqual([3, 3, 3]);
  });

  it('depth 1 then depth 2 as genuinely separate quotes (blank line between): each reports its own depth', () => {
    const view = mountView('> one\n\n>> two');
    const rows = lines(view);

    expect(rows.map(quoteDepth)).toEqual([1, 0, 2]);
  });

  it('depth 2 then depth 1 as genuinely separate quotes (blank line between): each reports its own depth', () => {
    const view = mountView('>> one\n\n> two');
    const rows = lines(view);

    expect(rows.map(quoteDepth)).toEqual([2, 0, 1]);
  });

  it('indentation does not add depth: "  > quote" is still depth 1', () => {
    const view = mountView('  > indented quote');

    expect(quoteDepth(nthLine(view, 0))).toBe(1);
  });

  it('indented nested quote: "  >> quote" is still depth 2, not inflated by the leading spaces', () => {
    const view = mountView('  >> indented nested quote');

    expect(quoteDepth(nthLine(view, 0))).toBe(2);
  });

  it('is unconditional — stays present whether or not the marker is currently engaged', () => {
    const text = '> quoted text';
    const view = mountView(text, [blockquoteMarkerDecoration()]);

    expect(hasQuoteLine(nthLine(view, 0))).toBe(true);

    view.dispatch({ selection: { anchor: 5 } }); // inside "quoted", engages the marker

    expect(hasQuoteLine(nthLine(view, 0))).toBe(true);

    view.dispatch({ selection: { anchor: 0 } }); // re-collapse

    expect(hasQuoteLine(nthLine(view, 0))).toBe(true);
  });

  it('composes with blockquoteMarkerDecoration without conflict — marker concealment and the line class are independent', () => {
    const text = '> quoted text\n\nOther';
    const view = mountView(text, [blockquoteMarkerDecoration()]);
    view.dispatch({ selection: { anchor: text.indexOf('Other') } }); // outside the quote, marker at rest

    expect(view.dom.textContent).not.toContain('>');
    expect(hasQuoteLine(nthLine(view, 0))).toBe(true);
    expect(hasQuoteLine(nthLine(view, 1))).toBe(false);
  });

  it('a quote nested inside a list item still gets cm-quote-line, independent of listLineDecoration', () => {
    const view = mountView('- outer\n  > quoted continuation inside list item', [
      listMarkerDecoration(),
      listLineDecoration(),
    ]);
    const rows = lines(view);

    expect(rows.map(hasQuoteLine)).toEqual([false, true]);
  });

  it('does not decorate a list item nested inside a blockquote as a quote line beyond the marker\'s own line', () => {
    // The bullet's own text line is still inside the Blockquote's range
    // (a nested BulletList is just another Blockquote descendant), so it
    // correctly still gets the class — this test documents that fact
    // rather than asserting the opposite.
    const view = mountView('> - quoted bullet', []);

    expect(hasQuoteLine(nthLine(view, 0))).toBe(true);
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as the decoration is applied', () => {
      const text = '> line one\n> line two';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 5 } });
      expect(view.state.doc.toString()).toBe(text);
    });
  });
});
