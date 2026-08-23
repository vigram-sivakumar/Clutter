// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';

import { markdownLanguageExtension } from './markdownLanguage';
import { deleteMarkupForward, deleteMarkupForwardKeymap } from './deleteMarkupForward';

function mountView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

/** Same full stack the live editor registers this command with — real keymap precedence, real `deleteCharForward` fallback. */
function mountFullView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [deleteMarkupForwardKeymap(), markdownLanguageExtension(), keymap.of(defaultKeymap)],
  });
  return new EditorView({ state, parent });
}

function pressDelete(view: EditorView): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
}

describe('deleteMarkupForward — cross-boundary refusal (D1-D5, D7, D8)', () => {
  it('D1: paragraph -> list boundary refuses, list stays intact', () => {
    const doc = 'A paragraph\n- item one';
    const view = mountView(doc, doc.indexOf('\n'));

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.from).toBe(doc.indexOf('\n'));
    const tree = markdownLanguageExtension().language.parser.parse(view.state.doc.toString());
    expect(tree.toString()).toBe('Document(Paragraph,BulletList(ListItem(ListMark,Paragraph)))');
  });

  it('D2: list item -> list item refuses, both items stay independent ListItems', () => {
    const doc = '- alpha\n- beta';
    const view = mountView(doc, doc.indexOf('\n'));

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    const tree = markdownLanguageExtension().language.parser.parse(view.state.doc.toString());
    expect(tree.toString()).toBe('Document(BulletList(ListItem(ListMark,Paragraph),ListItem(ListMark,Paragraph)))');
  });

  it('D4: heading -> paragraph refuses, heading stays single-line', () => {
    const doc = '# Heading\nBody text';
    const view = mountView(doc, doc.indexOf('\n'));

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    const tree = markdownLanguageExtension().language.parser.parse(view.state.doc.toString());
    expect(tree.toString()).toBe('Document(ATXHeading1(HeaderMark),Paragraph)');
  });

  it('D5: heading -> list refuses — the worst-case compound scenario stays fully intact', () => {
    const doc = '# Heading\n- item one';
    const view = mountView(doc, doc.indexOf('\n'));

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    const tree = markdownLanguageExtension().language.parser.parse(view.state.doc.toString());
    expect(tree.toString()).toBe('Document(ATXHeading1(HeaderMark),BulletList(ListItem(ListMark,Paragraph)))');
  });

  it('D7: nested-list sibling join refuses, nested list keeps both items', () => {
    const doc = '- alpha\n  - one\n  - two';
    const pos = doc.indexOf('\n', doc.indexOf('one'));
    const view = mountView(doc, pos);

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe(doc);
    const tree = markdownLanguageExtension().language.parser.parse(view.state.doc.toString());
    expect(tree.toString()).toBe(
      'Document(BulletList(ListItem(ListMark,Paragraph,BulletList(ListItem(ListMark,Paragraph),ListItem(ListMark,Paragraph)))))'
    );
  });

});

describe('deleteMarkupForward — must not claim contexts it does not own', () => {
  it('D3: list -> paragraph is a finding, not a fix target — the "paragraph" is already lazily continuing item 2\'s own Paragraph node BEFORE any Delete press, so there is no genuine block boundary here to protect', () => {
    // Confirmed by direct tree inspection: parsing the ORIGINAL (pre-edit)
    // document already shows "A paragraph" absorbed inside item 2's own
    // Paragraph node, purely via CommonMark lazy continuation (no blank
    // line separates "- beta" from the unindented, non-list-marker text
    // that follows). Delete here only removes a newline WITHIN an
    // already-continuous Paragraph — the same category of operation as
    // ordinary same-paragraph line-joining, which must stay on
    // deleteCharForward. The implementation plan's original "Confirmed
    // bug" framing for this exact input does not hold up under tree-level
    // (rather than text-only) inspection; refusing it would mean
    // detecting something other than a genuine tree boundary.
    const doc = '- alpha\n- beta\nA paragraph';
    const beforeTree = markdownLanguageExtension().language.parser.parse(doc);
    expect(beforeTree.toString()).toBe(
      'Document(BulletList(ListItem(ListMark,Paragraph),ListItem(ListMark,Paragraph)))'
    );

    const pos = doc.indexOf('\n', doc.indexOf('beta'));
    const view = mountView(doc, pos);

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('D8: blockquote -> paragraph is the same finding as D3 — blockquotes support lazy continuation too, so "plain" is already inside the Blockquote\'s own Paragraph before any Delete press', () => {
    const doc = '> quoted\nplain';
    const beforeTree = markdownLanguageExtension().language.parser.parse(doc);
    expect(beforeTree.toString()).toBe('Document(Blockquote(QuoteMark,Paragraph))');

    const view = mountView(doc, doc.indexOf('\n'));

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('D9: within-construct, right after a bullet marker, defers to deleteCharForward', () => {
    const doc = '- alpha';
    const view = mountView(doc, 2);

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('D10: within-construct, right after a heading marker, defers', () => {
    const doc = '# Heading';
    const view = mountView(doc, 2);

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('D11: within-construct, right after a blockquote marker, defers', () => {
    const doc = '> quoted';
    const view = mountView(doc, 2);

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('D12: within-construct, right after an opening code fence, defers', () => {
    const doc = '```\ncode\n```';
    const view = mountView(doc, 3);

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('D6: a leading blank line before a list is unaffected — no block ends at the blank line, so this stays deferred', () => {
    const doc = '\n- alpha';
    const view = mountView(doc, 0);

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('ordinary same-paragraph line wrapping is unaffected — no boundary exists between the two lines', () => {
    const doc = 'Hello\nworld';
    const view = mountView(doc, doc.indexOf('\n'));

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a continuing paragraph whose second line starts with an inline construct is unaffected — not mistaken for a new block start', () => {
    const doc = 'Hello\n**bold** world';
    const view = mountView(doc, doc.indexOf('\n'));

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a list item\'s own continuation line is unaffected', () => {
    const doc = '- alpha\n  continuation text';
    const view = mountView(doc, doc.indexOf('\n'));

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('defers for a non-empty selection', () => {
    const doc = 'A paragraph\n- item one';
    const view = mountView(doc, 0);
    view.dispatch({ selection: { anchor: 5, head: 11 } });

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('defers at the very end of the document — nothing follows', () => {
    const doc = 'A paragraph';
    const view = mountView(doc, doc.length);

    const handled = deleteMarkupForward(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('precedence — real keydown dispatch against the full extension stack', () => {
  it('a real Delete keypress refuses at a cross-boundary position', () => {
    const doc = 'A paragraph\n- item one';
    const view = mountFullView(doc, doc.indexOf('\n'));

    pressDelete(view);

    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('a real Delete keypress still falls through to deleteCharForward for an ordinary within-construct position', () => {
    const doc = '- alpha';
    const view = mountFullView(doc, 2);

    pressDelete(view);

    expect(view.state.doc.toString()).toBe('- lpha');
    view.destroy();
  });

  it('a real Delete keypress still falls through to deleteCharForward for ordinary same-paragraph line joining', () => {
    const doc = 'Hello\nworld';
    const view = mountFullView(doc, doc.indexOf('\n'));

    pressDelete(view);

    expect(view.state.doc.toString()).toBe('Helloworld');
    view.destroy();
  });
});
