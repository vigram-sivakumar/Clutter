// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redo, undo } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { writePreferClutterQuoteSyntax } from '@shared/helpers/preferClutterQuoteSyntaxPreference';
import { buildEditorExtensions, type BuildEditorExtensionsOptions } from './buildEditorExtensions';
import { createEditorView } from './createEditorView';
import { markdownLanguageExtension } from './markdownLanguage';

/**
 * The *Prefer Clutter quote syntax* typing preference through the real editor stack: the space that completes a
 * `>` marker becomes `" ` only while the setting is on, and nothing else is ever converted. Carets are written as `|`.
 */
const REQUIRED: Omit<BuildEditorExtensionsOptions, 'readOnly' | 'hostPageId'> = {
  resolveWikiLink: () => undefined,
  resolveEmbedImage: () => undefined,
  resolveEmbedPdf: () => undefined,
  onImageClick: () => undefined,
  onOpenImageMenu: () => undefined,
  onPdfEmbedClick: () => undefined,
  onOpenPdfMenu: () => undefined,
  resolveImageSrc: () => undefined,
  resolveTag: () => undefined,
  resolveDate: () => undefined,
};

const mounted: EditorView[] = [];
beforeEach(() => localStorage.clear());
afterEach(() => {
  mounted.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
  localStorage.clear();
});

function mount(doc: string): EditorView {
  const first = doc.indexOf('|');
  const second = first < 0 ? -1 : doc.indexOf('|', first + 1);
  const text = doc.replace(/\|/g, '');
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc: text,
    parent,
    extensions: buildEditorExtensions({ ...REQUIRED, readOnly: false, hostPageId: 'test-page' }),
  });
  mounted.push(view);
  ensureSyntaxTree(view.state, text.length, 5000);
  const anchor = first < 0 ? text.length : first;
  view.dispatch({ selection: second < 0 ? EditorSelection.cursor(anchor) : EditorSelection.single(anchor, second - 1) });
  return view;
}

function show(view: EditorView): string {
  const { from, to } = view.state.selection.main;
  const text = view.state.doc.toString();
  return from === to ? `${text.slice(0, from)}|${text.slice(from)}` : `${text.slice(0, from)}|${text.slice(from, to)}|${text.slice(to)}`;
}

/** Types characters the way the editor receives them: the registered input handlers first, then the default insert. */
function type(view: EditorView, text: string): void {
  for (const char of text) {
    const { from, to } = view.state.selection.main;
    const insert = () =>
      view.state.update({ changes: { from, to, insert: char }, selection: { anchor: from + char.length }, userEvent: 'input.type', scrollIntoView: true });
    const handled = view.state.facet(EditorView.inputHandler).some((handler) => handler(view, from, to, char, insert));
    if (!handled) {
      view.dispatch(insert());
    }
  }
}

function blocks(view: EditorView): string[] {
  const names: string[] = [];
  for (let node = markdownLanguageExtension().language.parser.parse(view.state.doc.toString()).topNode.firstChild; node; node = node.nextSibling) {
    names.push(node.name);
  }
  return names;
}

function pasteText(view: EditorView, text: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files: [], types: ['text/plain'], getData: (kind: string) => (kind === 'text/plain' ? text : '') },
  });
  view.contentDOM.dispatchEvent(event);
}

const key = (view: EditorView, name: string, keyCode: number) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: name, code: name, keyCode, bubbles: true, cancelable: true }));

