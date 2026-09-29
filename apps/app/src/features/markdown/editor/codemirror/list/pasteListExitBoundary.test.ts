// @vitest-environment jsdom
import { syntaxTree } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { markdownEnterCommand, markdownEnterKeymap } from '../enter/markdownEnterKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { listLineDecoration } from './listLineDecoration';
import { listMarkerDecoration } from './listMarkerDecoration';
import { pasteListExitBoundary } from './pasteListExitBoundary';

function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      listLineDecoration(),
      listMarkerDecoration(),
      pasteListExitBoundary(),
      ...extraExtensions,
    ],
  });
  return new EditorView({ state, parent });
}

/** Dispatches a plain-text insert carrying the exact `userEvent` CM6's own default paste handler uses, at the given position. */
function paste(view: EditorView, pos: number, text: string): void {
  view.dispatch({
    changes: { from: pos, to: pos, insert: text },
    userEvent: 'input.paste',
  });
}

/** The same insert, but as ordinary typed input (no paste annotation). */
function type(view: EditorView, pos: number, text: string): void {
  view.dispatch({
    changes: { from: pos, to: pos, insert: text },
    userEvent: 'input.type',
  });
}

function lines(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-line'));
}

function hasListLine(line: HTMLElement): boolean {
  return line.className.includes('cm-list-line');
}

/** Every ancestor node name at `pos`, innermost first — for asserting the pasted paragraph is NOT inside a ListItem. */
function ancestorNamesAt(view: EditorView, pos: number): string[] {
  const names: string[] = [];
  let node = syntaxTree(view.state).resolveInner(pos, 1);
  for (; node; node = node.parent!) {
    names.push(node.name);
    if (!node.parent) break;
  }
  return names;
}

describe('pasteListExitBoundary', () => {
  it('unordered list: a paste landing directly after the list (no blank line) becomes a top-level paragraph', () => {
    const view = mountView('- Item one\n- Item two\n');
    paste(view, view.state.doc.length, 'This is a normal paragraph.');

    expect(view.state.doc.toString()).toBe(
      '- Item one\n- Item two\n\nThis is a normal paragraph.'
    );

    const pastedPos = view.state.doc.toString().indexOf('This is a normal paragraph.');
    expect(ancestorNamesAt(view, pastedPos)).not.toContain('ListItem');

    const lastLine = lines(view).at(-1)!;
    expect(lastLine.textContent).toBe('This is a normal paragraph.');
    expect(hasListLine(lastLine)).toBe(false);
    expect(lastLine.style.getPropertyValue('--list-indent-px')).toBe('');
  });

  it('ordered list: a paste landing directly after the list (no blank line) becomes a top-level paragraph', () => {
    const view = mountView('1. Item one\n2. Item two\n');
    paste(view, view.state.doc.length, 'This is a normal paragraph.');

    expect(view.state.doc.toString()).toBe(
      '1. Item one\n2. Item two\n\nThis is a normal paragraph.'
    );

    const pastedPos = view.state.doc.toString().indexOf('This is a normal paragraph.');
    expect(ancestorNamesAt(view, pastedPos)).not.toContain('ListItem');

    const lastLine = lines(view).at(-1)!;
    expect(hasListLine(lastLine)).toBe(false);
  });

  it('task: a paste landing directly after the list (no blank line) becomes a top-level paragraph', () => {
    const view = mountView('- [ ] Task one\n- [ ] Task two\n');
    paste(view, view.state.doc.length, 'This is a normal paragraph.');

    expect(view.state.doc.toString()).toBe(
      '- [ ] Task one\n- [ ] Task two\n\nThis is a normal paragraph.'
    );

    const pastedPos = view.state.doc.toString().indexOf('This is a normal paragraph.');
    expect(ancestorNamesAt(view, pastedPos)).not.toContain('ListItem');

    const lastLine = lines(view).at(-1)!;
    expect(hasListLine(lastLine)).toBe(false);
  });

  it('the exact field-reported text, pasted directly after a list with no blank line, is no longer classified as list content', () => {
    const view = mountView('- Item one\n- Item two\n');
    paste(
      view,
      view.state.doc.length,
      "Now let's look at the actual TaskOperations.ts file to see the existing task mutation pattern..."
    );

    const lastLine = lines(view).at(-1)!;
    expect(lastLine.textContent).toBe(
      "Now let's look at the actual TaskOperations.ts file to see the existing task mutation pattern..."
    );
    expect(hasListLine(lastLine)).toBe(false);
    expect(lastLine.style.getPropertyValue('--list-indent-px')).toBe('');
  });

  it('does not touch a paste that already has a real blank line separating it from the list', () => {
    const view = mountView('- Item one\n- Item two\n\n');
    paste(view, view.state.doc.length, 'This is a normal paragraph.');

    // Already correct — no second blank line should be introduced.
    expect(view.state.doc.toString()).toBe(
      '- Item one\n- Item two\n\nThis is a normal paragraph.'
    );
  });

  it('does not touch a paste that lands mid-line (not a fresh paragraph on its own line)', () => {
    const view = mountView('- Item one\n- Item two');
    const midLinePos = view.state.doc.length - 3; // inside "two"
    paste(view, midLinePos, 'XYZ');

    expect(view.state.doc.toString()).toBe('- Item one\n- Item XYZtwo');
  });

  it('does not touch a paste unrelated to any list', () => {
    const view = mountView('Just a plain paragraph.\n\n');
    paste(view, view.state.doc.length, 'Another plain paragraph.');

    expect(view.state.doc.toString()).toBe(
      'Just a plain paragraph.\n\nAnother plain paragraph.'
    );
  });

  it('leaves normal typing completely unaffected — CommonMark lazy continuation still applies to typed text', () => {
    const view = mountView('- Item one\n- Item two\n');
    type(view, view.state.doc.length, 'Typed paragraph');

    // No `input.paste` annotation — the filter never runs.
    expect(view.state.doc.toString()).toBe('- Item one\n- Item two\nTyped paragraph');
    const lastLine = lines(view).at(-1)!;
    expect(hasListLine(lastLine)).toBe(true);
  });

  it('preserves multiline pasted content verbatim after the inserted boundary', () => {
    const view = mountView('- Item one\n- Item two\n');
    paste(view, view.state.doc.length, 'First line\nSecond line\nThird line');

    expect(view.state.doc.toString()).toBe(
      '- Item one\n- Item two\n\nFirst line\nSecond line\nThird line'
    );
  });

  it('existing list rendering/indentation is unaffected by this extension being present', () => {
    const view = mountView('- Item one\n- Item two\n');
    const [first, second] = lines(view);
    expect(hasListLine(first!)).toBe(true);
    expect(hasListLine(second!)).toBe(true);
  });
});

