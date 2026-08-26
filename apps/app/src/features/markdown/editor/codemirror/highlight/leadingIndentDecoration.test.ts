// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentMore } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';

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

describe('leadingIndentDecoration (grouped by the current indentUnit facet)', () => {
  it('0. "hello" -> no .cm-indent', () => {
    const view = mountView('hello');
    const line = nthLine(view, 0);
    expect(indentSpans(line)).toHaveLength(0);
    expect(line.textContent).toBe('hello');
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('1. " hello" (1 space, less than one full unit) -> 1 span, sized to the remainder', () => {
    const view = mountView(' hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.textContent).toBe(' ');
    expect(line.textContent).toBe(' hello');
    expect(view.state.doc.toString()).toBe(' hello');
  });

  it('2. "  hello" (2 spaces, exactly one unit with the default indentUnit) -> 1 span covering both characters', () => {
    const view = mountView('  hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.textContent).toBe('  ');
    expect(line.textContent).toBe('  hello');
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('3. "   hello" (3 spaces: 1 full unit + 1 remainder) -> 2 spans, sizes [2, 1]', () => {
    const view = mountView('   hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.textContent)).toEqual(['  ', ' ']);
    expect(line.textContent).toBe('   hello');
    expect(view.state.doc.toString()).toBe('   hello');
  });

  it('4. "    hello" (4 spaces: 2 full units) -> 2 spans, sizes [2, 2]', () => {
    const view = mountView('    hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.textContent)).toEqual(['  ', '  ']);
    expect(line.textContent).toBe('    hello');
    expect(view.state.doc.toString()).toBe('    hello');
  });

  it('5. "     hello" (5 spaces: 2 full units + 1 remainder) -> 3 spans, sizes [2, 2, 1]', () => {
    const view = mountView('     hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.textContent)).toEqual(['  ', '  ', ' ']);
    expect(view.state.doc.toString()).toBe('     hello');
  });

  it('6. "      hello" (6 spaces: 3 full units) -> 3 spans, sizes [2, 2, 2]', () => {
    const view = mountView('      hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.textContent)).toEqual(['  ', '  ', '  ']);
  });

  it('tabs are grouped the same way as spaces, by raw character count', () => {
    const view = mountView('\t\t\thello'); // 3 tabs -> [2, 1] with a 2-char unit
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.textContent)).toEqual(['\t\t', '\t']);
    expect(view.state.doc.toString()).toBe('\t\t\thello');
  });

  it('mixed leading spaces/tabs are grouped by raw character count, in document order', () => {
    const view = mountView(' \t \thello'); // 4 chars -> [2, 2]
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.textContent)).toEqual([' \t', ' \t']);
    expect(view.state.doc.toString()).toBe(' \t \thello');
  });

  it('reads the actual indentUnit facet rather than hardcoding a width: a 4-character unit groups differently', () => {
    const view = mountView('    hello', [indentUnit.of('    ')]); // 4-space unit
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    // Same 4 leading characters as test 4 above, but now exactly 1 unit
    // wide instead of 2 -- proves the grouping follows the facet, not a
    // hardcoded width.
    expect(spans).toHaveLength(1);
    expect(spans[0]!.textContent).toBe('    ');
  });

  it('reads the actual indentUnit facet: a 1-character unit groups every character separately', () => {
    const view = mountView('   hello', [indentUnit.of(' ')]); // 1-space unit
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.textContent)).toEqual([' ', ' ', ' ']);
  });

  it('Tab-produced whitespace and manually typed/pasted identical whitespace render identically', () => {
    // Path A: one Tab press (inserts the default 2-space indentUnit).
    const viewA = mountView('hello');
    viewA.dispatch({ selection: { anchor: 0 } });
    indentMore(viewA);
    expect(viewA.state.doc.toString()).toBe('  hello');

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

    const htmlA = nthLine(viewA, 0).outerHTML;
    const htmlB = nthLine(viewB, 0).outerHTML;
    const htmlC = nthLine(viewC, 0).outerHTML;
    expect(htmlB).toBe(htmlA);
    expect(htmlC).toBe(htmlA);
  });

  it('editing: removing one leading whitespace character reshapes the groups (3 -> 2 spaces: [2,1] -> [2])', () => {
    const view = mountView('   hello');
    expect(indentSpans(nthLine(view, 0)).map((s) => s.textContent)).toEqual(['  ', ' ']);

    view.dispatch({ changes: { from: 0, to: 1, insert: '' } }); // remove one leading space
    expect(indentSpans(nthLine(view, 0)).map((s) => s.textContent)).toEqual(['  ']);
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('editing: adding leading whitespace mid-document updates the groups', () => {
    const view = mountView('hello');
    expect(indentSpans(nthLine(view, 0))).toHaveLength(0);

    view.dispatch({ changes: { from: 0, to: 0, insert: '  ' } });
    expect(indentSpans(nthLine(view, 0)).map((s) => s.textContent)).toEqual(['  ']);
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('editing: removing all leading whitespace leaves zero decorations', () => {
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

    it('multi-line: each physical line independently derives its own indent groups', () => {
      const view = mountView('no indent\n  two spaces\n\t\ttwo tabs');
      expect(indentSpans(nthLine(view, 0))).toHaveLength(0);
      expect(indentSpans(nthLine(view, 1)).map((s) => s.textContent)).toEqual(['  ']);
      expect(indentSpans(nthLine(view, 2)).map((s) => s.textContent)).toEqual(['\t\t']);
    });
  });
});
