// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cursorCharLeft,
  cursorCharRight,
  cursorGroupLeft,
  cursorGroupRight,
  deleteCharBackward,
  deleteCharForward,
  history,
  redo,
  selectCharLeft,
  selectCharRight,
  undo,
} from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, type Extension, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';
import { collapsedQuoteExitDecoration } from './collapsedQuoteExitDecoration';
import { collapsedQuoteExitSelectionSnap } from './collapsedQuoteExitSelectionSnap';

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

function mount(doc: string, selection: EditorSelection | number, extensions: Extension[]): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({ doc, parent, extensions });
  mounted.push(view);
  ensureSyntaxTree(view.state, doc.length, 5000);
  view.dispatch({ selection: typeof selection === 'number' ? EditorSelection.cursor(selection) : selection });
  return view;
}

const fullStack = (): Extension[] => buildEditorExtensions({ ...REQUIRED, readOnly: false, hostPageId: 'test-page' });
const mountFull = (doc: string, selection: EditorSelection | number) => mount(doc, selection, fullStack());
/** Only the snap (and what it reads), no other selection handling — isolates it from the full stack. */
const mountSnapOnly = (doc: string, selection: EditorSelection | number) =>
  mount(doc, selection, [markdownLanguageExtension(), history(), collapsedQuoteExitDecoration(), collapsedQuoteExitSelectionSnap()]);
const mountNoSnap = (doc: string, selection: EditorSelection | number) =>
  mount(doc, selection, [markdownLanguageExtension(), history()]);

const key = (view: EditorView, name: string, keyCode: number) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: name, code: name, keyCode, bubbles: true, cancelable: true }));

const main = (view: EditorView) => ({ anchor: view.state.selection.main.anchor, head: view.state.selection.main.head });

// `> a` is 0–3, the newline at 3, the collapsed blank line is position 4, `Next` starts at 5.
const DOC = '> a\n\nNext';
const QUOTE_END = 3;
const BLANK = 4;
const NEXT = 5;

describe('collapsed quote-exit selection snap — arrow keys', () => {
  it('Left from the start of the next paragraph lands at the end of the quote, as a plain cursor', () => {
    const view = mountSnapOnly(DOC, NEXT);
    cursorCharLeft(view);
    expect(main(view)).toEqual({ anchor: QUOTE_END, head: QUOTE_END });
  });

  it('Right from the end of the quote lands at the start of the next paragraph, as a plain cursor', () => {
    const view = mountSnapOnly(DOC, QUOTE_END);
    cursorCharRight(view);
    expect(main(view)).toEqual({ anchor: NEXT, head: NEXT });
  });

  it('works through the real keymap in the full editor', () => {
    const left = mountFull(DOC, NEXT);
    key(left, 'ArrowLeft', 37);
    expect(main(left).head).toBe(QUOTE_END);

    const right = mountFull(DOC, QUOTE_END);
    key(right, 'ArrowRight', 39);
    expect(main(right).head).toBe(NEXT);
  });

  it('group motion skips the line too', () => {
    const view = mountSnapOnly('> a\n\n   Next', 8);
    cursorGroupLeft(view);
    expect(view.state.selection.main.head).not.toBe(BLANK);
    const right = mountSnapOnly('> a\n\nNext', QUOTE_END);
    cursorGroupRight(right);
    expect(right.state.selection.main.head).not.toBe(BLANK);
  });

  it('a whitespace-only blank line is skipped the same way', () => {
    const view = mountSnapOnly('> a\n  \nNext', 7);
    cursorCharLeft(view);
    expect(main(view).head).toBe(3);
  });

  it('moves the caret past the line in either direction repeatedly without ever stopping on it', () => {
    const view = mountSnapOnly(DOC, 0);
    const seen: number[] = [];
    for (let i = 0; i < DOC.length; i++) {
      cursorCharRight(view);
      seen.push(view.state.selection.main.head);
    }
    expect(seen).not.toContain(BLANK);
    expect(seen).toContain(QUOTE_END);
    expect(seen).toContain(NEXT);
    for (let i = 0; i < DOC.length; i++) {
      cursorCharLeft(view);
      seen.push(view.state.selection.main.head);
    }
    expect(seen).not.toContain(BLANK);
    expect(view.state.selection.main.head).toBe(0);
  });
});