describe('markdownEnterCommand — existing list-exit behavior (investigation baseline)', () => {
  function pressEnter(doc: string, cursorPos: number): { doc: string; cursorPos: number } {
    const state = EditorState.create({
      doc,
      selection: { anchor: cursorPos },
      extensions: [markdownLanguageExtension(), markdownEnterKeymap()],
    });
    let result: { doc: string; cursorPos: number } = { doc, cursorPos };
    const dispatch = (tr: import('@codemirror/state').Transaction) => {
      result = { doc: tr.state.doc.toString(), cursorPos: tr.state.selection.main.head };
    };
    const handled = markdownEnterCommand({ state, dispatch });
    if (!handled) {
      throw new Error('markdownEnterCommand declined');
    }
    return result;
  }

  it('Enter at the end of a list item creates a new list item (continuation)', () => {
    const doc = '- Item one\n- Item two';
    const { doc: after } = pressEnter(doc, doc.length);
    expect(after).toBe('- Item one\n- Item two\n- ');
  });

  it('Enter on an empty trailing list item exits the list — but only merges back to a lazy-continuation-eligible position, NOT a blank-line boundary (locked upstream behavior, not changed by this fix)', () => {
    const doc = '- Item one\n- Item two\n- ';
    const { doc: after } = pressEnter(doc, doc.length);
    // Matches markdownEnterKeymap.test.ts's own locked assertion for this
    // exact shape ('- one\n- |' + Enter -> '- one\n|'): no blank line is
    // inserted here. This is exactly why the fix above has to live in the
    // paste pipeline rather than "extend" this command — this command
    // does not, on its own, ever produce the paragraph boundary a
    // subsequent paste (or typed text) would need.
    expect(after).toBe('- Item one\n- Item two\n');
  });
});
