// @vitest-environment jsdom
import { history, undo } from '@codemirror/commands';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { markdownEnterCommand, insertSoftLineBreak } from '../enter/markdownEnterKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import {
  deleteAroundHardBreakBackward,
  deleteAroundHardBreakForward,
  hardBreakMarkerDecoration,
} from './hardBreakMarkerDecoration';

function mount(source: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc: source.replace('|', ''),
      selection: EditorSelection.cursor(source.indexOf('|')),
      extensions: [markdownLanguageExtension(), hardBreakMarkerDecoration(), history()],
    }),
    parent,
  });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  return view;
}

const shown = (view: EditorView) => {
  const pos = view.state.selection.main.head;
  const text = view.state.doc.toString();
  return text.slice(0, pos) + '|' + text.slice(pos);
};
/** What the user sees: the content DOM's text, one entry per line. */
const visibleLines = (view: EditorView) =>
  Array.from(view.contentDOM.querySelectorAll('.cm-line')).map((line) => line.textContent);
const run = (view: EditorView, command: typeof deleteAroundHardBreakBackward) => {
  const handled = command(view);
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  return handled;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the hard-break backslash is hidden but stays in the document', () => {
  it('shows no backslash for a break, in a paragraph, a list item and a quote', () => {
    expect(visibleLines(mount('one\\\ntwo|'))).toEqual(['one', 'two']);
    expect(visibleLines(mount('- one\\\n  two|'))).toHaveLength(2);
    expect(mount('- one\\\n  two|').contentDOM.textContent).not.toContain('\\');
    expect(mount('> one\\\n> two|').contentDOM.textContent).not.toContain('\\');
  });

  it('keeps the backslash in the document text', () => {
    const view = mount('one\\\ntwo|');

    expect(view.state.doc.toString()).toBe('one\\\ntwo');
  });

  it('Shift+Enter leaves no visible backslash', () => {
    const view = mount('Hello|');
    insertSoftLineBreak(view);

    expect(view.state.doc.toString()).toBe('Hello\\\n');
    expect(view.contentDOM.textContent).toBe('Hello');
  });

  it('right after Shift+Enter the backslash is already hidden, and returns if the new line is left empty', () => {
    const view = mount('Hello|');
    insertSoftLineBreak(view);
    expect(view.contentDOM.textContent).toBe('Hello');

    view.dispatch({ selection: { anchor: 0 } });
    expect(view.contentDOM.textContent).toBe('Hello\\');
  });

  it('a backslash the parser does not treat as a break stays visible', () => {
    expect(mount('end\\|').contentDOM.textContent).toBe('end\\');
    expect(mount('a\\\\\nb|').contentDOM.textContent).toContain('\\');
    expect(mount('`a\\`\nb|').contentDOM.textContent).toContain('\\');
  });

  it('two-space breaks have nothing to hide and are untouched', () => {
    const view = mount('one  \ntwo|');

    expect(view.state.doc.toString()).toBe('one  \ntwo');
  });
});

describe('editing around the hidden marker', () => {
  it('Backspace at the end of the line deletes the visible character, not the invisible backslash', () => {
    const view = mount('one\\|\ntwo');

    expect(run(view, deleteAroundHardBreakBackward)).toBe(true);
    expect(shown(view)).toBe('on\\|\ntwo');
  });

  it('Backspace at the start of the next line removes the break and joins the lines', () => {
    const view = mount('one\\\n|two');

    run(view, deleteAroundHardBreakBackward);

    expect(shown(view)).toBe('one|two');
  });

  it('removes a list item\'s and a quote\'s continuation indentation with it', () => {
    const list = mount('- one\\\n  |two');
    run(list, deleteAroundHardBreakBackward);
    expect(shown(list)).toBe('- one|two');

    const quote = mount('> one\\\n> |two');
    run(quote, deleteAroundHardBreakBackward);
    expect(shown(quote)).toBe('> one|two');
  });

  it('Delete at the end of the line removes the break and joins the next line', () => {
    const view = mount('one\\|\ntwo');

    run(view, deleteAroundHardBreakForward);

    expect(shown(view)).toBe('one|two');
  });

  it('Delete before the hidden backslash does the same', () => {
    const view = mount('one|\\\ntwo');

    run(view, deleteAroundHardBreakForward);

    expect(shown(view)).toBe('one|two');
  });

  it('is not ours on ordinary lines, selections, or a literal trailing backslash', () => {
    expect(run(mount('plain|\nline'), deleteAroundHardBreakBackward)).toBe(false);
    expect(run(mount('plain|\nline'), deleteAroundHardBreakForward)).toBe(false);
    expect(run(mount('end\\|'), deleteAroundHardBreakBackward)).toBe(false);
    const selected = mount('one\\\ntwo|');
    selected.dispatch({ selection: EditorSelection.range(0, 3) });
    expect(run(selected, deleteAroundHardBreakBackward)).toBe(false);
  });

  it('one undo restores the break after deleting it', () => {
    const view = mount('one\\\n|two');
    run(view, deleteAroundHardBreakBackward);

    undo(view);

    expect(view.state.doc.toString()).toBe('one\\\ntwo');
  });

  it('typing after Shift+Enter still works and Enter stays unaffected', () => {
    const view = mount('Hello|');
    insertSoftLineBreak(view);
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'World' } });
    expect(view.state.doc.toString()).toBe('Hello\\\nWorld');
    expect(visibleLines(view)).toEqual(['Hello', 'World']);

    const plain = mount('Hello|');
    markdownEnterCommand(plain) || plain.dispatch({ changes: { from: 5, insert: '\n' } });
    expect(plain.state.doc.toString()).toBe('Hello\n');
  });
});
