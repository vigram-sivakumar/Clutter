// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { completionStatus } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { acceptReferenceForDisplayName, wikiLinkAutocomplete } from './wikiLinkAutocomplete';
import type { GetWikiLinkSuggestions } from './wikiLinkSuggestion';

function mountView(doc: string, getSuggestions: GetWikiLinkSuggestions): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), wikiLinkAutocomplete(() => getSuggestions)],
  });
  return new EditorView({ state, parent });
}

/** Inserts `text` at `pos`, tagged the same way real keyboard typing is, so CM6's own completion machinery activates exactly as it would for a user. */
function type(view: EditorView, pos: number, text: string): number {
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
    userEvent: 'input.type',
  });
  return pos + text.length;
}

/**
 * `@codemirror/autocomplete`'s own `activateOnTypingDelay` (default
 * 100ms, `index.js:379`) debounces the actual source invocation behind a
 * real `setTimeout` — a typing transaction moves completion state to
 * `'pending'` synchronously, but the source itself (and thus a resolved
 * `'active'` state with a real selection) only arrives after this delay.
 */
async function waitForQuery(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe('acceptReferenceForDisplayName ("|" key command)', () => {
  it('commits the currently-selected completion as the reference and inserts a literal "|", for a fresh not-yet-closed link', async () => {
    const getSuggestions: GetWikiLinkSuggestions = () => [
      { kind: 'page' as const, path: 'News', title: 'News', breadcrumb: null },
      { kind: 'page' as const, path: 'New Note', title: 'New Note', breadcrumb: null },
    ];
    const view = mountView('x [[N', getSuggestions);
    type(view, 5, 'e'); // 'x [[N' -> 'x [[Ne'
    await waitForQuery();
    expect(completionStatus(view.state)).toBe('active');

    const handled = acceptReferenceForDisplayName(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('x [[News|]]');
    expect(view.state.selection.main.head).toBe('x [[News|'.length);
  });

  it('closes the completion popup after committing the reference', async () => {
    const getSuggestions: GetWikiLinkSuggestions = () => [
      { kind: 'page' as const, path: 'News', title: 'News', breadcrumb: null },
    ];
    const view = mountView('x [[N', getSuggestions);
    type(view, 5, 'e');
    await waitForQuery();
    expect(completionStatus(view.state)).toBe('active');

    acceptReferenceForDisplayName(view);

    expect(completionStatus(view.state)).toBeNull();
  });

  it('does nothing (returns false, lets "|" insert normally) when no completion is active', () => {
    const view = mountView('x [[Ne', () => []);

    const handled = acceptReferenceForDisplayName(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe('x [[Ne');
  });

  it('does nothing when the cursor is inside an already-closed WikiLink (avoids a redundant second pipe)', async () => {
    const getSuggestions: GetWikiLinkSuggestions = () => [
      { kind: 'page' as const, path: 'News', title: 'News', breadcrumb: null },
    ];
    const view = mountView('x [[News|My news]] y', getSuggestions);
    view.dispatch({ changes: { from: 6, to: 6, insert: '' }, selection: { anchor: 6 }, userEvent: 'input.type' });
    await waitForQuery();

    const handled = acceptReferenceForDisplayName(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe('x [[News|My news]] y');
  });

  it('fires the create() side effect for a create suggestion', async () => {
    const create = vi.fn();
    const getSuggestions: GetWikiLinkSuggestions = (query) => [{ kind: 'create' as const, path: query, create }];
    const view = mountView('x [[Brand New', getSuggestions);
    type(view, 13, ' Page');
    await waitForQuery();
    expect(completionStatus(view.state)).toBe('active');

    const handled = acceptReferenceForDisplayName(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('x [[Brand New Page|]]');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('reference vs display-name activation (integration, via a real dispatched transaction)', () => {
  it('typing inside the reference of a fresh link activates completion', async () => {
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'News', title: 'News', breadcrumb: null },
    ]);
    const view = mountView('x [[N', getSuggestions);

    type(view, 5, 'e');
    await waitForQuery();

    expect(getSuggestions).toHaveBeenCalledWith('Ne');
    expect(completionStatus(view.state)).toBe('active');
  });

  it('typing more display-name text after "|" does not reactivate completion', async () => {
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'News', title: 'News', breadcrumb: null },
    ]);
    const view = mountView('x [[News|', getSuggestions);

    const pos = type(view, 9, 'My news');
    await waitForQuery();

    expect(completionStatus(view.state)).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
    expect(view.state.doc.sliceString(pos - 'My news'.length, pos)).toBe('My news');
  });

  it('editing the reference of an already-closed link reactivates completion, queried by the reference text only', async () => {
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'New', title: 'New', breadcrumb: null },
    ]);
    // 'x [[News|My news]] y', deleting the trailing "s" of "News" (position 8 -> 7).
    const view = mountView('x [[News|My news]] y', getSuggestions);

    view.dispatch({ changes: { from: 7, to: 8 }, selection: { anchor: 7 }, userEvent: 'delete.backward' });
    await waitForQuery();

    expect(getSuggestions).toHaveBeenCalledWith('New');
    expect(completionStatus(view.state)).toBe('active');
  });

  it('forward-deleting the FIRST character of an existing reference reactivates completion — cursor position must not gate activation', async () => {
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'ew note', title: 'ew note', breadcrumb: null },
    ]);
    // 'x [[New note|My alias]] y' — reference "New note" occupies indices 4..12.
    const view = mountView('x [[New note|My alias]] y', getSuggestions);

    // A forward Delete at position 4 (right after "[[") removes the
    // leading "N", leaving the cursor exactly at the reference's own
    // start with "ew note" still ahead of it.
    view.dispatch({ changes: { from: 4, to: 5 }, selection: { anchor: 4 }, userEvent: 'delete.forward' });
    await waitForQuery();

    expect(getSuggestions).toHaveBeenCalledWith('ew note');
    expect(completionStatus(view.state)).toBe('active');
  });

  it('deleting a character from the middle or end of an existing reference reactivates completion identically to deleting from the start', async () => {
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'New ote', title: 'New ote', breadcrumb: null },
      { kind: 'page' as const, path: 'New not', title: 'New not', breadcrumb: null },
    ]);

    // Middle: 'x [[New note]] y' -> delete the "n" of "note" (index 8).
    const middleView = mountView('x [[New note]] y', getSuggestions);
    middleView.dispatch({ changes: { from: 8, to: 9 }, selection: { anchor: 8 }, userEvent: 'delete.forward' });
    await waitForQuery();
    expect(completionStatus(middleView.state)).toBe('active');

    // End: 'x [[New note]] y' -> delete the trailing "e" (index 11, right before "]]").
    const endView = mountView('x [[New note]] y', getSuggestions);
    endView.dispatch({ changes: { from: 11, to: 12 }, selection: { anchor: 11 }, userEvent: 'delete.forward' });
    await waitForQuery();
    expect(completionStatus(endView.state)).toBe('active');
  });

  it('editing the display-name portion of an already-closed link does NOT activate completion', async () => {
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'News', title: 'News', breadcrumb: null },
    ]);
    const view = mountView('x [[News|My news]] y', getSuggestions);

    // Edits inside "My news" (indices 9..16), e.g. inserting a character.
    view.dispatch({ changes: { from: 11, insert: 'X' }, selection: { anchor: 12 }, userEvent: 'input.type' });
    await waitForQuery();

    expect(getSuggestions).not.toHaveBeenCalled();
    expect(completionStatus(view.state)).toBeNull();
  });

  it('merely placing the cursor inside an existing reference (no edit) never activates completion', async () => {
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'News', title: 'News', breadcrumb: null },
    ]);
    const view = mountView('x [[News|My news]] y', getSuggestions);

    view.dispatch({ selection: { anchor: 6 } }); // selection-only transaction — no changes
    await waitForQuery();

    expect(getSuggestions).not.toHaveBeenCalled();
    expect(completionStatus(view.state)).toBeNull();
  });

  it('removing the "|" falls back to normal (whole-text) reference editing', async () => {
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'NewsXX', title: 'NewsXX', breadcrumb: null },
    ]);
    const view = mountView('x [[News|X]] y', getSuggestions);

    // Removes the "|" at index 8, merging reference and what was the alias into one span ("NewsX"), then types an "X" at that same seam ("NewsXX").
    view.dispatch({ changes: { from: 8, to: 9 }, selection: { anchor: 8 }, userEvent: 'delete.backward' });
    view.dispatch({ changes: { from: 8, insert: 'X' }, selection: { anchor: 9 }, userEvent: 'input.type' });
    await waitForQuery();

    // The FULL current reference ("NewsXX"), not just the prefix up to
    // the cursor ("NewsX") — the cursor sits one character before the
    // reference's own end here, so a prefix-based query would have
    // silently dropped that trailing "X".
    expect(getSuggestions).toHaveBeenLastCalledWith('NewsXX');
    expect(completionStatus(view.state)).toBe('active');
  });
});
