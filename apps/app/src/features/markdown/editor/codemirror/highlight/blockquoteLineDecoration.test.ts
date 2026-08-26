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

  it('nested quote (>>): still exactly one cm-quote-line, no depth distinction', () => {
    const view = mountView('>> nested quote\n\nOther');
    const rows = lines(view);

    expect(rows.map(hasQuoteLine)).toEqual([true, false, false]);
    expect(nthLine(view, 0).className).toBe('cm-line cm-quote-line');
    expect(nthLine(view, 0).style.cssText).toBe('');
  });

  it('quote depth never changes the class: >, >>, >>>, and >>>>>>>> all get the exact same "cm-quote-line" class, no cm-quote-line-N', () => {
    for (const doc of ['> one', '>> two', '>>> three', '>>>>>>>> four']) {
      const view = mountView(doc);
      expect(nthLine(view, 0).className).toBe('cm-line cm-quote-line');
    }
  });

  it('mixed-depth lines (independent quotes separated by a blank line) each still get the exact same single class', () => {
    const view = mountView('>>> one\n\n>> two\n\n> three');
    const rows = lines(view);

    expect(rows.map((row) => row.className)).toEqual([
      'cm-line cm-quote-line',
      'cm-line',
      'cm-line cm-quote-line',
      'cm-line',
      'cm-line cm-quote-line',
    ]);
  });

  it('indentation does not affect ownership: "  > quote" still gets the class', () => {
    const view = mountView('  > indented quote');

    expect(hasQuoteLine(nthLine(view, 0))).toBe(true);
  });

  it('indented nested quote: "  >> quote" still gets exactly the one class, no depth', () => {
    const view = mountView('  >> indented nested quote');

    expect(nthLine(view, 0).className).toBe('cm-line cm-quote-line');
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
