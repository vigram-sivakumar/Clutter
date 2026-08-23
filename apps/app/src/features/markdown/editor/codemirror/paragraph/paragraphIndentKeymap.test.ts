// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { dedentParagraph, indentParagraph } from './paragraphIndentKeymap';

function mountView(doc: string, anchor: number, head = anchor): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

describe('indentParagraph', () => {
  it('indents a single-line paragraph by one indent unit', () => {
    const view = mountView('Paragraph text', 3);

    const handled = indentParagraph(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('  Paragraph text');
  });

  it('a bare cursor on any single line of a multi-line paragraph indents only that line — not the whole paragraph', () => {
    // Paragraph indentation is plain text editing (CM6's own indentMore),
    // not the structural subtree operation list indentation is — an
    // unselected caret only ever touches its own line, exactly like it
    // would in any ordinary text editor. This is the deliberate contrast
    // with `listIndentKeymap.ts`'s subtree tests: nothing here should
    // pull sibling lines along just because they belong to the same
    // Paragraph node.
    const doc = 'First line\nsecond line\nthird line';
    const cases: [string, string][] = [
      ['First', '  First line\nsecond line\nthird line'],
      ['second', 'First line\n  second line\nthird line'],
      ['third', 'First line\nsecond line\n  third line'],
    ];
    for (const [needle, expected] of cases) {
      const view = mountView(doc, doc.indexOf(needle));
      const handled = indentParagraph(view);
      expect(handled).toBe(true);
      expect(view.state.doc.toString()).toBe(expected);
    }
  });

  it('multi-line selection indents every selected line', () => {
    const doc = 'First line\nsecond line\nthird line';
    const view = mountView(doc, 0, doc.length);

    const handled = indentParagraph(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('  First line\n  second line\n  third line');
  });

  it('a partial-line selection still indents the full line(s) it touches', () => {
    const doc = 'First line\nsecond line';
    const view = mountView(doc, 2, doc.indexOf('second') + 3); // partway into line 1 through partway into line 2

    const handled = indentParagraph(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('  First line\n  second line');
  });

  it('repeated Tab accumulates one indent unit per press', () => {
    const view = mountView('Paragraph', 0);

    indentParagraph(view);
    expect(view.state.doc.toString()).toBe('  Paragraph');

    view.dispatch({ selection: { anchor: 0 } });
    indentParagraph(view);
    expect(view.state.doc.toString()).toBe('    Paragraph');
  });

  it('inline Markdown (WikiLink, tag, date, inline code) does not change the paragraph context', () => {
    const cases = [
      'Contains [[A Page]] and more',
      'Contains #tag and more',
      'Contains @2024-01-01 and more',
      'Contains `code` and more',
    ];
    for (const doc of cases) {
      const view = mountView(doc, 0);
      const handled = indentParagraph(view);
      expect(handled).toBe(true);
      expect(view.state.doc.toString()).toBe('  ' + doc);
    }
  });

  it('a paragraph inside a ListItem is NOT claimed by the paragraph command — structural ownership takes priority', () => {
    const doc = '- This is a list item';
    const view = mountView(doc, doc.indexOf('list item'));

    const handled = indentParagraph(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a heading', () => {
    const doc = '# Heading';
    const view = mountView(doc, doc.indexOf('Heading'));

    const handled = indentParagraph(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a horizontal rule', () => {
    const doc = '---';
    const view = mountView(doc, 1);

    const handled = indentParagraph(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a fenced code block', () => {
    const doc = '```js\ncode here\n```';
    const view = mountView(doc, doc.indexOf('code here'));

    const handled = indentParagraph(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a blockquote (out of scope for this milestone)', () => {
    const doc = '> Quote';
    const view = mountView(doc, doc.indexOf('Quote'));

    const handled = indentParagraph(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a table cell (out of scope for this milestone)', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |';
    const view = mountView(doc, doc.lastIndexOf('1'));

    const handled = indentParagraph(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a selection mixing a paragraph line with a list line is not claimed (ambiguous, not cleanly this context)', () => {
    const doc = '- item\nplain paragraph';
    const view = mountView(doc, 0, doc.length);

    const handled = indentParagraph(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('dedentParagraph', () => {
  it('outdents a single-line paragraph by one indent unit', () => {
    // 2 spaces, not 4 — a 4-space-indented line at the very start of the
    // document would itself be a CommonMark indented code block, not a
    // paragraph at all (see the dedicated "crosses into an indented code
    // block" test below for that exact boundary, verified deliberately
    // rather than avoided).
    const view = mountView('  Paragraph text', 4);

    const handled = dedentParagraph(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('Paragraph text');
  });

  it('Shift-Tab at zero indentation is consumed but leaves the document unchanged', () => {
    const view = mountView('Paragraph text', 3);

    const handled = dedentParagraph(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('Paragraph text');
  });

  it('repeated Shift-Tab removes one indent unit per press, then stops changing the document', () => {
    // The second line is a lazy continuation of the first paragraph, so
    // CommonMark tolerates arbitrary indentation on it without it ever
    // becoming a code block — lets this test reach 4 spaces of indent on
    // a line that unambiguously stays a Paragraph throughout, isolating
    // "does repeated Shift-Tab behave correctly" from the separate
    // code-block-boundary concern covered below.
    const doc = 'Intro\n    Paragraph';
    const view = mountView(doc, doc.indexOf('Paragraph'));

    dedentParagraph(view);
    expect(view.state.doc.toString()).toBe('Intro\n  Paragraph');

    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('Paragraph') } });
    dedentParagraph(view);
    expect(view.state.doc.toString()).toBe('Intro\nParagraph');

    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('Paragraph') } });
    const handled = dedentParagraph(view);
    expect(handled).toBe(true); // still consumed — still paragraph context
    expect(view.state.doc.toString()).toBe('Intro\nParagraph');
  });

  it('Markdown semantics boundary: repeated Tab on a top-of-document single-line paragraph eventually crosses into an indented code block, at which point the command correctly stops claiming it', () => {
    // Verifies the real interaction the milestone explicitly calls out:
    // this command never invents a "four spaces always" rule of its own
    // — it just runs CM6's own indentMore per press and re-checks real
    // parser context before every subsequent press. Two presses (2 + 2
    // spaces) is enough to cross CommonMark's 4-space indented-code-block
    // threshold for a line with nothing before it, and the third press
    // is correctly refused rather than blindly continuing to "indent"
    // text that is no longer actually a paragraph.
    const view = mountView('Paragraph', 0);

    expect(indentParagraph(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('  Paragraph');

    view.dispatch({ selection: { anchor: 0 } });
    expect(indentParagraph(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('    Paragraph');

    view.dispatch({ selection: { anchor: 0 } });
    const thirdHandled = indentParagraph(view);
    expect(thirdHandled).toBe(false); // now an indented code block, not a Paragraph — correctly un-claimed
    expect(view.state.doc.toString()).toBe('    Paragraph');
  });

  it('a paragraph inside a ListItem is NOT claimed — structural ownership takes priority', () => {
    const doc = '  - nested item';
    const view = mountView(doc, doc.indexOf('nested'));

    const handled = dedentParagraph(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});
