// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentMore } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { leadingIndentDecoration } from './leadingIndentDecoration';
import { refreshMarkdownIndent } from '../../../../../design-system/markdownIndent';

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

function indentTokens(line: HTMLElement): HTMLElement[] {
  return Array.from(line.querySelectorAll('.cm-indent-token'));
}

function widths(line: HTMLElement): string[] {
  return indentTokens(line).map((el) => el.style.width);
}

/**
 * Set up the `--md-indent` CSS custom property for tests.
 * Tests run in jsdom without actual stylesheets, so this must be set
 * inline on the root element for getComputedStyle() to find it.
 */
function setupDesignTokens(): void {
  document.documentElement.style.setProperty('--md-indent', '24px');
  // Refresh the cached value so subsequent calls read the new token.
  refreshMarkdownIndent();
}

/**
 * `line.textContent` includes each widget's invisible non-breaking-space
 * placeholder (see IndentTokenWidget.ts's doc comment on why it's
 * there -- real, font-metric-driven vertical geometry). These tests care
 * about the real, visible trailing text, not that implementation detail,
 * so this strips it before asserting.
 */
function visibleText(line: HTMLElement): string {
  return (line.textContent ?? '').replace(/ /g, '');
}

/**
 * jsdom has no layout engine — it cannot measure real pixel geometry, so
 * this suite verifies only what's DOM-observable without layout: widget
 * count/width/placement and that `state.doc` never changes. The actual
 * claim this architecture rests on — that `coordsAtPos`/`posAtCoords`
 * resolve every logical position correctly, and that indentation and
 * text share the same vertical caret geometry — needs a real browser and
 * was verified there directly (see docs/editor-architecture-decisions.md's
 * indentation-rendering entry); it is not, and cannot be, re-asserted
 * here.
 */
