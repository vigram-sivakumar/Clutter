// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableDeletionGuard } from './tableDeletionGuard';

/** Includes `defaultKeymap` so a "guard defers" assertion actually exercises real native deletion, not just the absence of a dispatch. */
function mountView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), tableDeletionGuard(), keymap.of(defaultKeymap)],
  });
  return new EditorView({ state, parent });
}

/** Dispatches a real keydown through the view exactly as the browser would, so the guard's own keymap binding runs (not a call to its internal command directly). */
function dispatchKey(view: EditorView, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}

const TABLE = '| Name | Role |\n| - | - |\n| Vik | UX |';

describe('tableDeletionGuard — Backspace', () => {
  it('blocks at the beginning of a cell (does not delete the preceding space/pipe)', () => {
    const doc = TABLE;
    const vikStart = doc.indexOf('Vik');
    const view = mountView(doc, vikStart);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('blocks inside a fully empty cell', () => {
    const doc = '| A | |\n| - | - |\n| 1 | |';
    const lastRow = '| 1 | |';
    const emptyCellPos = doc.lastIndexOf(lastRow) + lastRow.indexOf('| |') + 2; // between the two pipes
    const view = mountView(doc, emptyCellPos);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('blocks at the true beginning of a table row (does not merge with the previous line)', () => {
    const doc = TABLE;
    const thirdRowStart = doc.lastIndexOf('| Vik');
    const view = mountView(doc, thirdRowStart);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('defers to native behavior in the middle of cell content', () => {
    const doc = TABLE;
    const midVik = doc.indexOf('Vik') + 2; // between "Vi" and "k"
    const view = mountView(doc, midVik);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'Vk'));
  });

  it('has no effect at all outside a table', () => {
    const doc = 'plain paragraph';
    const view = mountView(doc, 5);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe('plai paragraph');
  });

  it('blocks anywhere inside the alignment/delimiter row itself, not just at its boundary', () => {
    const doc = TABLE;
    const midDashes = doc.indexOf('- | -') + 1; // inside the dashes, not at the row's own start/end
    const view = mountView(doc, midDashes);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('blocks immediately after a row\'s own trailing "|" (does not delete it)', () => {
    const doc = TABLE;
    const headerRowEnd = doc.indexOf('\n'); // right after the header row's own trailing "|"
    const view = mountView(doc, headerRowEnd);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('blocks repeatedly from the start of a blank line immediately after the table (outer boundary)', () => {
    const doc = TABLE + '\n\n'; // table, then one genuine blank line right after it
    const blankLineStart = TABLE.length + 1;
    const view = mountView(doc, blankLineStart);
    for (let i = 0; i < 5; i++) {
      dispatchKey(view, 'Backspace');
    }
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(blankLineStart);
  });

  it('does not block ordinary Backspace on a paragraph elsewhere in the document, even one containing a table', () => {
    const doc = 'Some intro text.\n\n' + TABLE;
    const midIntro = doc.indexOf('intro') + 3; // between "int" and "ro"
    const view = mountView(doc, midIntro);
    dispatchKey(view, 'Backspace');
    expect(view.state.doc.toString()).toBe(doc.replace('intro', 'inro'));
  });
});

describe('tableDeletionGuard — Delete', () => {
  it('blocks at the end of a cell (does not delete the following space/pipe)', () => {
    const doc = TABLE;
    const vikEnd = doc.indexOf('Vik') + 3;
    const view = mountView(doc, vikEnd);
    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('blocks at the true end of a table row (does not merge with the next line)', () => {
    const doc = TABLE;
    const headerRowEnd = doc.indexOf('\n');
    const view = mountView(doc, headerRowEnd);
    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('defers to native behavior in the middle of cell content', () => {
    const doc = TABLE;
    const midVik = doc.indexOf('Vik') + 1; // between "V" and "ik"
    const view = mountView(doc, midVik);
    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).toBe(doc.replace('Vik', 'Vk'));
  });

  it('blocks anywhere inside the alignment/delimiter row itself, not just at its boundary', () => {
    const doc = TABLE;
    const midDashes = doc.indexOf('- | -') + 1; // inside the dashes, not at the row's own start/end
    const view = mountView(doc, midDashes);
    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('blocks immediately before a row\'s own leading "|" (does not delete it) — the direct mirror of the trailing-pipe Backspace fix', () => {
    const doc = TABLE;
    const view = mountView(doc, 0); // right before the header row's own leading "|"
    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('blocks repeatedly from the end of a paragraph immediately before the table (outer boundary)', () => {
    const doc = 'Foo\n' + TABLE; // a paragraph directly above the table, no blank line between them
    const paragraphEnd = 'Foo'.length;
    const view = mountView(doc, paragraphEnd);
    for (let i = 0; i < 5; i++) {
      dispatchKey(view, 'Delete');
    }
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(paragraphEnd);
  });
});
