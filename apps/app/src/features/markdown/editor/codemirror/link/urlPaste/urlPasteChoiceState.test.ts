// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, undoDepth } from '@codemirror/commands';

import { markdownLanguageExtension } from '../../markdownLanguage';
import { clearUrlPasteEntry, findUrlPasteEntryById, getUrlPasteEntries, urlPasteChoiceField } from './urlPasteChoiceState';

function mountView(doc = ''): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), history(), urlPasteChoiceField],
  });
  return new EditorView({ state, parent });
}

function paste(view: EditorView, text: string, at = view.state.doc.length) {
  view.dispatch({
    changes: { from: at, insert: text },
    userEvent: 'input.paste',
    selection: { anchor: at + text.length },
  });
}

function type(view: EditorView, text: string, at = view.state.doc.length) {
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
  });
}

/** Mirrors MarkdownEditor.tsx's handleChooseMarkdownLink — a single, ordinary, undo-eligible transaction. */
function chooseMarkdownLink(view: EditorView, id: number) {
  const entry = findUrlPasteEntryById(view.state, id);
  if (!entry) {
    return;
  }
  view.dispatch({
    changes: { from: entry.from, to: entry.to, insert: `[](${entry.url})` },
    selection: { anchor: entry.from + 1 },
    effects: clearUrlPasteEntry.of(entry.id),
  });
}

/** Mirrors MarkdownEditor.tsx's handleChooseUrl — appends one space, caret after it. */
function chooseUrl(view: EditorView, id: number) {
  const entry = findUrlPasteEntryById(view.state, id);
  if (!entry) {
    return;
  }
  view.dispatch({
    changes: { from: entry.to, insert: ' ' },
    selection: { anchor: entry.to + 1 },
    effects: clearUrlPasteEntry.of(entry.id),
  });
}