describe('leadingIndentDecoration (one widget per leading whitespace character)', () => {
  beforeEach(() => {
    setupDesignTokens();
  });

  it('"hello" -> no widgets', () => {
    const view = mountView('hello');
    const line = nthLine(view, 0);
    expect(indentTokens(line)).toHaveLength(0);
    expect(visibleText(line)).toBe('hello');
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('" hello" (1 space) -> exactly one 6px widget, not treated as "incomplete"', () => {
    const view = mountView(' hello');
    const line = nthLine(view, 0);
    expect(widths(line)).toEqual(['6px']);
    expect(visibleText(line)).toBe('hello');
    expect(view.state.doc.toString()).toBe(' hello');
  });

  it('"  hello" (2 spaces) -> two independent 6px widgets, not one grouped 12px widget', () => {
    const view = mountView('  hello');
    const line = nthLine(view, 0);
    expect(widths(line)).toEqual(['6px', '6px']);
    expect(visibleText(line)).toBe('hello');
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('"   hello" (3 spaces) -> three 6px widgets', () => {
    const view = mountView('   hello');
    expect(widths(nthLine(view, 0))).toEqual(['6px', '6px', '6px']);
  });

  it('"    hello" (4 spaces) -> four 6px widgets', () => {
    const view = mountView('    hello');
    expect(widths(nthLine(view, 0))).toEqual(['6px', '6px', '6px', '6px']);
  });

  it('"\\thello" (one tab) -> one 24px widget', () => {
    const view = mountView('\thello');
    const line = nthLine(view, 0);
    expect(widths(line)).toEqual(['24px']);
    expect(visibleText(line)).toBe('hello');
    expect(view.state.doc.toString()).toBe('\thello');
  });

  it('"\\t\\thello" (two tabs) -> two 24px widgets', () => {
    const view = mountView('\t\thello');
    expect(widths(nthLine(view, 0))).toEqual(['24px', '24px']);
  });

  it('" \\thello" (space then tab) -> 6px then 24px, both replaced -- no "incomplete run" exception any more', () => {
    const view = mountView(' \thello');
    const line = nthLine(view, 0);
    expect(widths(line)).toEqual(['6px', '24px']);
    expect(visibleText(line)).toBe('hello');
    expect(view.state.doc.toString()).toBe(' \thello');
  });

  it('"  \\thello" (2 spaces then a tab) -> 6px, 6px, 24px', () => {
    const view = mountView('  \thello');
    expect(widths(nthLine(view, 0))).toEqual(['6px', '6px', '24px']);
  });

  it('"\\t  hello" (tab then 2 spaces) -> 24px, 6px, 6px', () => {
    const view = mountView('\t  hello');
    expect(widths(nthLine(view, 0))).toEqual(['24px', '6px', '6px']);
  });

  it('"  \\t  hello" (2 spaces, tab, 2 spaces) -> 6px, 6px, 24px, 6px, 6px', () => {
    const view = mountView('  \t  hello');
    expect(widths(nthLine(view, 0))).toEqual(['6px', '6px', '24px', '6px', '6px']);
  });

  it('Tab-produced whitespace and manually typed/pasted identical whitespace render identically', () => {
    // Path A: one Tab press (Clutter's Tab command inserts two real spaces).
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

  describe('editing recomputes decorations correctly', () => {
    it('removing one leading space (4 -> 3) removes exactly one visual widget', () => {
      const view = mountView('    hello');
      expect(indentTokens(nthLine(view, 0))).toHaveLength(4);

      view.dispatch({ changes: { from: 0, to: 1, insert: '' } });
      expect(indentTokens(nthLine(view, 0))).toHaveLength(3);
      expect(visibleText(nthLine(view, 0))).toBe('hello');
      expect(view.state.doc.toString()).toBe('   hello');
    });

    it('adding one leading space (3 -> 4) adds exactly one visual widget', () => {
      const view = mountView('   hello');
      expect(indentTokens(nthLine(view, 0))).toHaveLength(3);

      view.dispatch({ changes: { from: 0, to: 0, insert: ' ' } });
      expect(indentTokens(nthLine(view, 0))).toHaveLength(4);
      expect(visibleText(nthLine(view, 0))).toBe('hello');
      expect(view.state.doc.toString()).toBe('    hello');
    });

    it('adding leading whitespace mid-document updates the widgets', () => {
      const view = mountView('hello');
      expect(indentTokens(nthLine(view, 0))).toHaveLength(0);

      view.dispatch({ changes: { from: 0, to: 0, insert: '  ' } });
      expect(indentTokens(nthLine(view, 0))).toHaveLength(2);
      expect(view.state.doc.toString()).toBe('  hello');
    });

    it('removing all leading whitespace leaves zero widgets', () => {
      const view = mountView('   hello');
      view.dispatch({ changes: { from: 0, to: 3, insert: '' } });
      expect(indentTokens(nthLine(view, 0))).toHaveLength(0);
      expect(view.state.doc.toString()).toBe('hello');
    });

    it('Backspace-equivalent removing a tab leaves the remaining spaces correctly widgeted', () => {
      const view = mountView('  \thello'); // 2 spaces + tab
      expect(widths(nthLine(view, 0))).toEqual(['6px', '6px', '24px']);
      view.dispatch({ changes: { from: 2, to: 3, insert: '' } }); // remove the tab
      expect(widths(nthLine(view, 0))).toEqual(['6px', '6px']);
      expect(view.state.doc.toString()).toBe('  hello');
    });
  });

  describe('indentation-only lines (no trailing content)', () => {
    it('a whitespace-only line (one space) renders as a single 6px widget with empty text content', () => {
      const view = mountView(' ');
      const line = nthLine(view, 0);
      expect(widths(line)).toEqual(['6px']);
      expect(visibleText(line)).toBe('');
      expect(view.state.doc.toString()).toBe(' ');
    });

    it('a whitespace-only line (4 spaces) renders as four 6px widgets', () => {
      const view = mountView('    ');
      const line = nthLine(view, 0);
      expect(widths(line)).toEqual(['6px', '6px', '6px', '6px']);
      expect(visibleText(line)).toBe('');
    });

    it('a whitespace-only line made of tabs renders one 24px widget per tab', () => {
      const view = mountView('\t\t');
      const line = nthLine(view, 0);
      expect(widths(line)).toEqual(['24px', '24px']);
      expect(visibleText(line)).toBe('');
    });

    it('appears on an inherited-indent empty line after Enter, driven by document state -- not the Enter key itself', () => {
      const view = mountView('Hello world\n    ');
      const line = nthLine(view, 1);
      expect(widths(line)).toEqual(['6px', '6px', '6px', '6px']);
      expect(visibleText(line)).toBe('');
    });

    it('the widgets update the instant real text follows them', () => {
      const view = mountView('    ');
      expect(visibleText(nthLine(view, 0))).toBe('');

      view.dispatch({ changes: { from: 4, to: 4, insert: 'x' } });
      const line = nthLine(view, 0);
      expect(widths(line)).toEqual(['6px', '6px', '6px', '6px']);
      expect(visibleText(line)).toBe('x');
      expect(view.state.doc.toString()).toBe('    x');
    });

    it('multiple consecutive empty indented lines each get their own widgets', () => {
      const view = mountView('    \n    \n    ');
      for (let i = 0; i < 3; i++) {
        const line = nthLine(view, i);
        expect(widths(line)).toEqual(['6px', '6px', '6px', '6px']);
        expect(visibleText(line)).toBe('');
      }
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

    it('multi-line: each physical line independently derives its own widgets', () => {
      const view = mountView('no indent\n  two spaces\n\t\ttwo tabs');
      expect(indentTokens(nthLine(view, 0))).toHaveLength(0);
      expect(widths(nthLine(view, 1))).toEqual(['6px', '6px']);
      expect(widths(nthLine(view, 2))).toEqual(['24px', '24px']);
    });
  });

  describe('cursor movement through indentation is character-by-character, never atomic', () => {
    it('ArrowLeft-equivalent (moveByChar) visits every leading-whitespace position, one at a time', () => {
      const view = mountView('    '); // 4 real characters, 4 widgets
      view.dispatch({ selection: { anchor: 4 } });
      const positions = [4];
      let range = view.state.selection.main;
      for (let i = 0; i < 4; i++) {
        range = view.moveByChar(range, false);
        positions.push(range.head);
      }
      expect(positions).toEqual([4, 3, 2, 1, 0]);
    });

    it('same for a run of tabs', () => {
      const view = mountView('\t\t\t');
      view.dispatch({ selection: { anchor: 3 } });
      const positions = [3];
      let range = view.state.selection.main;
      for (let i = 0; i < 3; i++) {
        range = view.moveByChar(range, false);
        positions.push(range.head);
      }
      expect(positions).toEqual([3, 2, 1, 0]);
    });
  });

  /**
   * Canonical indentation metrics: `SPACE_PX` is one quarter of the
   * indentation level (derived from `--md-indent` in the design token
   * system), so that 4 spaces (one level) renders at the same width as
   * one tab. This is the permanent regression lock for the exact canonical
   * pixel table this decision specifies — total rendered width is always
   * `N * (INDENT_LEVEL / 4)`, for any N, complete level or not, since this
   * architecture has no "completed group" concept at all (confirmed by the
   * "not grouped" tests above).
   */
  describe('canonical pixel table: total width is always N * 6 (SPACE_PX), complete level or not', () => {
    it.each([
      [1, 6],
      [2, 12],
      [3, 18],
      [4, 24], // one full indentation level
      [5, 30],
      [6, 36],
      [7, 42],
      [8, 48], // two full indentation levels
    ])('%i leading space(s) -> total width %ipx', (spaces, totalPx) => {
      const view = mountView(`${' '.repeat(spaces)}Text`);
      const line = nthLine(view, 0);
      const totalWidth = widths(line).reduce((sum, w) => sum + parseInt(w, 10), 0);
      expect(totalWidth).toBe(totalPx);
      // Every widget is individually 6px -- confirms this is N independent
      // widgets, not fewer, wider "completed level" tokens.
      expect(widths(line)).toEqual(Array(spaces).fill('6px'));
    });

    it('4 spaces (one level) renders at the same total width as one literal tab', () => {
      const fourSpaces = mountView('    Text');
      const oneTab = mountView('\tText');
      const fourSpacesWidth = widths(nthLine(fourSpaces, 0)).reduce((sum, w) => sum + parseInt(w, 10), 0);
      const tabWidth = widths(nthLine(oneTab, 0)).reduce((sum, w) => sum + parseInt(w, 10), 0);
      expect(fourSpacesWidth).toBe(24);
      expect(tabWidth).toBe(24);
      expect(fourSpacesWidth).toBe(tabWidth);
    });
  });

  /**
   * Product decision (2026-08-30): this rendering calibration change must
   * never be confused with, or accidentally coupled to, indentation
   * *behavior* — the Spacebar remains completely literal. Typing N spaces
   * must produce exactly N space characters in `state.doc`, never
   * rounded, completed, or normalized toward a multiple of 4. This suite
   * only ever asserts on rendered widget width; every test in it also
   * asserts the underlying document text is untouched, but this block
   * makes that guarantee explicit as its own standalone contract.
   */
  describe('Spacebar remains completely literal: document text is never rounded or auto-completed toward a multiple of 4', () => {
    it.each([1, 2, 3, 5, 6, 7, 9, 11])(
      'typing %i literal spaces produces exactly that many characters in state.doc, never a multiple of 4',
      (n) => {
        const view = mountView(`${' '.repeat(n)}Text`);
        const leadingInDoc = view.state.doc.toString().length - view.state.doc.toString().trimStart().length;
        expect(leadingInDoc).toBe(n); // exactly N, not rounded up or down to a 4-multiple
      }
    );

    it('a genuinely incomplete run (3 spaces) is rendered, not silently completed to 4 in the DOM or the document', () => {
      const view = mountView('   Text'); // exactly 3 spaces
      const line = nthLine(view, 0);
      expect(widths(line)).toHaveLength(3); // not 4 -- no auto-completion
      expect(view.state.doc.toString()).toBe('   Text'); // still exactly 3 in the document
    });
  });
});
