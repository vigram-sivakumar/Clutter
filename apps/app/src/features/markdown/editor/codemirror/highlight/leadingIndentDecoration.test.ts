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

  it('1. " hello" (1 space, less than one full unit) -> 0 spans, the space stays ordinary text', () => {
    const view = mountView(' hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(0);
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

  it('3. "   hello" (3 spaces: 1 full unit + 1 incomplete remainder) -> 1 span; the remainder stays ordinary text', () => {
    const view = mountView('   hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(1);
    expect(spans.map((s) => s.textContent)).toEqual(['  ']);
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

  it('5. "     hello" (5 spaces: 2 full units + 1 incomplete remainder) -> 2 spans; the remainder stays ordinary text', () => {
    const view = mountView('     hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.textContent)).toEqual(['  ', '  ']);
    expect(line.textContent).toBe('     hello');
    expect(view.state.doc.toString()).toBe('     hello');
  });

  it('6. "      hello" (6 spaces: 3 full units) -> 3 spans, sizes [2, 2, 2]', () => {
    const view = mountView('      hello');
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.textContent)).toEqual(['  ', '  ', '  ']);
  });

  it('each tab is always its own indent token, never merged with another tab', () => {
    const view = mountView('\t\t\thello'); // 3 tabs -> 3 separate one-character marks
    const line = nthLine(view, 0);
    const spans = indentSpans(line);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.textContent)).toEqual(['\t', '\t', '\t']);
    expect(view.state.doc.toString()).toBe('\t\t\thello');
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

  it('editing: removing one leading whitespace character reshapes the groups (4 -> 3 spaces: [2,2] -> [2] + plain remainder)', () => {
    const view = mountView('    hello');
    expect(indentSpans(nthLine(view, 0)).map((s) => s.textContent)).toEqual(['  ', '  ']);

    view.dispatch({ changes: { from: 0, to: 1, insert: '' } }); // remove one leading space
    expect(indentSpans(nthLine(view, 0)).map((s) => s.textContent)).toEqual(['  ']);
    expect(view.state.doc.toString()).toBe('   hello');
  });

  it('editing: adding one character to a plain-remainder line completes a new group (3 -> 4 spaces: [2] -> [2,2])', () => {
    const view = mountView('   hello');
    expect(indentSpans(nthLine(view, 0)).map((s) => s.textContent)).toEqual(['  ']);

    view.dispatch({ changes: { from: 0, to: 0, insert: ' ' } }); // add one more leading space
    expect(indentSpans(nthLine(view, 0)).map((s) => s.textContent)).toEqual(['  ', '  ']);
    expect(view.state.doc.toString()).toBe('    hello');
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

  describe('indent-token visual-width parity: every .cm-indent (space run or single tab) renders at one indentUnit width', () => {
    // Model: a complete run of `indentUnit.length` space characters is one
    // token; a single tab character is *always* its own token, on its
    // own -- never merged with another tab, never split, never counted
    // as more than one token no matter how wide `tabSize` would
    // otherwise render it. `state.doc` and `state.tabSize` are never
    // touched; only `indentUnit` (read live) determines how wide one
    // token should be. Width parity between a tab-token and a
    // space-token mark is asserted here as "the tab's mark carries a
    // `tab-size` CSS override equal to indentUnit.length" -- the
    // DOM-observable proxy for it, since jsdom has no layout engine and
    // can't measure actual rendered pixel width; true visual parity
    // still needs a real-browser check.

    it('2-space indentUnit (default): "  " and "\\t" each produce exactly one .cm-indent, both effectively 2-wide', () => {
      const spaceView = mountView('  Hello');
      const tabView = mountView('\tHello');

      const spaceSpans = indentSpans(nthLine(spaceView, 0));
      const tabSpans = indentSpans(nthLine(tabView, 0));

      expect(spaceSpans).toHaveLength(1);
      expect(spaceSpans[0]!.textContent).toBe('  ');

      expect(tabSpans).toHaveLength(1);
      expect(tabSpans[0]!.textContent).toBe('\t');
      expect(tabSpans[0]!.style.getPropertyValue('tab-size')).toBe('2');

      expect(tabView.state.doc.toString()).toBe('\tHello');
    });

    it('4-space indentUnit: "    " and "\\t" each produce exactly one .cm-indent, both effectively 4-wide', () => {
      const fourSpaceUnit = [indentUnit.of('    ')];
      const spaceView = mountView('    Hello', fourSpaceUnit);
      const tabView = mountView('\tHello', fourSpaceUnit);

      const spaceSpans = indentSpans(nthLine(spaceView, 0));
      const tabSpans = indentSpans(nthLine(tabView, 0));

      expect(spaceSpans).toHaveLength(1);
      expect(spaceSpans[0]!.textContent).toBe('    ');

      expect(tabSpans).toHaveLength(1);
      expect(tabSpans[0]!.textContent).toBe('\t');
      expect(tabSpans[0]!.style.getPropertyValue('tab-size')).toBe('4');
    });

    it('multiple tabs: "\\t\\t" -> two separate .cm-indent marks, never merged, each width-matched to indentUnit', () => {
      const view = mountView('\t\tHello');
      const spans = indentSpans(nthLine(view, 0));
      expect(spans).toHaveLength(2);
      expect(spans.map((s) => s.textContent)).toEqual(['\t', '\t']);
      expect(spans.every((s) => s.style.getPropertyValue('tab-size') === '2')).toBe(true);
      expect(view.state.doc.toString()).toBe('\t\tHello');
    });

    it('multiple space indents: "      " (6 spaces, 2-space unit) -> three separate .cm-indent marks', () => {
      const view = mountView('      Hello');
      const spans = indentSpans(nthLine(view, 0));
      expect(spans).toHaveLength(3);
      expect(spans.map((s) => s.textContent)).toEqual(['  ', '  ', '  ']);
    });

    it('mixed tabs and spaces: "\\t  \\t" -> tab, complete 2-space run, tab -- three separate marks in document order', () => {
      const view = mountView('\t  \tHello');
      const spans = indentSpans(nthLine(view, 0));
      expect(spans).toHaveLength(3);
      expect(spans.map((s) => s.textContent)).toEqual(['\t', '  ', '\t']);
      expect(spans.map((s) => s.style.getPropertyValue('tab-size'))).toEqual(['2', '', '2']);
      expect(view.state.doc.toString()).toBe('\t  \tHello');
    });

    it('incomplete trailing indentation: "\\t " (tab + 1 trailing space) -> only the tab is decorated; the lone trailing space stays plain', () => {
      const view = mountView('\t Hello');
      const line = nthLine(view, 0);
      const spans = indentSpans(line);
      expect(spans).toHaveLength(1);
      expect(spans[0]!.textContent).toBe('\t');
      expect(line.textContent).toBe('\t Hello');
      expect(view.state.doc.toString()).toBe('\t Hello');
    });

    it('incomplete indentation before a tab: " \\t" (1 leading space, then a tab) -> the lone space stays plain; the tab still gets its own mark', () => {
      const view = mountView(' \tHello');
      const line = nthLine(view, 0);
      const spans = indentSpans(line);
      expect(spans).toHaveLength(1);
      expect(spans[0]!.textContent).toBe('\t');
      expect(line.textContent).toBe(' \tHello');
      expect(view.state.doc.toString()).toBe(' \tHello');
    });

    it('an incomplete space run sandwiched between two tabs: "\\t \\tHello" -> both tabs get their own mark; the lone middle space stays unmarked', () => {
      const view = mountView('\t \tHello');
      const line = nthLine(view, 0);
      const spans = indentSpans(line);
      expect(spans).toHaveLength(2);
      expect(spans.map((s) => s.textContent)).toEqual(['\t', '\t']);
      // Exact positions: first tab at [0,1), the lone space at [1,2) stays
      // plain (unmarked -- neither absorbed into the preceding tab's mark
      // nor into the following one), second tab at [2,3).
      expect(view.state.doc.sliceString(0, 1)).toBe('\t');
      expect(view.state.doc.sliceString(1, 2)).toBe(' ');
      expect(view.state.doc.sliceString(2, 3)).toBe('\t');
      expect(line.textContent).toBe('\t \tHello');
      expect(view.state.doc.toString()).toBe('\t \tHello');
    });
  });

  describe('caret-geometry anchor (IndentEndAnchorWidget): added only when line.to sits exactly at the last mark\'s end', () => {
    function anchor(line: HTMLElement): HTMLElement | null {
      return line.querySelector('.cm-indent-end-anchor');
    }

    it('a whitespace-only line (one indent unit) gets the anchor', () => {
      const view = mountView('  ');
      const line = nthLine(view, 0);
      expect(indentSpans(line)).toHaveLength(1);
      expect(anchor(line)).not.toBeNull();
      expect(view.state.doc.toString()).toBe('  ');
    });

    it('a whitespace-only line (multiple indent units) gets the anchor, placed after the last mark', () => {
      const view = mountView('    ');
      const line = nthLine(view, 0);
      const spans = indentSpans(line);
      expect(spans).toHaveLength(2);
      const anchorEl = anchor(line);
      expect(anchorEl).not.toBeNull();
      // Anchor comes after both marks in document order (CM6 also inserts
      // its own `cm-widgetBuffer`/`<br>` accessories around the widget --
      // see IndentEndAnchorWidget.ts's doc comment -- so it isn't
      // necessarily lastElementChild).
      const position = spans[1]!.compareDocumentPosition(anchorEl!);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('a whitespace-only line made of tabs gets the anchor', () => {
      const view = mountView('\t\t');
      const line = nthLine(view, 0);
      expect(indentSpans(line)).toHaveLength(2);
      expect(anchor(line)).not.toBeNull();
    });

    it('a line with real content after the indentation does NOT get the anchor', () => {
      const view = mountView('    hello');
      const line = nthLine(view, 0);
      expect(indentSpans(line)).toHaveLength(2);
      expect(anchor(line)).toBeNull();
    });

    it('a line with no leading whitespace at all does NOT get the anchor', () => {
      const view = mountView('hello');
      expect(anchor(nthLine(view, 0))).toBeNull();
    });

    it('a whitespace-only line with an incomplete trailing partial run does NOT get the anchor (the stray remainder, not a mark, is line.to)', () => {
      const view = mountView('   '); // 1 full 2-space unit + 1 stray trailing space
      const line = nthLine(view, 0);
      expect(indentSpans(line)).toHaveLength(1);
      expect(anchor(line)).toBeNull();
    });

    it('appears on an inherited-indent empty line after Enter, driven by document state -- not the Enter key itself', () => {
      // Same end state as pressing Enter with 4-space indentation active:
      // constructing the document directly proves the anchor's gate is
      // purely a function of `state.doc`/decorations, not a keymap.
      const view = mountView('Hello world\n    ');
      const line = nthLine(view, 1);
      expect(indentSpans(line)).toHaveLength(2);
      expect(anchor(line)).not.toBeNull();
    });

    it('the anchor disappears the instant real text follows it (typing self-corrects, matching the pre-fix behavior)', () => {
      const view = mountView('    ');
      expect(anchor(nthLine(view, 0))).not.toBeNull();

      view.dispatch({ changes: { from: 4, to: 4, insert: 'x' } });
      const line = nthLine(view, 0);
      expect(anchor(line)).toBeNull();
      expect(indentSpans(line)).toHaveLength(2);
      expect(view.state.doc.toString()).toBe('    x');
    });

    it('multiple consecutive empty indented lines each get their own anchor', () => {
      const view = mountView('    \n    \n    ');
      for (let i = 0; i < 3; i++) {
        const line = nthLine(view, i);
        expect(indentSpans(line)).toHaveLength(2);
        expect(anchor(line)).not.toBeNull();
      }
    });

    it('the anchor consumes zero document length and never changes stored text', () => {
      const before = '    ';
      const view = mountView(before);
      expect(view.state.doc.toString()).toBe(before);
      expect(view.state.doc.length).toBe(4);
    });
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
      expect(indentSpans(nthLine(view, 2)).map((s) => s.textContent)).toEqual(['\t', '\t']);
    });
  });
});