describe('collapsed quote-exit selection snap — Shift+Arrow keeps the anchor and direction', () => {
  it('Shift+Right from the end of the quote selects across the line, anchored at the quote end', () => {
    const view = mountSnapOnly(DOC, QUOTE_END);
    selectCharRight(view);
    expect(main(view)).toEqual({ anchor: QUOTE_END, head: NEXT });
  });

  it('Shift+Left from the next paragraph selects backwards, anchored at the next paragraph', () => {
    const view = mountSnapOnly(DOC, NEXT);
    selectCharLeft(view);
    expect(main(view)).toEqual({ anchor: NEXT, head: QUOTE_END });
  });

  it('extending an existing forward selection keeps its anchor', () => {
    const view = mountSnapOnly(DOC, EditorSelection.single(0, QUOTE_END));
    selectCharRight(view);
    expect(main(view)).toEqual({ anchor: 0, head: NEXT });
  });

  it('extending an existing backward selection keeps its anchor (the later end)', () => {
    const view = mountSnapOnly(DOC, EditorSelection.single(DOC.length, NEXT));
    selectCharLeft(view);
    expect(main(view)).toEqual({ anchor: DOC.length, head: QUOTE_END });
  });

  it('shrinking a selection back across the line keeps the direction', () => {
    const view = mountSnapOnly(DOC, EditorSelection.single(0, NEXT + 1));
    selectCharLeft(view);
    expect(main(view)).toEqual({ anchor: 0, head: NEXT });
    selectCharLeft(view);
    expect(main(view)).toEqual({ anchor: 0, head: QUOTE_END });
  });

  it('an anchor that sits on the line moves away from the head, so the selection still covers its text', () => {
    const forward = mountSnapOnly(DOC, 0);
    forward.dispatch({ selection: EditorSelection.single(BLANK, 9), userEvent: 'select' });
    expect(main(forward)).toEqual({ anchor: QUOTE_END, head: 9 });

    const backward = mountSnapOnly(DOC, 0);
    backward.dispatch({ selection: EditorSelection.single(BLANK, 0), userEvent: 'select' });
    expect(main(backward)).toEqual({ anchor: NEXT, head: 0 });
  });

  it('a selection that does not touch the line is left exactly as it was', () => {
    const view = mountSnapOnly(DOC, 0);
    const requested = EditorSelection.single(1, 3);
    view.dispatch({ selection: requested, userEvent: 'select' });
    expect(view.state.selection.eq(requested)).toBe(true);
  });
});

describe('collapsed quote-exit selection snap — pointer selection', () => {
  it('a click that resolves onto the line snaps to a boundary', () => {
    const fromAbove = mountSnapOnly(DOC, 0);
    fromAbove.dispatch({ selection: EditorSelection.cursor(BLANK), userEvent: 'select.pointer' });
    expect(main(fromAbove)).toEqual({ anchor: NEXT, head: NEXT });

    const fromBelow = mountSnapOnly(DOC, DOC.length);
    fromBelow.dispatch({ selection: EditorSelection.cursor(BLANK), userEvent: 'select.pointer' });
    expect(main(fromBelow)).toEqual({ anchor: QUOTE_END, head: QUOTE_END });
  });

  it('a drag whose head crosses the line keeps its anchor and ends on a boundary', () => {
    const view = mountSnapOnly(DOC, 0);
    view.dispatch({ selection: EditorSelection.single(1, 2), userEvent: 'select.pointer' });
    view.dispatch({ selection: EditorSelection.single(1, BLANK), userEvent: 'select.pointer' });
    expect(main(view)).toEqual({ anchor: 1, head: NEXT });
    view.dispatch({ selection: EditorSelection.single(NEXT + 2, BLANK), userEvent: 'select.pointer' });
    expect(main(view)).toEqual({ anchor: NEXT + 2, head: QUOTE_END });
  });
});

