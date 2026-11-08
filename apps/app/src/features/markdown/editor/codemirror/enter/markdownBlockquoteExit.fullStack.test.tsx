// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { insertNewlineAndIndent } from '@codemirror/commands';
import { insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, indentUnit } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { renderMarkdownBlocks } from '../../../render/renderMarkdownBlocks';
import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { createEditorView } from '../createEditorView';
import { blockquoteLineDecoration } from '../highlight/blockquoteLineDecoration';
import { blockquoteMarkerDecoration } from '../highlight/blockquoteMarkerDecoration';
import { markdownLanguageExtension } from '../markdownLanguage';

/**
 * The one-press blockquote exit, tested over the whole interaction: Enter on an empty quoted line, then typing, then
 * more Enters, then re-parsing the saved text and rendering it read-only. Markdown only ends a quoted paragraph at a
 * blank line (text on the very next line is a lazy continuation of the quote), so the exit must leave a blank line in
 * the *source*, not just remove the `>`. Native `insertNewlineContinueMarkup` gets there in three presses; Clutter's
 * handler in one, with the same end state. Runs through `createEditorView` + `buildEditorExtensions` with real
 * keydown events. `|` marks the caret.
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
afterEach(() => {
  mounted.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

function mountFull(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc,
    parent,
    extensions: buildEditorExtensions({ ...REQUIRED, readOnly: false, hostPageId: 'test-page' }),
  });
  mounted.push(view);
  return view;
}

function mountNative(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const continueMarkup = insertNewlineContinueMarkupCommand({ nonTightLists: false });
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [
        markdownLanguageExtension(),
        indentUnit.of('    '),
        blockquoteMarkerDecoration(),
        blockquoteLineDecoration(),
        keymap.of([{ key: 'Enter', run: (v: EditorView) => continueMarkup(v) || insertNewlineAndIndent(v) }]),
      ],
    }),
  });
  mounted.push(view);
  return view;
}

const enter = (view: EditorView) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
const backspace = (view: EditorView) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
function type(view: EditorView, text: string): void {
  for (const char of text) {
    view.dispatch(view.state.update({ ...view.state.replaceSelection(char), userEvent: 'input.type' }));
  }
}

/** The document's top-level block names, parsed fresh from the text (as when the note is reopened). */
function blocks(doc: string): string {
  const names: string[] = [];
  for (let node = sharedMarkdownParser.parse(doc).topNode.firstChild; node; node = node.nextSibling) {
    names.push(node.name);
  }
  return names.join('+');
}

/** The read-only renderer's output with styling noise removed. */
function rendered(doc: string): string {
  return render(<div>{renderMarkdownBlocks(doc, {})}</div>)
    .container.innerHTML.replace(/ class="[^"]*"/g, '')
    .replace(/<\/?span>/g, '');
}

/** The editor's own view: the source, with the caret, and which physical lines carry the quote decoration. */
function snapshot(view: EditorView): { source: string; caret: number; quoteLines: string } {
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  view.dispatch({});
  const lines = [...view.dom.querySelectorAll('.cm-line')].map((line) => (line.classList.contains('cm-quote-line') ? 'Q' : '-'));
  return { source: view.state.doc.toString(), caret: view.state.selection.main.head, quoteLines: lines.join('') };
}

