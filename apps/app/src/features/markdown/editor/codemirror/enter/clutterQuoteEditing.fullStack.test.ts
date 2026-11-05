// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cursorCharLeft, cursorCharRight, cursorLineDown, cursorLineUp, redo, selectAll, undo } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';

/**
 * Clutter-native quotes (`" text`) through the real editor stack: real keymap, real `closeBrackets()` setup,
 * real parse tree and decorations. Carets are written as `|` in the document string.
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

/** Mounts `doc` with the caret at its `|` (or a selection between two `|`). */
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
  const anchor = Math.max(first, 0);
  view.dispatch({ selection: second < 0 ? EditorSelection.cursor(anchor) : EditorSelection.single(anchor, second - 1) });
  return view;
}

const key = (view: EditorView, name: string, keyCode: number, shift = false) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: name, code: name, keyCode, shiftKey: shift, bubbles: true, cancelable: true }));
const enter = (view: EditorView) => key(view, 'Enter', 13);
const backspace = (view: EditorView) => key(view, 'Backspace', 8);
const del = (view: EditorView) => key(view, 'Delete', 46);

/** The document with a `|` at the caret — the same notation the tests mount from. */
function show(view: EditorView): string {
  const { from, to } = view.state.selection.main;
  const text = view.state.doc.toString();
  return from === to ? `${text.slice(0, from)}|${text.slice(from)}` : `${text.slice(0, from)}|${text.slice(from, to)}|${text.slice(to)}`;
}

/** Types one character the way the editor receives it: through the registered input handlers, then the default insert. */
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
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  const names: string[] = [];
  for (let node = markdownLanguageExtension().language.parser.parse(view.state.doc.toString()).topNode.firstChild; node; node = node.nextSibling) {
    names.push(node.name);
  }
  return names;
}

const quoteLineCount = (view: EditorView) => view.contentDOM.querySelectorAll('.cm-quote-line').length;

describe('typing a native quote', () => {
  it('a `"` and a space make a quote; the user types the text right after, with no extra space', () => {
    const view = mount('|');
    type(view, '" ');
    expect(show(view)).toBe('" |');
    type(view, 'hello');
    expect(show(view)).toBe('" hello|');
    expect(blocks(view)).toEqual(['ClutterQuote']);
    expect(Array.from(view.contentDOM.querySelectorAll('.cm-quote')).map((el) => el.textContent)).toEqual(['hello']);
  });

  it('a lone `"` is inserted once, with no closing quote added', () => {
    const view = mount('|');
    type(view, '"');
    expect(show(view)).toBe('"|');
    expect(view.state.doc.toString()).toBe('"');
  });

  it('inserts one `"` in the middle of text and after a word', () => {
    expect(show((() => { const v = mount('ab|cd'); type(v, '"'); return v; })())).toBe('ab"|cd');
    expect(show((() => { const v = mount('word|'); type(v, '"'); return v; })())).toBe('word"|');
  });

  it('typing `"Hello"` by hand leaves exactly those characters', () => {
    const view = mount('|');
    type(view, '"Hello"');
    expect(view.state.doc.toString()).toBe('"Hello"');
    expect(blocks(view)).toEqual(['Paragraph']);
  });

  it('inserts a `"` even right before an existing one (no type-over skip)', () => {
    const view = mount('|"');
    type(view, '"');
    expect(view.state.doc.toString()).toBe('""');
    expect(view.state.selection.main.head).toBe(1);
  });

  it('inserts one `"` at each of several carets', () => {
    const view = mount('a\nb');
    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)]) });
    type(view, '"');
    expect(view.state.doc.toString()).toBe('a"\nb"');
  });
});

