// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { createEditorView } from '../createEditorView';
import { resolveLineIndentContext } from '../indent/markdownIndentContext';

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
afterEach(() => {
  mounted.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc,
    parent,
    extensions: buildEditorExtensions({ ...REQUIRED, readOnly: false, hostPageId: 'test-page' }),
  });
  mounted.push(view);
  ensureSyntaxTree(view.state, doc.length, 5000);
  view.dispatch({});
  return view;
}

const lines = (view: EditorView) => Array.from(view.contentDOM.querySelectorAll('.cm-line')) as HTMLElement[];
const quoteLines = (view: EditorView) => lines(view).filter((line) => line.classList.contains('cm-quote-line'));
const depthOf = (line: HTMLElement) => line.style.getPropertyValue('--quote-depth');
const separators = (view: EditorView) =>
  Array.from(view.contentDOM.querySelectorAll('.cm-block-separator')).map((el) => parseInt((el as HTMLElement).style.height, 10));

/** `.cm-content`'s children as a string: Q = quote line, L = other line, S = separator widget. */
function sequence(view: EditorView): string {
  return [...view.contentDOM.children]
    .map((child) => (child.classList.contains('cm-block-separator') ? 'S' : child.classList.contains('cm-quote-line') ? 'Q' : 'L'))
    .join('');
}

describe('Clutter native quotes — the same look as a `>` quote', () => {
  it('draws the quote bar, marker and depth exactly as a `>` quote does', () => {
    const native = mount('" first\n" second\nplain');
    const standard = mount('> first\n> second\nplain');

    expect(quoteLines(native)).toHaveLength(2);
    expect(quoteLines(native).map(depthOf)).toEqual(['1', '1']);
    expect(sequence(native).startsWith('QQ')).toBe(true);
    expect(sequence(native).slice(0, 2)).toBe(sequence(standard).slice(0, 2));
  });

  it('conceals the marker and its space at rest, as a separate marker element', () => {
    const view = mount('" first\n" second\nplain');
    const markers = Array.from(view.contentDOM.querySelectorAll('.cm-quote-marker'));

    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((marker) => marker.textContent === '" ')).toBe(true);
    // The quoted text itself carries no marker characters.
    expect(Array.from(view.contentDOM.querySelectorAll('.cm-quote')).map((el) => el.textContent)).toEqual(['first', 'second']);
  });

  it('counts nested `" "` quotes as depth 2', () => {
    const view = mount('" " inner\n" outer');
    expect(quoteLines(view).map(depthOf)).toEqual(['2', '1']);
  });

  it('counts a `>` quote nested in a native one and the reverse', () => {
    expect(quoteLines(mount('" > inner')).map(depthOf)).toEqual(['2']);
    expect(quoteLines(mount('> " inner')).map(depthOf)).toEqual(['2']);
  });

  it('gives an unmarked line after a native quote no quote bar — it is not a lazy continuation', () => {
    const native = mount('" quoted\nplain');
    expect(quoteLines(native)).toHaveLength(1);

    const standard = mount('> quoted\nplain');
    expect(quoteLines(standard)).toHaveLength(2);
  });

  it('leaves ordinary text with a quotation mark undecorated', () => {
    const view = mount('"Hello" she said\n"');
    expect(quoteLines(view)).toHaveLength(0);
    expect(view.contentDOM.querySelectorAll('.cm-quote-marker')).toHaveLength(0);
  });
});

describe('Clutter native quotes — spacing', () => {
  it('adds no gap between lines of one quoted paragraph, and the normal 12px after the quote', () => {
    const view = mount('" one\n" two\nplain');
    expect(sequence(view)).toBe('QQSL');
    expect(separators(view)).toEqual([12]);
  });

  it('matches a `>` quote followed by a blank line and a paragraph', () => {
    expect(separators(mount('" a\n\nplain'))).toEqual(separators(mount('> a\n\nplain')));
  });

  it('keeps 6px for a real break inside the quote and for nesting', () => {
    // An empty quoted line is the marker and its space: `" `.
    expect(separators(mount('" a\n" \n" b'))).toEqual(separators(mount('> a\n>\n> b')));
    expect(separators(mount('" a\n" \n" b'))).toEqual([6, 6]);
    expect(separators(mount('" " in\n" out'))).toEqual([6]);
  });
});

describe('Clutter native quotes — indentation', () => {
  it('is left alone by Tab/Shift-Tab, like a `>` quote', () => {
    const native = mount('" quoted');
    const standard = mount('> quoted');
    expect(resolveLineIndentContext(native.state, native.state.doc.line(1)).kind).toBe('unhandled');
    expect(resolveLineIndentContext(native.state, native.state.doc.line(1)).kind).toBe(
      resolveLineIndentContext(standard.state, standard.state.doc.line(1)).kind
    );
  });
});
