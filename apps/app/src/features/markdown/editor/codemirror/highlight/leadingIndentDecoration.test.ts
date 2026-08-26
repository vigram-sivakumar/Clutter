// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentMore } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { leadingIndentDecoration } from './leadingIndentDecoration';

function mountView(doc: string, extra: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), leadingIndentDecoration(), ...extra],
  });
  return new EditorView({ state, parent });
}

function nthLine(view: EditorView, index: number): HTMLElement {
  const line = Array.from(view.dom.querySelectorAll('.cm-line'))[index];
  if (!line) {
    throw new Error(`expected a .cm-line at index ${index}`);
  }
  return line as HTMLElement;
}

function indentSpans(line: HTMLElement): HTMLElement[] {
  return Array.from(line.querySelectorAll('.cm-indent'));
}

describe('leadingIndentDecoration', () => {
  it('1. "hello" -> no .cm-indent', () => {
    const view = mountView('hello');
    const line = nthLine(view, 0);
    expect(indentSpans(line)).toHaveLength(0);
    expect(line.textContent).toBe('hello');
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('2. " hello" -> 1 .cm-indent, wrapping the real space character', () => {
    const view = mountView(' hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.textContent).toBe(' ');
    expect(line.textContent).toBe(' hello');
    expect(view.state.doc.toString()).toBe(' hello');
  });

  it('3. "   hello" -> 3 .cm-indent, each wrapping one real character', () => {
    const view = mountView('   hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.textContent)).toEqual([' ', ' ', ' ']);
    expect(line.textContent).toBe('   hello');
    expect(view.state.doc.toString()).toBe('   hello');
  });

  it('4. "    hello" -> 4 .cm-indent, no exclusion for the 4-space threshold', () => {
    const view = mountView('    hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(4);
    expect(line.textContent).toBe('    hello');
    expect(view.state.doc.toString()).toBe('    hello');
  });

  it('5. tabs are wrapped individually, one mark per tab character', () => {
    const view = mountView('\t\t\thello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.textContent)).toEqual(['\t', '\t', '\t']);
    expect(view.state.doc.toString()).toBe('\t\t\thello');
  });

  it('6. mixed leading spaces/tabs are wrapped individually, in document order', () => {
    const view = mountView(' \t \thello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(4);
    expect(spans.map((s) => s.textContent)).toEqual([' ', '\t', ' ', '\t']);
    expect(view.state.doc.toString()).toBe(' \t \thello');
  });

  it('7. Tab-produced whitespace and manually typed/pasted identical whitespace render identically', () => {
    // Path A: one Tab press.
    const viewA = mountView('hello');
    viewA.dispatch({ selection: { anchor: 0 } });
    indentMore(viewA);

    // Path B: the same resulting text typed directly as the initial document.
    const viewB = mountView(viewA.state.doc.toString());

    // Path C: the same resulting text produced by a single paste-style insert.
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const stateC = EditorState.create({
      doc: '',
      extensions: [markdownLanguageExtension(), leadingIndentDecoration()],
    });
    const viewC = new EditorView({ state: stateC, parent });
    viewC.dispatch({ changes: { from: 0, to: 0, insert: viewA.state.doc.toString() } });

    expect(viewA.state.doc.toString()).toBe(viewB.state.doc.toString());
    expect(viewA.state.doc.toString()).toBe(viewC.state.doc.toString());

    const htmlA = nthLine(viewA, 0).outerHTML;
    const htmlB = nthLine(viewB, 0).outerHTML;
    const htmlC = nthLine(viewC, 0).outerHTML;
    expect(htmlB).toBe(htmlA);
    expect(htmlC).toBe(htmlA);
  });

  it('8a. editing: removing one leading whitespace character updates the decoration count', () => {
    const view = mountView('   hello');
    expect(indentSpans(nthLine(view, 0))).toHaveLength(3);

    view.dispatch({ changes: { from: 0, to: 1, insert: '' } }); // remove one leading space
    expect(indentSpans(nthLine(view, 0))).toHaveLength(2);
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('8b. editing: adding leading whitespace mid-document updates the decoration count', () => {
    const view = mountView('hello');
    expect(indentSpans(nthLine(view, 0))).toHaveLength(0);

    view.dispatch({ changes: { from: 0, to: 0, insert: '  ' } });
    expect(indentSpans(nthLine(view, 0))).toHaveLength(2);
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('8c. editing: removing all leading whitespace leaves zero decorations', () => {
    const view = mountView('   hello');
    view.dispatch({ changes: { from: 0, to: 3, insert: '' } });
    expect(indentSpans(nthLine(view, 0))).toHaveLength(0);
    expect(view.state.doc.toString()).toBe('hello');
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as indent decorations are applied', () => {
      const text = '   line one\n \t next line';
      const view = mountView(text);
      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 5 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('multi-line: each physical line independently derives its own indent marks', () => {
      const view = mountView('no indent\n  two spaces\n\t\ttwo tabs');
      expect(indentSpans(nthLine(view, 0))).toHaveLength(0);
      expect(indentSpans(nthLine(view, 1))).toHaveLength(2);
      expect(indentSpans(nthLine(view, 2))).toHaveLength(2);
    });
  });
});
