// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentLess, indentMore } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { blockquoteMarkerDecoration } from './blockquoteMarkerDecoration';
import { leadingIndentDecoration } from './leadingIndentDecoration';

function mountView(doc: string, extra: import('@codemirror/state').Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), leadingIndentDecoration(), ...extra],
  });
  return new EditorView({ state, parent });
}

function lines(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-line'));
}

function nthLine2(rows: HTMLElement[], index: number): HTMLElement {
  const line = rows[index];
  if (!line) {
    throw new Error(`expected a .cm-line at index ${index}`);
  }
  return line;
}

function nthLine(view: EditorView, index: number): HTMLElement {
  return nthLine2(lines(view), index);
}

function indentCount(line: HTMLElement): number {
  return line.querySelectorAll('.cm-indent').length;
}

function isFlatSiblingSequence(line: HTMLElement): boolean {
  const indents = Array.from(line.querySelectorAll('.cm-indent'));
  // None of the indent spans may contain another indent span, and none may
  // have any element ancestor (other than the line itself) that is also a
  // .cm-indent span -- i.e. no nesting in either direction.
  return indents.every(
    (el) => el.querySelector('.cm-indent') === null && el.closest('.cm-indent') === el
  );
}

describe('leadingIndentDecoration', () => {
  it('"hello" (no leading whitespace): no indent spans, doc unchanged', () => {
    const view = mountView('hello');
    expect(indentCount(nthLine(view, 0))).toBe(0);
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('" hello" (1 space): exactly 1 indent span, doc still contains the space', () => {
    const view = mountView(' hello');
    const line = nthLine(view, 0);
    expect(indentCount(line)).toBe(1);
    expect(line.textContent).toBe('hello');
    expect(view.state.doc.toString()).toBe(' hello');
  });

  it('"  hello" (2 spaces): exactly 2 indent spans', () => {
    const view = mountView('  hello');
    expect(indentCount(nthLine(view, 0))).toBe(2);
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('"   hello" (3 spaces): exactly 3 indent spans', () => {
    const view = mountView('   hello');
    const line = nthLine(view, 0);
    expect(indentCount(line)).toBe(3);
    expect(line.textContent).toBe('hello');
    expect(view.state.doc.toString()).toBe('   hello');
  });

  it('indent spans are flat siblings, never nested inside each other', () => {
    const view = mountView('   hello');
    expect(isFlatSiblingSequence(nthLine(view, 0))).toBe(true);
  });

  it('multi-line paragraph: indentation on the second line only', () => {
    const doc = 'first line\n   second line';
    const view = mountView(doc);
    const rows = lines(view);
    expect(indentCount(nthLine2(rows, 0))).toBe(0);
    expect(indentCount(nthLine2(rows, 1))).toBe(3);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('Enter after an indented line: new line independently derives its own indent spans from the resulting document', () => {
    const view = mountView('   first line');
    // Simulate Enter producing a new indented line via inherited indentation
    // (the exact mechanism CM6 uses to decide the new line's whitespace is
    // out of scope here -- we only care that whatever text results is
    // rendered from state.doc, not from "how" Enter produced it).
    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: '\n   second line' },
    });
    const rows = lines(view);
    expect(indentCount(nthLine2(rows, 0))).toBe(3);
    expect(indentCount(nthLine2(rows, 1))).toBe(3);
    expect(view.state.doc.toString()).toBe('   first line\n   second line');
  });

  it('Backspace removing one indent character: indent count drops by exactly one', () => {
    const view = mountView('   hello');
    expect(indentCount(nthLine(view, 0))).toBe(3);
    view.dispatch({ changes: { from: 2, to: 3, insert: '' } }); // remove one leading space
    expect(indentCount(nthLine(view, 0))).toBe(2);
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('Delete removing one indent character: same result as Backspace for this purpose', () => {
    const view = mountView('   hello');
    view.dispatch({ changes: { from: 0, to: 1, insert: '' } }); // delete the first leading space
    expect(indentCount(nthLine(view, 0))).toBe(2);
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('pasting indented text (a single insert transaction) renders identically to typing it', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({ doc: '', extensions: [markdownLanguageExtension(), leadingIndentDecoration()] });
    const view = new EditorView({ state, parent });
    view.dispatch({ changes: { from: 0, to: 0, insert: '   pasted text' } });
    expect(indentCount(nthLine(view, 0))).toBe(3);
    expect(view.state.doc.toString()).toBe('   pasted text');
  });

  it('Tab at the start of a plain paragraph: resulting document renders via the same mechanism, no special-casing', () => {
    const view = mountView('hello');
    view.dispatch({ selection: { anchor: 0 } });
    indentMore(view);
    expect(view.state.doc.toString()).toBe('  hello');
    expect(indentCount(nthLine(view, 0))).toBe(2);

    indentLess(view);
    expect(view.state.doc.toString()).toBe('hello');
    expect(indentCount(nthLine(view, 0))).toBe(0);
  });

  it('mixed spaces/tabs, still ordinary paragraph text (continuation line, no code-block threshold)', () => {
    const doc = 'first line\n \tsecond line';
    const view = mountView(doc);
    const rows = lines(view);
    expect(indentCount(nthLine2(rows, 1))).toBe(2); // one space + one tab = 2 leading whitespace characters
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('indented code block (4+ leading spaces at a fresh block start): leading whitespace left completely untouched', () => {
    const view = mountView('    code line');
    const line = nthLine(view, 0);
    expect(indentCount(line)).toBe(0);
    expect(line.textContent).toBe('    code line');
    expect(view.state.doc.toString()).toBe('    code line');
  });

  it('a single leading tab at a fresh block start (also triggers CodeBlock): untouched', () => {
    const view = mountView('\tcode line');
    const line = nthLine(view, 0);
    expect(indentCount(line)).toBe(0);
    expect(line.textContent).toBe('\tcode line');
  });

  it('fenced code block content: leading whitespace left untouched', () => {
    const view = mountView('```\n   fenced code\n```');
    const rows = lines(view);
    expect(indentCount(nthLine2(rows, 1))).toBe(0);
    expect(nthLine2(rows, 1).textContent).toBe('   fenced code');
  });

  it('blockquote content: leading whitespace before ">" is untouched by this decoration (separate, already-decided concern)', () => {
    const view = mountView('  > quoted', [blockquoteMarkerDecoration()]);
    const line = nthLine(view, 0);
    expect(indentCount(line)).toBe(0);
  });

  it('same final document produced via different histories renders identically', () => {
    const target = '  converged text'; // 2 leading spaces -- matches one indentMore press below

    // History A: start with the target text directly.
    const viewA = mountView(target);

    // History B: start empty, then paste (single insert transaction).
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const stateB = EditorState.create({ doc: '', extensions: [markdownLanguageExtension(), leadingIndentDecoration()] });
    const viewB = new EditorView({ state: stateB, parent });
    viewB.dispatch({ changes: { from: 0, to: 0, insert: target } });

    // History C: type the unindented text first, then Tab-indent it into place.
    const viewC = mountView('converged text');
    viewC.dispatch({ selection: { anchor: 0 } });
    indentMore(viewC);
    expect(viewC.state.doc.toString()).toBe(target);

    const htmlA = viewA.dom.querySelector('.cm-line')!.innerHTML;
    const htmlB = viewB.dom.querySelector('.cm-line')!.innerHTML;
    const htmlC = viewC.dom.querySelector('.cm-line')!.innerHTML;
    expect(htmlB).toBe(htmlA);
    expect(htmlC).toBe(htmlA);
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as indent decorations are applied', () => {
      const text = '   line one\n     line two';
      const view = mountView(text);
      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 5 } });
      expect(view.state.doc.toString()).toBe(text);
    });
  });
});