describe('selected text and the other brackets keep their autocomplete', () => {
  it('selecting Orange and typing `"` produces "Orange"', () => {
    const view = mount('|Orange|');
    type(view, '"');
    expect(view.state.doc.toString()).toBe('"Orange"');
  });

  it('wraps a selection in the middle of a sentence', () => {
    const view = mount('an |Orange| here');
    type(view, '"');
    expect(view.state.doc.toString()).toBe('an "Orange" here');
  });

  it('still auto-closes ( [ { and \'', () => {
    for (const [open, pair] of [['(', '()'], ['[', '[]'], ['{', '{}']] as const) {
      const view = mount('|');
      type(view, open);
      expect(view.state.doc.toString()).toBe(pair);
    }
    const quote = mount('|');
    type(quote, "'");
    expect(quote.state.doc.toString()).toBe("''");
  });

  it('wraps a selection in brackets as before', () => {
    const view = mount('|Orange|');
    type(view, '(');
    expect(view.state.doc.toString()).toBe('(Orange)');
  });
});

describe('Enter in a native quote', () => {
  it('continues the quote with the same marker', () => {
    const view = mount('" abc|');
    enter(view);
    expect(show(view)).toBe('" abc\n" |');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('splits the text at the caret and keeps the marker on the new line', () => {
    const view = mount('" a|bc');
    enter(view);
    expect(show(view)).toBe('" a\n" |bc');
  });

  it('at the start of the text leaves an empty quote line above it', () => {
    const view = mount('" |abc');
    enter(view);
    expect(show(view)).toBe('" \n" |abc');
  });

  it('before the marker pushes the line down', () => {
    const view = mount('|" abc');
    enter(view);
    expect(show(view)).toBe('\n|" abc');
  });

  it('replaces a selection with the line break and the marker', () => {
    const view = mount('" a|bc|d');
    enter(view);
    expect(show(view)).toBe('" a\n" |d');
  });

  it('builds several consecutive quote lines', () => {
    const view = mount('" one|');
    enter(view);
    type(view, 'two');
    enter(view);
    type(view, 'three');
    expect(view.state.doc.toString()).toBe('" one\n" two\n" three');
    expect(blocks(view)).toEqual(['ClutterQuote']);
    expect(quoteLineCount(view)).toBe(3);
  });

  it('Enter on an empty quote line exits the quote in one press, with no blank line', () => {
    const view = mount('" abc|');
    enter(view);
    enter(view);
    expect(show(view)).toBe('" abc\n|');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('what is typed after the exit is a plain paragraph, not part of the quote', () => {
    const view = mount('" abc|');
    enter(view);
    enter(view);
    type(view, 'plain text');
    expect(view.state.doc.toString()).toBe('" abc\nplain text');
    expect(blocks(view)).toEqual(['ClutterQuote', 'Paragraph']);
    expect(quoteLineCount(view)).toBe(1);
  });

  it('after the exit Enter is an ordinary newline and no marker comes back', () => {
    const view = mount('" abc|');
    enter(view);
    enter(view);
    enter(view);
    expect(show(view)).toBe('" abc\n\n|');
    enter(view);
    expect(show(view)).toBe('" abc\n\n\n|');
  });

  it('an empty `" ` line on its own exits to an empty line', () => {
    const view = mount('" |');
    enter(view);
    expect(show(view)).toBe('|');
  });

  it('exits a nested quote one level at a time', () => {
    const view = mount('" " in|');
    enter(view);
    expect(show(view)).toBe('" " in\n" " |');
    enter(view);
    expect(show(view)).toBe('" " in\n" |');
    enter(view);
    expect(show(view)).toBe('" " in\n|');
  });

  it('exits the native level of a mixed quote and keeps the standard one', () => {
    const view = mount('> " in|');
    enter(view);
    expect(show(view)).toBe('> " in\n> " |');
    enter(view);
    expect(show(view)).toBe('> " in\n> |');
  });

  it('Shift+Enter inside a native quote stays in the paragraph, with the marker repeated', () => {
    const view = mount('" abc|');
    key(view, 'Enter', 13, true);
    expect(show(view)).toBe('" abc\\\n" |');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('does not touch Enter after ordinary text that starts with a quotation mark', () => {
    const view = mount('"Hello|');
    enter(view);
    expect(show(view)).toBe('"Hello\n|');
  });

  it('does not touch Enter inside fenced code', () => {
    const view = mount('```\n" code|\n```');
    enter(view);
    expect(view.state.doc.toString()).toBe('```\n" code\n\n```');
  });

  it('leaves a standard `>` quote exactly as it was', () => {
    const view = mount('> a|');
    enter(view);
    expect(show(view)).toBe('> a\n> |');
    enter(view);
    expect(show(view)).toBe('> a\n\n|');
  });

  it('a list inside a native quote is left to the list commands (known limitation: no quote prefix)', () => {
    const view = mount('" - a|');
    enter(view);
    expect(view.state.doc.toString().startsWith('" - a\n')).toBe(true);
    expect(view.state.doc.toString().split('\n')[1]).not.toMatch(/^" /);
  });
});

describe('Backspace in a native quote', () => {
  it('removes the marker and its space right after it, leaving the text outside the quote', () => {
    const view = mount('" |abc');
    backspace(view);
    expect(show(view)).toBe('|abc');
    expect(blocks(view)).toEqual(['Paragraph']);
  });

  it('removes the marker from an empty quote line', () => {
    const view = mount('" |');
    backspace(view);
    expect(show(view)).toBe('|');
  });

  it('leaves the line empty after the quote it was continuing', () => {
    const view = mount('" a\n" |');
    backspace(view);
    expect(show(view)).toBe('" a\n|');
  });

  it('takes the marker out from between the quotation mark and its space as well', () => {
    const view = mount('"| abc');
    backspace(view);
    expect(show(view)).toBe('|abc');
  });

  it('removes only the innermost marker of a nested quote', () => {
    const view = mount('" " |abc');
    backspace(view);
    expect(show(view)).toBe('" |abc');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('removes the native marker of a mixed quote and keeps the standard one', () => {
    const view = mount('> " |abc');
    backspace(view);
    expect(show(view)).toBe('> |abc');
  });

  it('inside the text is an ordinary character delete', () => {
    const view = mount('" ab|c');
    backspace(view);
    expect(show(view)).toBe('" a|c');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('at the start of a line below a quote joins the lines like any plain line', () => {
    const view = mount('" a\n|b');
    backspace(view);
    expect(show(view)).toBe('" a|b');
  });

  it('does not touch ordinary text starting with a quotation mark', () => {
    const view = mount('"|Hello');
    backspace(view);
    expect(show(view)).toBe('|Hello');
  });

  it('leaves a standard `>` quote as it was', () => {
    const view = mount('> |abc');
    backspace(view);
    expect(show(view)).toBe('|abc');
    const nested = mount('>> |');
    backspace(nested);
    expect(show(nested)).toBe('>|');
  });

  it('Delete is an ordinary forward delete', () => {
    const view = mount('" a|\n" b');
    del(view);
    expect(view.state.doc.toString()).toBe('" a" b');
  });
});

describe('undo and redo', () => {
  it('undo restores the marker removed by Backspace, and redo removes it again', () => {
    const view = mount('" |abc');
    backspace(view);
    expect(view.state.doc.toString()).toBe('abc');
    undo(view);
    expect(view.state.doc.toString()).toBe('" abc');
    expect(blocks(view)).toEqual(['ClutterQuote']);
    redo(view);
    expect(view.state.doc.toString()).toBe('abc');
  });

  it('undo and redo take back and restore the Enter continuation and the exit (history groups quick edits)', () => {
    const view = mount('" abc|');
    enter(view);
    enter(view);
    expect(view.state.doc.toString()).toBe('" abc\n');
    undo(view);
    expect(view.state.doc.toString()).toBe('" abc');
    expect(blocks(view)).toEqual(['ClutterQuote']);
    redo(view);
    expect(view.state.doc.toString()).toBe('" abc\n');
  });

  it('undo takes back a wrapped selection in one step', () => {
    const view = mount('|Orange|');
    type(view, '"');
    expect(view.state.doc.toString()).toBe('"Orange"');
    undo(view);
    expect(view.state.doc.toString()).toBe('Orange');
  });
});

describe('cursor navigation', () => {
  function walk(view: EditorView, step: (v: EditorView) => boolean): number[] {
    const positions = [view.state.selection.main.head];
    for (let i = 0; i < view.state.doc.length + 1; i++) {
      step(view);
      positions.push(view.state.selection.main.head);
    }
    return positions;
  }

  it('Left and Right step through the same positions as in the equivalent `>` quote', () => {
    const native = mount('|" one\n" two\nplain');
    const standard = mount('|> one\n> two\nplain');
    expect(walk(native, cursorCharRight)).toEqual(walk(standard, cursorCharRight));
    expect(walk(native, cursorCharLeft)).toEqual(walk(standard, cursorCharLeft));
  });

  it('every position is reachable: the caret never skips a character', () => {
    const view = mount('|" one\n" two\nplain');
    const positions = walk(view, cursorCharRight);
    expect(positions.slice(0, view.state.doc.length + 1)).toEqual(Array.from({ length: view.state.doc.length + 1 }, (_, i) => i));
  });

  it('Up and Down move between the lines of the quote and out of it', () => {
    const view = mount('" one\n" tw|o\nplain');
    cursorLineUp(view);
    expect(view.state.selection.main.head).toBeLessThanOrEqual('" one'.length);
    const down = mount('" one|\n" two\nplain');
    cursorLineDown(down);
    expect(down.state.doc.lineAt(down.state.selection.main.head).number).toBeGreaterThanOrEqual(1);
  });

  it('select-all and extending a selection across the marker work as on any text', () => {
    const view = mount('|" one\n" two');
    selectAll(view);
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
  });
});

describe('copy and paste', () => {
  function pasteText(view: EditorView, text: string): void {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [], types: ['text/plain'], getData: (type: string) => (type === 'text/plain' ? text : '') },
    });
    view.contentDOM.dispatchEvent(event);
  }

  /**
   * What CodeMirror's copy puts on the clipboard: the selected document text, run through the editor's
   * `clipboardOutputFilter`s (Clutter's records it as its own copy). CodeMirror's copy *event* is skipped in
   * jsdom — it only acts when the DOM selection is inside the editor, which jsdom never has — so this applies the
   * same two steps directly. Clutter adds no quote conversion to either.
   */
  function copyText(view: EditorView): string {
    const { from, to } = view.state.selection.main;
    return view.state.facet(EditorView.clipboardOutputFilter).reduce((text, filter) => filter(text, view.state), view.state.sliceDoc(from, to));
  }

  it('copies the literal native syntax, markers included', () => {
    const view = mount('|" one\n" two|');
    expect(copyText(view)).toBe('" one\n" two');
  });

  it('pastes native quote text as typed, and it parses as a quote', () => {
    const view = mount('|');
    pasteText(view, '" one\n" two');
    expect(view.state.doc.toString()).toBe('" one\n" two');
    expect(blocks(view)).toEqual(['ClutterQuote']);
  });

  it('pastes native quote text into the middle of a document without disturbing the rest', () => {
    const view = mount('before\n\n|\n\nafter');
    pasteText(view, '" quoted');
    expect(view.state.doc.toString()).toBe('before\n\n" quoted\n\nafter');
    expect(blocks(view)).toEqual(['Paragraph', 'ClutterQuote', 'Paragraph']);
  });

  it('a copy then paste round-trips the quote exactly', () => {
    const source = mount('|" one\n" two|');
    const copied = copyText(source);
    const target = mount('|');
    pasteText(target, copied);
    expect(target.state.doc.toString()).toBe('" one\n" two');
  });

  it('pasting text that merely starts with a quotation mark stays a paragraph', () => {
    const view = mount('|');
    pasteText(view, '"Hello" she said');
    expect(view.state.doc.toString()).toBe('"Hello" she said');
    expect(blocks(view)).toEqual(['Paragraph']);
  });

  it('pasting standard `>` text is unchanged', () => {
    const view = mount('|');
    pasteText(view, '> one\n> two');
    expect(view.state.doc.toString()).toBe('> one\n> two');
    expect(blocks(view)).toEqual(['Blockquote']);
  });
});
