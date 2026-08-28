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

function indentTokens(line: HTMLElement): HTMLElement[] {
  return Array.from(line.querySelectorAll('.cm-indent-token'));
}

/**
 * jsdom has no layout engine — it cannot measure real pixel geometry, so
 * this suite verifies only what's DOM-observable without layout: token
 * count/placement and that `state.doc` never changes. The actual reason
 * for this file's `Decoration.replace` approach — that `coordsAtPos` and
 * `posAtCoords` both resolve against each token's real rendered box —
 * needs a real browser and was verified there directly (see
 * docs/editor-architecture-decisions.md's indentation-rendering entry);
 * it is not, and cannot be, re-asserted here.
 */
describe('leadingIndentDecoration (grouped by the current indentUnit facet)', () => {
  it('0. "hello" -> no tokens', () => {
    const view = mountView('hello');
    const line = nthLine(view, 0);
    expect(indentTokens(line)).toHaveLength(0);
    expect(line.textContent).toBe('hello');
    expect(view.state.doc.toString()).toBe('hello');
  });

  it('1. " hello" (1 space, less than one full unit) -> 0 tokens, the space stays ordinary (visible) text', () => {
    const view = mountView(' hello');
    const line = nthLine(view, 0);
    expect(indentTokens(line)).toHaveLength(0);
    expect(line.textContent).toBe(' hello');
    expect(view.state.doc.toString()).toBe(' hello');
  });

  it('2. "  hello" (2 spaces, exactly one unit) -> 1 token; the real spaces are replaced out of the rendered text', () => {
    const view = mountView('  hello');
    const line = nthLine(view, 0);
    const tokens = indentTokens(line);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.textContent).toBe('');
    expect(line.textContent).toBe('hello');
    // The document is unaffected -- only the rendering hides the token.
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('3. "   hello" (3 spaces: 1 full unit + 1 incomplete remainder) -> 1 token; the remainder stays ordinary text', () => {
    const view = mountView('   hello');
    const line = nthLine(view, 0);
    const tokens = indentTokens(line);
    expect(tokens).toHaveLength(1);
    expect(line.textContent).toBe(' hello'); // token -> '', remainder space stays real text
    expect(view.state.doc.toString()).toBe('   hello');
  });

  it('4. "    hello" (4 spaces: 2 full units) -> 2 tokens', () => {
    const view = mountView('    hello');
    const line = nthLine(view, 0);
    expect(indentTokens(line)).toHaveLength(2);
    expect(line.textContent).toBe('hello');
    expect(view.state.doc.toString()).toBe('    hello');
  });

  it('5. "     hello" (5 spaces: 2 full units + 1 incomplete remainder) -> 2 tokens; the remainder stays ordinary text', () => {
    const view = mountView('     hello');
    const line = nthLine(view, 0);
    expect(indentTokens(line)).toHaveLength(2);
    expect(line.textContent).toBe(' hello');
    expect(view.state.doc.toString()).toBe('     hello');
  });

  it('6. "      hello" (6 spaces: 3 full units) -> 3 tokens', () => {
    const view = mountView('      hello');
    const line = nthLine(view, 0);
    expect(indentTokens(line)).toHaveLength(3);
    expect(line.textContent).toBe('hello');
  });

  it('each tab is always its own indent token, never merged with another tab', () => {
    const view = mountView('\t\t\thello'); // 3 tabs -> 3 separate one-character tokens
    const line = nthLine(view, 0);
    expect(indentTokens(line)).toHaveLength(3);
    expect(line.textContent).toBe('hello');
    expect(view.state.doc.toString()).toBe('\t\t\thello');
  });

  it('reads the actual indentUnit facet rather than hardcoding a width: a 4-character unit groups differently', () => {
    const view = mountView('    hello', [indentUnit.of('    ')]); // 4-space unit
    const line = nthLine(view, 0);
    // Same 4 leading characters as test 4 above, but now exactly 1 unit
    // wide instead of 2 -- proves the grouping follows the facet, not a
    // hardcoded width.
    expect(indentTokens(line)).toHaveLength(1);
    expect(line.textContent).toBe('hello');
  });

  it('reads the actual indentUnit facet: a 1-character unit groups every character separately', () => {
    const view = mountView('   hello', [indentUnit.of(' ')]); // 1-space unit
    const line = nthLine(view, 0);
    expect(indentTokens(line)).toHaveLength(3);
    expect(line.textContent).toBe('hello');
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

  it('editing: removing one leading whitespace character reshapes the groups (4 -> 3 spaces: 2 tokens -> 1 token + plain remainder)', () => {
    const view = mountView('    hello');
    expect(indentTokens(nthLine(view, 0))).toHaveLength(2);

    view.dispatch({ changes: { from: 0, to: 1, insert: '' } }); // remove one leading space
    expect(indentTokens(nthLine(view, 0))).toHaveLength(1);
    expect(nthLine(view, 0).textContent).toBe(' hello');
    expect(view.state.doc.toString()).toBe('   hello');
  });

  it('editing: adding one character to a plain-remainder line completes a new group (3 -> 4 spaces: 1 token -> 2 tokens)', () => {
    const view = mountView('   hello');
    expect(indentTokens(nthLine(view, 0))).toHaveLength(1);

    view.dispatch({ changes: { from: 0, to: 0, insert: ' ' } }); // add one more leading space
    expect(indentTokens(nthLine(view, 0))).toHaveLength(2);
    expect(nthLine(view, 0).textContent).toBe('hello');
    expect(view.state.doc.toString()).toBe('    hello');
  });

  it('editing: adding leading whitespace mid-document updates the groups', () => {
    const view = mountView('hello');
    expect(indentTokens(nthLine(view, 0))).toHaveLength(0);

    view.dispatch({ changes: { from: 0, to: 0, insert: '  ' } });
    expect(indentTokens(nthLine(view, 0))).toHaveLength(1);
    expect(view.state.doc.toString()).toBe('  hello');
  });

  it('editing: removing all leading whitespace leaves zero decorations', () => {
    const view = mountView('   hello');
    view.dispatch({ changes: { from: 0, to: 3, insert: '' } });
    expect(indentTokens(nthLine(view, 0))).toHaveLength(0);
    expect(view.state.doc.toString()).toBe('hello');
  });

  describe('space-run tokens and tab tokens render identically (no per-content styling needed any more)', () => {
    // With Decoration.mark, a tab token needed its own `tab-size` CSS
    // override to keep its real glyph narrow inside the wider box (see
    // this file's git history). With Decoration.replace, both kinds
    // render as the same empty, content-less `.cm-indent-token` element
    // -- visual parity is now a structural guarantee of one shared CSS
    // rule, not something achieved per-token. jsdom can't measure real
    // pixel width, but it CAN confirm both render the exact same markup.

    it('2-space indentUnit (default): "  " and "\\t" each produce exactly one identical, empty .cm-indent-token', () => {
      const spaceView = mountView('  Hello');
      const tabView = mountView('\tHello');

      const spaceTokens = indentTokens(nthLine(spaceView, 0));
      const tabTokens = indentTokens(nthLine(tabView, 0));

      expect(spaceTokens).toHaveLength(1);
      expect(spaceTokens[0]!.outerHTML).toBe('<span class="cm-indent-token"></span>');

      expect(tabTokens).toHaveLength(1);
      expect(tabTokens[0]!.outerHTML).toBe('<span class="cm-indent-token"></span>');

      expect(tabView.state.doc.toString()).toBe('\tHello');
    });

    it('multiple tabs: "\\t\\t" -> two separate tokens, never merged', () => {
      const view = mountView('\t\tHello');
      expect(indentTokens(nthLine(view, 0))).toHaveLength(2);
      expect(view.state.doc.toString()).toBe('\t\tHello');
    });

    it('multiple space indents: "      " (6 spaces, 2-space unit) -> three separate tokens', () => {
      const view = mountView('      Hello');
      expect(indentTokens(nthLine(view, 0))).toHaveLength(3);
    });

    it('mixed tabs and spaces: "\\t  \\t" -> tab, complete 2-space run, tab -- three separate tokens in document order', () => {
      const view = mountView('\t  \tHello');
      expect(indentTokens(nthLine(view, 0))).toHaveLength(3);
      expect(view.state.doc.toString()).toBe('\t  \tHello');
    });

    it('incomplete trailing indentation: "\\t " (tab + 1 trailing space) -> only the tab is replaced; the lone trailing space stays visible', () => {
      const view = mountView('\t Hello');
      const line = nthLine(view, 0);
      expect(indentTokens(line)).toHaveLength(1);
      expect(line.textContent).toBe(' Hello'); // token -> '', leftover space + "Hello"
      expect(view.state.doc.toString()).toBe('\t Hello');
    });

    it('incomplete indentation before a tab: " \\t" (1 leading space, then a tab) -> the lone space stays visible; the tab still becomes its own token', () => {
      const view = mountView(' \tHello');
      const line = nthLine(view, 0);
      expect(indentTokens(line)).toHaveLength(1);
      expect(line.textContent).toBe(' Hello');
      expect(view.state.doc.toString()).toBe(' \tHello');
    });

    it('an incomplete space run sandwiched between two tabs: "\\t \\tHello" -> both tabs become tokens; the lone middle space stays visible', () => {
      const view = mountView('\t \tHello');
      const line = nthLine(view, 0);
      expect(indentTokens(line)).toHaveLength(2);
      expect(line.textContent).toBe(' Hello'); // both tabs -> '', middle space stays, then "Hello"
      expect(view.state.doc.sliceString(0, 1)).toBe('\t');
      expect(view.state.doc.sliceString(1, 2)).toBe(' ');
      expect(view.state.doc.sliceString(2, 3)).toBe('\t');
      expect(view.state.doc.toString()).toBe('\t \tHello');
    });
  });

  describe('indentation-only lines (no trailing content) -- the case the previous IndentEndAnchorWidget existed to patch', () => {
    // With Decoration.replace, there is no special-cased end-of-line
    // anchor any more: every token, including the line's last one,
    // already IS a real, independently measurable DOM box. This suite
    // only confirms the DOM-observable half (token count, fully-hidden
    // rendered text, unchanged state.doc) -- the actual claim (coordsAtPos
    // and posAtCoords both resolve against that box) was verified in a
    // real browser, not here.

    it('a whitespace-only line (one indent unit) renders as a single token with empty text content', () => {
      const view = mountView('  ');
      const line = nthLine(view, 0);
      expect(indentTokens(line)).toHaveLength(1);
      expect(line.textContent).toBe('');
      expect(view.state.doc.toString()).toBe('  ');
    });

    it('a whitespace-only line (multiple indent units) renders as one token per unit', () => {
      const view = mountView('    ');
      const line = nthLine(view, 0);
      expect(indentTokens(line)).toHaveLength(2);
      expect(line.textContent).toBe('');
    });

    it('a whitespace-only line made of tabs renders one token per tab', () => {
      const view = mountView('\t\t');
      const line = nthLine(view, 0);
      expect(indentTokens(line)).toHaveLength(2);
      expect(line.textContent).toBe('');
    });

    it('a whitespace-only line with an incomplete trailing partial run leaves that remainder visible', () => {
      const view = mountView('   '); // 1 full 2-space unit + 1 stray trailing space
      const line = nthLine(view, 0);
      expect(indentTokens(line)).toHaveLength(1);
      expect(line.textContent).toBe(' ');
    });

    it('appears on an inherited-indent empty line after Enter, driven by document state -- not the Enter key itself', () => {
      // Same end state as pressing Enter with 4-space indentation active:
      // constructing the document directly proves this is purely a
      // function of state.doc/decorations, not a keymap.
      const view = mountView('Hello world\n    ');
      const line = nthLine(view, 1);
      expect(indentTokens(line)).toHaveLength(2);
      expect(line.textContent).toBe('');
    });

    it('the tokens update the instant real text follows them', () => {
      const view = mountView('    ');
      expect(nthLine(view, 0).textContent).toBe('');

      view.dispatch({ changes: { from: 4, to: 4, insert: 'x' } });
      const line = nthLine(view, 0);
      expect(indentTokens(line)).toHaveLength(2);
      expect(line.textContent).toBe('x');
      expect(view.state.doc.toString()).toBe('    x');
    });

    it('multiple consecutive empty indented lines each get their own tokens', () => {
      const view = mountView('    \n    \n    ');
      for (let i = 0; i < 3; i++) {
        const line = nthLine(view, i);
        expect(indentTokens(line)).toHaveLength(2);
        expect(line.textContent).toBe('');
      }
    });

    it('the replaced tokens consume zero visible text but never change the stored document', () => {
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
      expect(indentTokens(nthLine(view, 0))).toHaveLength(0);
      expect(indentTokens(nthLine(view, 1))).toHaveLength(1);
      expect(indentTokens(nthLine(view, 2))).toHaveLength(2);
    });
  });

  describe('cursor movement through a replaced token is not atomic', () => {
    // Decoration.replace does not, on its own, make CM6 treat a range as
    // one atomic cursor-movement unit -- only an explicit
    // EditorView.atomicRanges facet entry does that, and none is
    // registered by this file. Confirmed directly here at the
    // state.selection level (jsdom can't verify the *visual* caret
    // position mid-token; that was checked in a real browser).
    it('ArrowLeft-equivalent (moveByChar) still visits every character position inside a token, not just its edges', () => {
      const view = mountView('    '); // 2 tokens, 4 real characters
      view.dispatch({ selection: { anchor: 4 } });
      const positions = [4];
      let range = view.state.selection.main;
      for (let i = 0; i < 4; i++) {
        range = view.moveByChar(range, false);
        positions.push(range.head);
      }
      expect(positions).toEqual([4, 3, 2, 1, 0]);
    });
  });
});