describe('urlPasteChoiceField', () => {
  it('pasting a plain HTTPS URL creates a pending entry', () => {
    const view = mountView();
    paste(view, 'https://example.com/article');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('https://example.com/article');
  });

  it('pasting a plain HTTP URL creates no entry (HTTPS only)', () => {
    const view = mountView();
    paste(view, 'http://example.com/article');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting a full Markdown link creates no entry', () => {
    const view = mountView();
    paste(view, '[Example](https://example.com/article)');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting an empty-label Markdown link creates no entry', () => {
    const view = mountView();
    paste(view, '[](https://example.com/article)');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting an autolink creates no entry', () => {
    const view = mountView();
    paste(view, '<https://example.com/article>');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('manually typing the same URL character-by-character creates no entry', () => {
    const view = mountView();
    for (const ch of 'https://example.com') {
      type(view, ch);
    }

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('a paste containing a URL plus surrounding text creates no entry', () => {
    const view = mountView();
    paste(view, 'check this out: https://example.com/article');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('choosing "Markdown link" converts the URL and places the selection inside the brackets', () => {
    const view = mountView();
    paste(view, 'https://example.com/article');
    const id = getUrlPasteEntries(view.state)[0]!.id;

    chooseMarkdownLink(view, id);

    expect(view.state.doc.toString()).toBe('[](https://example.com/article)');
    expect(view.state.selection.main.head).toBe(1);
    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('the Markdown-link conversion is a normal, undoable transaction', () => {
    const view = mountView();
    // Widely-spaced `Transaction.time` on the paste (mirroring the
    // established technique elsewhere in this codebase for forcing
    // separate history groups in a fast synchronous test) — real usage
    // has the paste and the menu choice separated by at least a mouse
    // click, well outside CM6's default 500ms `newGroupDelay` window.
    view.dispatch({
      changes: { from: 0, insert: 'https://example.com/article' },
      userEvent: 'input.paste',
      selection: { anchor: 'https://example.com/article'.length },
      annotations: Transaction.time.of(1),
    });
    const id = getUrlPasteEntries(view.state)[0]!.id;

    chooseMarkdownLink(view, id);
    expect(undoDepth(view.state)).toBe(2); // the paste, then the conversion — separate steps

    undo(view);
    expect(view.state.doc.toString()).toBe('https://example.com/article');
  });

  it('choosing "URL" appends exactly one space after the URL and places the cursor after it', () => {
    const view = mountView();
    paste(view, 'https://example.com/article');
    const id = getUrlPasteEntries(view.state)[0]!.id;

    chooseUrl(view, id);

    expect(view.state.doc.toString()).toBe('https://example.com/article ');
    expect(view.state.selection.main.head).toBe('https://example.com/article '.length);
    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('the "URL" choice is a normal, undoable transaction that restores the original pasted URL', () => {
    const view = mountView();
    view.dispatch({
      changes: { from: 0, insert: 'https://example.com/article' },
      userEvent: 'input.paste',
      selection: { anchor: 'https://example.com/article'.length },
      annotations: Transaction.time.of(1),
    });
    const id = getUrlPasteEntries(view.state)[0]!.id;

    chooseUrl(view, id);
    expect(undoDepth(view.state)).toBe(2); // the paste, then the "URL" choice — separate steps

    undo(view);
    expect(view.state.doc.toString()).toBe('https://example.com/article');
  });

  it('dismissal (Escape/click-outside) leaves the raw URL unchanged — distinct from explicitly choosing "URL"', () => {
    const view = mountView();
    paste(view, 'https://example.com/article');
    const id = getUrlPasteEntries(view.state)[0]!.id;

    // Escape/click-outside routes to the identical clearUrlPasteEntry call.
    view.dispatch({ effects: clearUrlPasteEntry.of(id) });

    expect(view.state.doc.toString()).toBe('https://example.com/article');
  });

  it('editing the pasted URL text drops the entry (menu no longer applies)', () => {
    const view = mountView();
    paste(view, 'https://example.com/article');
    const { from } = getUrlPasteEntries(view.state)[0]!;

    view.dispatch({ changes: { from, to: from + 1, insert: 'x' } });

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('duplicate URL pastes get independent entries with distinct ids', () => {
    const view = mountView();
    paste(view, 'https://example.com');
    type(view, '\n\n');
    paste(view, 'https://example.com');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).not.toBe(entries[1]!.id);
  });

  it('choosing Markdown link for one duplicate occurrence does not affect the other', () => {
    const view = mountView();
    paste(view, 'https://example.com');
    type(view, '\n\n');
    paste(view, 'https://example.com');
    const [first, second] = getUrlPasteEntries(view.state) as [
      ReturnType<typeof getUrlPasteEntries>[number],
      ReturnType<typeof getUrlPasteEntries>[number],
    ];

    chooseMarkdownLink(view, first.id);

    const doc = view.state.doc.toString();
    expect(doc.startsWith('[](https://example.com)')).toBe(true);
    expect(doc.endsWith('https://example.com')).toBe(true);
    expect(getUrlPasteEntries(view.state)).toHaveLength(1);
    expect(getUrlPasteEntries(view.state)[0]!.id).toBe(second.id);
  });

  it('pasting a bare HTTPS URL still creates a pending entry (existing scheme behavior preserved)', () => {
    const view = mountView();
    paste(view, 'https://example.com');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('https://example.com');
  });

  it('pasting a bare HTTP URL still creates no entry (existing scheme behavior preserved)', () => {
    const view = mountView();
    paste(view, 'http://example.com');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting a domain-labeled Markdown link (label doubles as the destination domain) creates a pending entry', () => {
    const view = mountView();
    paste(view, '[www.example.com](https://www.example.com)');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('[www.example.com](https://www.example.com)');
  });

  it('pasting a bare scheme-less domain creates a pending entry', () => {
    const view = mountView();
    paste(view, 'example.com');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('example.com');
  });

  it('pasting a bare scheme-less domain with a path creates a pending entry', () => {
    const view = mountView();
    paste(view, 'example.com/path');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('example.com/path');
  });

  it('pasting a domain-labeled Markdown link with a path creates a pending entry', () => {
    const view = mountView();
    paste(view, '[www.example.com/path](https://www.example.com/path)');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('[www.example.com/path](https://www.example.com/path)');
  });

  it('pasting example.org creates a pending entry', () => {
    const view = mountView();
    paste(view, 'example.org');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('example.org');
  });

  it('pasting a multi-label TLD domain (example.co.uk) creates a pending entry', () => {
    const view = mountView();
    paste(view, 'example.co.uk');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('example.co.uk');
  });

  it('pasting google.com creates a pending entry', () => {
    const view = mountView();
    paste(view, 'google.com');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('google.com');
  });

  it('pasting google.co.in creates a pending entry', () => {
    const view = mountView();
    paste(view, 'google.co.in');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('google.co.in');
  });

  it('pasting [www.google.co.in](https://www.google.co.in) creates a pending entry', () => {
    const view = mountView();
    paste(view, '[www.google.co.in](https://www.google.co.in)');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('[www.google.co.in](https://www.google.co.in)');
  });

  it('pasting a scheme-less domain with a query string creates a pending entry', () => {
    const view = mountView();
    paste(view, 'example.co.uk/path?q=test');

    const entries = getUrlPasteEntries(view.state);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.url).toBe('example.co.uk/path?q=test');
  });

  it('pasting an absolute /docs Markdown path creates no entry', () => {
    const view = mountView();
    paste(view, '/docs');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting a bare ?query destination creates no entry', () => {
    const view = mountView();
    paste(view, '?query');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting a relative file path with no domain-like host creates no entry', () => {
    const view = mountView();
    paste(view, 'some/file.txt');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting a relative ./docs destination creates no entry', () => {
    const view = mountView();
    paste(view, './docs');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting a relative ../docs destination creates no entry', () => {
    const view = mountView();
    paste(view, '../docs');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('pasting a #section fragment creates no entry', () => {
    const view = mountView();
    paste(view, '#section');

    expect(getUrlPasteEntries(view.state)).toHaveLength(0);
  });

  it('unrelated edits before the URL preserve the entry and shift its position', () => {
    const view = mountView();
    paste(view, 'https://example.com/article');
    const before = getUrlPasteEntries(view.state)[0]!;

    view.dispatch({ changes: { from: 0, insert: 'prefix ' } });

    const after = getUrlPasteEntries(view.state)[0]!;
    expect(after.id).toBe(before.id);
    expect(after.from).toBe(before.from + 'prefix '.length);
    expect(view.state.sliceDoc(after.from, after.to)).toBe('https://example.com/article');
  });
});