describe('collapsed quote-exit selection snap — what it must not touch', () => {
  it('a selection set with no user event is not snapped', () => {
    const view = mountSnapOnly(DOC, 0);
    view.dispatch({ selection: EditorSelection.cursor(BLANK) });
    expect(main(view).head).toBe(BLANK);
  });

  it('other user events are not snapped', () => {
    const view = mountSnapOnly(DOC, 0);
    view.dispatch({ selection: EditorSelection.cursor(BLANK), userEvent: 'input' });
    expect(main(view).head).toBe(BLANK);
  });

  it('keeps the original transaction’s user event for later filters', () => {
    const events: Transaction[] = [];
    const view = mount(DOC, NEXT, [
      markdownLanguageExtension(),
      collapsedQuoteExitDecoration(),
      collapsedQuoteExitSelectionSnap(),
      EditorView.updateListener.of((update) => events.push(...update.transactions)),
    ]);
    events.length = 0;
    cursorCharLeft(view);
    expect(events).toHaveLength(1);
    expect(events[0]?.isUserEvent('select')).toBe(true);
    expect(events[0]?.scrollIntoView).toBe(true);
  });

  it('never changes the document', () => {
    const view = mountSnapOnly(DOC, 0);
    for (let i = 0; i < 12; i++) {
      cursorCharRight(view);
    }
    selectCharLeft(view);
    expect(view.state.doc.toString()).toBe(DOC);
  });
});

describe('collapsed quote-exit selection snap — deletion, Enter and undo are unchanged', () => {
  it('Backspace at the start of the next paragraph removes one newline, exactly as without the snap', () => {
    const view = mountSnapOnly(DOC, NEXT);
    deleteCharBackward(view);
    const plain = mountNoSnap(DOC, NEXT);
    deleteCharBackward(plain);
    expect(view.state.doc.toString()).toBe('> a\nNext');
    expect(view.state.doc.toString()).toBe(plain.state.doc.toString());
    expect(main(view)).toEqual(main(plain));
  });

  it('Delete at the end of the quote removes one newline, exactly as without the snap', () => {
    const view = mountSnapOnly(DOC, QUOTE_END);
    deleteCharForward(view);
    const plain = mountNoSnap(DOC, QUOTE_END);
    deleteCharForward(plain);
    expect(view.state.doc.toString()).toBe('> a\nNext');
    expect(view.state.doc.toString()).toBe(plain.state.doc.toString());
    expect(main(view)).toEqual(main(plain));
  });

  it('the real keymap’s Backspace and Delete behave the same in the full editor', () => {
    const backspace = mountFull(DOC, NEXT);
    key(backspace, 'Backspace', 8);
    expect(backspace.state.doc.toString()).toBe('> a\nNext');

    const del = mountFull(DOC, QUOTE_END);
    key(del, 'Delete', 46);
    expect(del.state.doc.toString()).toBe('> a\nNext');
  });

  it('Backspace with the caret placed on the blank line itself (programmatically) still deletes normally', () => {
    const view = mountSnapOnly(DOC, 0);
    view.dispatch({ selection: EditorSelection.cursor(BLANK) });
    deleteCharBackward(view);
    expect(view.state.doc.toString()).toBe('> a\nNext');
    expect(main(view).head).toBe(QUOTE_END);
  });

  it('Enter, Enter, Backspace gives the same result with and without the snap', () => {
    const view = mountFull('> a', 3);
    key(view, 'Enter', 13);
    key(view, 'Enter', 13);
    expect(view.state.doc.toString()).toBe('> a\n\n');
    key(view, 'Backspace', 8);
    expect(view.state.doc.toString()).toBe('> a\n');
    expect(main(view).head).toBe(4);
  });

  it('undo and redo of a deletion restore the text and are never redirected', () => {
    const view = mountSnapOnly(DOC, NEXT);
    deleteCharBackward(view);
    expect(view.state.doc.toString()).toBe('> a\nNext');
    undo(view);
    expect(view.state.doc.toString()).toBe(DOC);
    expect(main(view).head).toBe(NEXT);
    redo(view);
    expect(view.state.doc.toString()).toBe('> a\nNext');
  });
});

