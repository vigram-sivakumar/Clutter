// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { history, insertNewlineAndIndent, redo, undo } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { insertSoftLineBreak, markdownEnterCommand } from '../enter/markdownEnterKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { blockSeparatorDecoration } from './blockSeparatorDecoration';
import { hardBreakMarkerDecoration } from './hardBreakMarkerDecoration';
import { SEPARATOR } from './separatorScope';

/**
 * Shift+Enter writes `text\` + newline. Right after it the new line is empty, so the parser ends the paragraph
 * at the backslash (no `HardBreak` node yet) — the first typed character is what makes it one. The spacing
 * above the new line must be the same before and after that character: the reported bug was a paragraph gap
 * (12px) that collapsed to a soft-break gap the moment the user typed.
 */
function mountView(doc: string, caret = doc.length): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(caret),
    extensions: [markdownLanguageExtension(), history(), blockSeparatorDecoration(), hardBreakMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

function separatorHeights(view: EditorView): number[] {
  return Array.from(view.dom.querySelectorAll('.cm-block-separator')).map((el) =>
    parseInt((el as HTMLElement).style.height, 10)
  );
}

function type(view: EditorView, text: string): void {
  for (const ch of text) {
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: head, insert: ch },
      selection: { anchor: head + 1 },
      userEvent: 'input.type',
    });
  }
}

describe('Shift+Enter spacing is the same before and after the first typed character', () => {
  it('at the end of a paragraph: no gap right after Shift+Enter, and the document is not rewritten by typing', () => {
    const view = mountView('First line');
    insertSoftLineBreak(view);

    expect(view.state.doc.toString()).toBe('First line\\\n');
    expect(separatorHeights(view)).toEqual([]);

    type(view, 'S');
    expect(view.state.doc.toString()).toBe('First line\\\nS');
    expect(separatorHeights(view)).toEqual([]);
    view.destroy();
  });

  it('typing a whole word keeps the representation and the spacing', () => {
    const view = mountView('First line');
    insertSoftLineBreak(view);
    type(view, 'Second');

    expect(view.state.doc.toString()).toBe('First line\\\nSecond');
    expect(separatorHeights(view)).toEqual([]);
    view.destroy();
  });

  it('in the middle of a paragraph: the break splits the text and keeps one paragraph', () => {
    const view = mountView('First line more', 'First line'.length);
    insertSoftLineBreak(view);
    expect(view.state.doc.toString()).toBe('First line\\\n more');
    expect(separatorHeights(view)).toEqual([]);

    type(view, 'x');
    expect(view.state.doc.toString()).toBe('First line\\\nx more');
    expect(separatorHeights(view)).toEqual([]);
    view.destroy();
  });

  it('normal Enter still starts a new paragraph, with the paragraph gap', () => {
    const view = mountView('First line');
    // The real Enter chain: Clutter's Markdown Enter, then the generic newline.
    markdownEnterCommand(view) || insertNewlineAndIndent(view);

    expect(view.state.doc.toString()).toBe('First line\n');
    expect(separatorHeights(view)).toEqual([SEPARATOR.normal]);
    view.destroy();
  });

  it('inside a list item: no list or paragraph gap before the continuation line', () => {
    const view = mountView('- item');
    insertSoftLineBreak(view);
    expect(view.state.doc.toString()).toBe('- item\\\n  ');
    expect(separatorHeights(view)).toEqual([]);

    type(view, 'more');
    expect(view.state.doc.toString()).toBe('- item\\\n  more');
    expect(separatorHeights(view)).toEqual([]);
    view.destroy();
  });

  it('inside a blockquote: the continuation line stays contiguous', () => {
    const view = mountView('> quoted');
    insertSoftLineBreak(view);
    expect(view.state.doc.toString()).toBe('> quoted\\\n> ');
    expect(separatorHeights(view)).toEqual([]);

    type(view, 'more');
    expect(separatorHeights(view)).toEqual([]);
    view.destroy();
  });

  it('leaving the empty line shows the literal backslash and the real paragraph gap; returning restores the break', () => {
    const view = mountView('First line');
    insertSoftLineBreak(view);
    expect(separatorHeights(view)).toEqual([]);

    view.dispatch({ selection: { anchor: 0 } });
    expect(separatorHeights(view)).toEqual([SEPARATOR.normal]);

    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(separatorHeights(view)).toEqual([]);
    view.destroy();
  });

  it('undo and redo keep the spacing consistent with the document', () => {
    const view = mountView('First line');
    insertSoftLineBreak(view);
    type(view, 'S');
    expect(separatorHeights(view)).toEqual([]);

    // CM6 may group the break and the typing that follows it into one history event; either way the spacing
    // must match the document at every step.
    undo(view);
    expect(['First line', 'First line\\\n', 'First line\\\nS']).toContain(view.state.doc.toString());
    undo(view);
    expect(view.state.doc.toString()).toBe('First line');
    expect(separatorHeights(view)).toEqual([]);

    redo(view);
    redo(view);
    expect(view.state.doc.toString()).toBe('First line\\\nS');
    expect(separatorHeights(view)).toEqual([]);
    view.destroy();
  });
});