describe('with the setting off (the default)', () => {
  it('typing `> ` makes a standard blockquote', () => {
    const view = mount('|');
    type(view, '> ');
    expect(show(view)).toBe('> |');
    expect(blocks(view)).toEqual(['Blockquote']);
    type(view, 'quoted');
    expect(view.state.doc.toString()).toBe('> quoted');
  });

  it('typing `" ` still makes a native quote', () => {
    const view = mount('|');
    type(view, '" quoted');
    expect(view.state.doc.toString()).toBe('" quoted');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('both syntaxes can sit in one note', () => {
    const view = mount('|');
    type(view, '> one');
    key(view, 'Enter', 13);
    key(view, 'Enter', 13);
    key(view, 'Enter', 13);
    type(view, '" two');
    expect(blocks(view)).toEqual(['Blockquote', 'ClutterQuote']);
  });
});

describe('with the setting on', () => {
  beforeEach(() => writePreferClutterQuoteSyntax(true));

  it('typing `>` alone changes nothing', () => {
    const view = mount('|');
    type(view, '>');
    expect(show(view)).toBe('>|');
    expect(blocks(view)).toEqual(['Blockquote']);
  });

  it('the space that completes the marker turns `>` into `" `, with the caret after it', () => {
    const view = mount('|');
    type(view, '> ');
    expect(show(view)).toBe('" |');
    expect(blocks(view)).toEqual(['ClutterQuote']);
    type(view, 'quoted');
    expect(view.state.doc.toString()).toBe('" quoted');
  });

  it('typing `" ` is still a native quote, unchanged', () => {
    const view = mount('|');
    type(view, '" quoted');
    expect(view.state.doc.toString()).toBe('" quoted');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('converts at the start of a later line, below other text', () => {
    const view = mount('first\n\n|');
    type(view, '> hello');
    expect(view.state.doc.toString()).toBe('first\n\n" hello');
  });

  it('converts inside a list item', () => {
    const view = mount('- |');
    type(view, '> ');
    expect(view.state.doc.toString()).toBe('- " ');
  });

  it('converts a `>` typed before text that already follows the cursor', () => {
    const view = mount('|text');
    type(view, '> ');
    expect(show(view)).toBe('" |text');
  });

  it('only a `>` followed by the typed space: another character first means no conversion', () => {
    const view = mount('|');
    type(view, '>a ');
    expect(view.state.doc.toString()).toBe('>a ');
  });

  it('does not convert a `>` in the middle of text, in code, or after text', () => {
    const mid = mount('a |');
    type(mid, '> ');
    expect(mid.state.doc.toString()).toBe('a > ');

    const fenced = mount('```\n|\n```');
    type(fenced, '> ');
    expect(fenced.state.doc.toString()).toBe('```\n> \n```');

    const inline = mount('`|`');
    type(inline, '> ');
    expect(inline.state.doc.toString()).toBe('`> `');

    const arrow = mount('a ->|');
    type(arrow, ' ');
    expect(arrow.state.doc.toString()).toBe('a -> ');
  });

  it('does not convert when text is selected', () => {
    const view = mount('>|a|');
    type(view, ' ');
    expect(view.state.doc.toString()).toBe('> ');
  });
});

describe('with the setting on: nothing existing is converted', () => {
  beforeEach(() => writePreferClutterQuoteSyntax(true));

  it('leaves an existing `>` quote as it is, however it is edited', () => {
    const view = mount('> one\n> two|');
    type(view, ' more');
    expect(view.state.doc.toString()).toBe('> one\n> two more');
    expect(blocks(view)).toEqual(['Blockquote']);
  });

  it('a space typed right after the `>` of an existing quote is just a space', () => {
    const view = mount('>| existing');
    type(view, ' ');
    expect(view.state.doc.toString()).toBe('>  existing');
  });

  it('Enter continues an existing `>` quote with `>`, not `"`', () => {
    const view = mount('> one|');
    key(view, 'Enter', 13);
    expect(show(view)).toBe('> one\n> |');
  });

  it('a `>` typed to continue an existing quote on its next line stays standard', () => {
    const view = mount('> one\n|');
    type(view, '> ');
    expect(view.state.doc.toString()).toBe('> one\n> ');
    expect(blocks(view)).toEqual(['Blockquote']);
  });

  it('never rewrites the document just because the setting is on', () => {
    const doc = '> one\n> two\n\n" three\n\ntext > not a quote';
    const view = mount(doc);
    expect(view.state.doc.toString()).toBe(doc);
    view.dispatch({ selection: EditorSelection.cursor(3) });
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('with the setting on: pasted and programmatic content', () => {
  beforeEach(() => writePreferClutterQuoteSyntax(true));

  it('pasted `> ` content is not converted', () => {
    const view = mount('|');
    pasteText(view, '> one\n> two');
    expect(view.state.doc.toString()).toBe('> one\n> two');
    expect(blocks(view)).toEqual(['Blockquote']);
  });

  it('a `>` that arrived by paste stays as pasted; only the user\'s own space keystroke after it converts (a known edge)', () => {
    const view = mount('|');
    pasteText(view, '>');
    expect(view.state.doc.toString()).toBe('>');
    type(view, ' ');
    expect(view.state.doc.toString()).toBe('" ');
  });

  it('a programmatic insert of `> ` is not converted', () => {
    const view = mount('|');
    view.dispatch({ changes: { from: 0, insert: '> text' } });
    expect(view.state.doc.toString()).toBe('> text');
    view.dispatch({ changes: { from: 0, to: 6, insert: '> ' } });
    expect(view.state.doc.toString()).toBe('> ');
  });
});

describe('with the setting on: nested quotes', () => {
  beforeEach(() => writePreferClutterQuoteSyntax(true));

  it('typing `> ` twice makes a nested native quote', () => {
    const view = mount('|');
    type(view, '> ');
    type(view, '> ');
    expect(show(view)).toBe('" " |');
    expect(blocks(view)).toEqual(['ClutterQuote']);
    type(view, 'inner');
    expect(view.state.doc.toString()).toBe('" " inner');
  });

  it('a nested `>` typed inside an existing native quote converts', () => {
    const view = mount('" |');
    type(view, '> ');
    expect(show(view)).toBe('" " |');
  });

  it('a nested `>` typed inside an existing standard quote converts only the new level', () => {
    const view = mount('> |');
    type(view, '> ');
    expect(show(view)).toBe('> " |');
    expect(blocks(view)).toEqual(['Blockquote']);
  });
});

describe('with the setting on: undo and redo', () => {
  beforeEach(() => writePreferClutterQuoteSyntax(true));

  it('undo takes the conversion back to the `> ` that was typed; redo converts again', () => {
    const view = mount('|');
    type(view, '> ');
    expect(show(view)).toBe('" |');

    undo(view);
    expect(show(view)).toBe('> |');
    expect(blocks(view)).toEqual(['Blockquote']);

    redo(view);
    expect(show(view)).toBe('" |');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('a second undo takes the typed `> ` away', () => {
    const view = mount('|');
    type(view, '> ');
    undo(view);
    undo(view);
    expect(view.state.doc.toString()).toBe('');
  });

  it('text typed after the conversion is its own undo step, kept apart from the conversion', () => {
    const view = mount('|');
    type(view, '> hello');
    expect(view.state.doc.toString()).toBe('" hello');
    undo(view);
    expect(view.state.doc.toString()).toBe('" ');
    undo(view);
    expect(view.state.doc.toString()).toBe('> ');
  });
});

describe('the setting follows a change in Settings without a restart', () => {
  it('turning it on, then off, in a mounted editor changes the very next quote typed', () => {
    const view = mount('|');
    type(view, '> a');
    expect(view.state.doc.toString()).toBe('> a');

    writePreferClutterQuoteSyntax(true);
    key(view, 'Enter', 13);
    key(view, 'Enter', 13);
    key(view, 'Enter', 13);
    type(view, '> b');
    expect(view.state.doc.toString()).toBe('> a\n\n\n" b');

    writePreferClutterQuoteSyntax(false);
    key(view, 'Enter', 13);
    key(view, 'Enter', 13);
    key(view, 'Enter', 13);
    key(view, 'Enter', 13);
    type(view, '> c');
    expect(view.state.doc.toString().endsWith('\n> c')).toBe(true);
  });
});

describe('quotation-mark autocomplete is unchanged', () => {
  for (const preferred of [false, true]) {
    it(`selecting Orange and typing " produces "Orange" (setting ${preferred ? 'on' : 'off'})`, () => {
      writePreferClutterQuoteSyntax(preferred);
      const view = mount('|Orange|');
      type(view, '"');
      expect(view.state.doc.toString()).toBe('"Orange"');
    });

    it(`typing " with nothing selected inserts one quotation mark (setting ${preferred ? 'on' : 'off'})`, () => {
      writePreferClutterQuoteSyntax(preferred);
      const view = mount('|');
      type(view, '"');
      expect(view.state.doc.toString()).toBe('"');
    });
  }
});