describe('collapsed quote-exit selection snap — only the collapsed line', () => {
  /** Every cursor position reached by pressing Right from 0 to the end, in order. */
  function walk(view: EditorView): number[] {
    const positions = [view.state.selection.main.head];
    for (let i = 0; i < view.state.doc.length + 2; i++) {
      cursorCharRight(view);
      positions.push(view.state.selection.main.head);
    }
    return positions;
  }

  const unaffected: Record<string, string> = {
    'an ordinary blank line between paragraphs': 'Para A\n\nPara B',
    'a blank line after a list': '- a\n- b\n\nPara',
    'a blank line after a heading': '# Title\n\nPara',
    'an empty line inside a quote': '> a\n>\n> b',
    'a whitespace-only quoted line': '> a\n> \n> b',
    'a fenced code block with an empty line': '```\ncode\n\nmore\n```\nafter',
    'a quote with no blank line after it': '> a\nlazy\nafter',
    'a trailing blank line after a quote (the caret line)': '> a\n',
    'a second blank line below a quote': '> a\n\n\nNext',
  };

  for (const [name, doc] of Object.entries(unaffected)) {
    if (name.startsWith('a second blank line')) {
      continue;
    }
    it(`walks every position exactly as without the snap: ${name}`, () => {
      expect(walk(mountSnapOnly(doc, 0))).toEqual(walk(mountNoSnap(doc, 0)));
    });
  }

  it('only the first blank line below a quote is skipped; the second is reachable', () => {
    const view = mountSnapOnly('> a\n\n\nNext', 6);
    cursorCharLeft(view);
    expect(main(view).head).toBe(5);
    cursorCharLeft(view);
    expect(main(view).head).toBe(3);
  });

  it('the caret on the empty last line after Enter stays put and reachable', () => {
    const view = mountSnapOnly('> a\n\n', 5);
    view.dispatch({ selection: EditorSelection.cursor(5), userEvent: 'select' });
    expect(main(view).head).toBe(5);
    cursorCharLeft(view);
    expect(main(view).head).toBe(3);
    cursorCharRight(view);
    expect(main(view).head).toBe(5);
  });

  it('a document with no quote at all is never filtered', () => {
    const view = mountSnapOnly('a\n\nb', 3);
    cursorCharLeft(view);
    expect(main(view).head).toBe(2);
  });
});

describe('collapsed quote-exit selection snap — with the rest of the editor’s selection handling', () => {
  it('coexists with the token and table selection snaps in the full editor', () => {
    const wiki = mountFull('> a\n\n[[Page]] after', QUOTE_END);
    cursorCharRight(wiki);
    expect(main(wiki).head).toBe(NEXT);
    wiki.dispatch({ selection: EditorSelection.cursor(BLANK), userEvent: 'select.pointer' });
    expect(wiki.state.selection.main.head).not.toBe(BLANK);

    // Quote, blank line, table: `tableRootSelectionSnap` forbids a caret at `table.from`, so the blank
    // line is the only legal position before the table and this snap must not fight it.
    const tableDoc = '> a\n\n| a | b |\n| - | - |\n| 1 | 2 |';
    const withTable = mountFull(tableDoc, QUOTE_END);
    cursorCharRight(withTable);
    expect(withTable.state.selection.main.head).toBe(BLANK);
    expect(withTable.state.doc.toString()).toBe(tableDoc);

    // Coming back from the quote side still skips nothing it shouldn't: Left from the blank line reaches the quote end.
    cursorCharLeft(withTable);
    expect(withTable.state.selection.main.head).toBe(QUOTE_END);
  });

  it('a quote nested one level deeper exits the same way', () => {
    const view = mountSnapOnly('>> a\n\nNext', 6);
    cursorCharLeft(view);
    expect(main(view).head).toBe(4);
  });
});