describe('one-press blockquote exit — the complete interaction', () => {
  it('Enter, Enter leaves a blank line and the caret after it; the next typed character is outside the quote', () => {
    const view = mountFull('> This is a quote');

    enter(view);
    expect(snapshot(view).source).toBe('> This is a quote\n> ');

    enter(view);
    const exited = snapshot(view);
    expect(exited.source).toBe('> This is a quote\n\n');
    expect(exited.caret).toBe('> This is a quote\n\n'.length);

    type(view, 'This is a normal paragraph');
    const typed = snapshot(view);
    expect(typed.source).toBe('> This is a quote\n\nThis is a normal paragraph');
    expect(typed.caret).toBe(typed.source.length);
    expect(typed.quoteLines).toBe('Q--');
    expect(blocks(typed.source)).toBe('Blockquote+Paragraph');
    expect(rendered(typed.source)).toBe('<div><blockquote><p>This is a quote</p></blockquote><p>This is a normal paragraph</p></div>');
  });

  it('keeps going: Enter inside the new paragraph is an ordinary newline and typing stays outside the quote', () => {
    const view = mountFull('> This is a quote');
    enter(view);
    enter(view);
    type(view, 'First');
    enter(view);
    type(view, 'Second');

    const state = snapshot(view);
    expect(state.source).toBe('> This is a quote\n\nFirst\nSecond');
    expect(blocks(state.source)).toBe('Blockquote+Paragraph');
    expect(state.quoteLines).toBe('Q---');
  });

  it('reopening the note (a fresh editor on the saved text) gives the same structure', () => {
    const view = mountFull('> This is a quote');
    enter(view);
    enter(view);
    type(view, 'Outside');
    const saved = view.state.doc.toString();

    const reopened = mountFull(saved);
    expect(snapshot(reopened).source).toBe(saved);
    expect(snapshot(reopened).quoteLines).toBe('Q--');
    expect(blocks(saved)).toBe('Blockquote+Paragraph');
  });

  it('only the quoted content is quoted: nothing of the original text is lost or reflowed', () => {
    const view = mountFull('> One\n> Two');
    enter(view);
    enter(view);
    expect(view.state.doc.toString()).toBe('> One\n> Two\n\n');
  });

  it('multiple quoted paragraphs: the exit ends the whole quote', () => {
    const view = mountFull('> a\n>\n> b');
    enter(view);
    enter(view);
    type(view, 'x');

    const state = snapshot(view);
    expect(state.source).toBe('> a\n>\n> b\n\nx');
    expect(blocks(state.source)).toBe('Blockquote+Paragraph');
    expect(rendered(state.source)).toBe('<div><blockquote><p>a</p><p>b</p></blockquote><p>x</p></div>');
  });

  it('a nested quote exits one level: a blank outer-level line, with the caret in the outer quote', () => {
    const view = mountFull('>> a');
    enter(view);
    enter(view);
    expect(snapshot(view).source).toBe('>> a\n>\n>');
    type(view, 'b');

    const state = snapshot(view);
    expect(state.source).toBe('>> a\n>\n>b');
    expect(blocks(state.source)).toBe('Blockquote');
    expect(rendered(state.source)).toBe('<div><blockquote><blockquote><p>a</p></blockquote><p>b</p></blockquote></div>');

    enter(view);
    enter(view);
    type(view, 'c');
    expect(view.state.doc.toString()).toBe('>> a\n>\n>b\n\nc');
    expect(blocks(view.state.doc.toString())).toBe('Blockquote+Paragraph');
  });

  it.each([
    ['an unordered list', '> - a', '> - a\n\nx'],
    ['a numbered list', '> 1. a', '> 1. a\n\nx'],
    ['a task list', '> - [ ] a', '> - [ ] a\n\nx'],
  ])('a quote containing %s: the empty item exits, then the quote, and typing is outside', (_name, start, finalSource) => {
    const view = mountFull(start);
    enter(view); // new item
    enter(view); // empty item exits the list, leaving an empty quoted line
    enter(view); // empty quoted line exits the quote
    type(view, 'x');

    expect(view.state.doc.toString()).toBe(finalSource);
    expect(blocks(finalSource)).toBe('Blockquote+Paragraph');
    expect(snapshot(view).quoteLines).toMatch(/^Q+--$/);
  });

  it('an empty blockquote just loses its marker', () => {
    const view = mountFull('> ');
    view.dispatch({ selection: EditorSelection.cursor(2) });
    enter(view);
    expect(snapshot(view).source).toBe('');
    type(view, 'x');
    expect(blocks(view.state.doc.toString())).toBe('Paragraph');
  });

  it('repeated Enter after the exit is ordinary newlines: no quote marker comes back', () => {
    const view = mountFull('> a');
    enter(view);
    enter(view);
    enter(view);
    enter(view);
    expect(view.state.doc.toString()).toBe('> a\n\n\n\n');
    expect(snapshot(view).quoteLines).toBe('Q---' + '-');
  });

  it('Enter then Backspace removes the blank line again (a deliberate undo of the separator)', () => {
    const view = mountFull('> a');
    enter(view);
    enter(view);
    expect(view.state.doc.toString()).toBe('> a\n\n');

    backspace(view);

    expect(view.state.doc.toString()).toBe('> a\n');
    expect(view.state.selection.main.head).toBe('> a\n'.length);
  });
});

describe('versus native insertNewlineContinueMarkup', () => {
  it('native needs three presses and ends in the same structure; Clutter needs one fewer than native', () => {
    const native = mountNative('> This is a quote');
    enter(native);
    enter(native);
    expect(native.state.doc.toString()).toBe('> This is a quote\n>\n> ');
    enter(native);
    expect(native.state.doc.toString()).toBe('> This is a quote\n\n');
    type(native, 'This is a normal paragraph');
    const nativeFinal = native.state.doc.toString();

    const clutter = mountFull('> This is a quote');
    enter(clutter);
    enter(clutter);
    type(clutter, 'This is a normal paragraph');
    const clutterFinal = clutter.state.doc.toString();

    expect(clutterFinal).toBe(nativeFinal);
    expect(blocks(clutterFinal)).toBe(blocks(nativeFinal));
    expect(rendered(clutterFinal)).toBe(rendered(nativeFinal));
  });
});
