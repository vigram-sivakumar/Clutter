// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkCompletionSource } from './wikiLinkCompletionSource';
import type { GetWikiLinkSuggestions } from './wikiLinkSuggestion';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  return new EditorView({ state, parent });
}

function contextAt(view: EditorView, pos: number): CompletionContext {
  return new CompletionContext(view.state, pos, false);
}

/**
 * `wikiLinkCompletionSource` is always synchronous — this cast only
 * narrows `CompletionSource`'s own type (which allows an async source) to
 * what this particular source actually returns, for these tests' benefit.
 */
function call(source: CompletionSource, context: CompletionContext): CompletionResult | null {
  return source(context) as CompletionResult | null;
}

describe('wikiLinkCompletionSource — fresh, not-yet-closed [[query', () => {
  it('returns null when the cursor is not inside an in-progress [[...', () => {
    const view = mountView('hello world');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 5));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('queries suggestions with the text typed after [[, and returns them as options', () => {
    const view = mountView('x [[Proj');
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'Projects/Alpha', title: 'Alpha', breadcrumb: 'Projects' },
    ]);
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 8));

    expect(getSuggestions).toHaveBeenCalledWith('Proj');
    expect(result?.from).toBe(2);
    expect(result?.options).toHaveLength(1);
    expect(result?.options[0]?.label).toBe('Alpha');
  });

  it('returns null when the query contains an alias separator — "|" is handled entirely by the dedicated keymap command, never by this source', () => {
    const view = mountView('x [[Projects/Page|Alias');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 23));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('returns null when no resolver/suggester is injected', () => {
    const view = mountView('x [[Proj');
    const source = wikiLinkCompletionSource(() => undefined);

    expect(call(source, contextAt(view, 8))).toBeNull();
  });

  it("a 'page' option's apply() replaces the whole [[query with canonical serialized WikiLink text", () => {
    const view = mountView('x [[Proj y');
    const getSuggestions: GetWikiLinkSuggestions = () => [
      { kind: 'page', path: 'Projects/Alpha', title: 'Alpha', breadcrumb: 'Projects' },
    ];
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 8));
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, 8);
    }

    expect(view.state.doc.toString()).toBe('x [[Projects/Alpha]] y');
  });

  it("a 'create' option's apply() inserts the canonical WikiLink AND fires the injected create() side effect", () => {
    const view = mountView('x [[Brand New');
    const create = vi.fn();
    const getSuggestions: GetWikiLinkSuggestions = () => [{ kind: 'create', path: 'Brand New', create }];
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 13));
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, 13);
    }

    expect(view.state.doc.toString()).toBe('x [[Brand New]]');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('wikiLinkCompletionSource — reactivating inside an already-closed WikiLink', () => {
  it('offers completions when the cursor sits inside the reference portion, queried by the FULL current reference text (not just the prefix up to the cursor)', () => {
    // "x [[News|My news]] y" — reference "News" occupies indices 4..7, "|" at 8.
    const view = mountView('x [[News|My news]] y');
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'News', title: 'News', breadcrumb: null },
    ]);
    const source = wikiLinkCompletionSource(() => getSuggestions);

    // Cursor between "Ne" and "ws", i.e. mid-reference — the query must
    // still be the whole reference "News", not just the "Ne" prefix
    // before the cursor (see the "editing the beginning of an existing
    // reference" tests below for exactly why this matters).
    const result = call(source, contextAt(view, 6));

    expect(getSuggestions).toHaveBeenCalledWith('News');
    expect(result).not.toBeNull();
    expect(result?.from).toBe(4);
    expect(result?.to).toBe(8); // ends right before the existing "|" — not the cursor
  });

  it('editing the very beginning of an existing reference still activates completion, queried by the remaining full reference', () => {
    // "x [[New note]] y" — deleting the leading "N" (e.g. a forward
    // Delete with the cursor placed right after "[[") leaves the cursor
    // at the reference's own start, with "ew note" still ahead of it.
    const view = mountView('x [[ew note]] y');
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'ew note', title: 'ew note', breadcrumb: null },
    ]);
    const source = wikiLinkCompletionSource(() => getSuggestions);

    // Cursor at index 4 — exactly `zone.from`, right after "[[".
    const result = call(source, contextAt(view, 4));

    expect(getSuggestions).toHaveBeenCalledWith('ew note');
    expect(result).not.toBeNull();
    expect(result?.options).toHaveLength(1);
  });

  it('editing the middle or end of an existing reference activates completion identically to editing the beginning', () => {
    const view = mountView('x [[New note]] y');
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'New note', title: 'New note', breadcrumb: null },
    ]);
    const source = wikiLinkCompletionSource(() => getSuggestions);

    for (const pos of [4, 7, 12]) {
      // 4 = start, 7 = middle, 12 = end of the reference (right before "]]").
      const result = call(source, contextAt(view, pos));
      expect(result).not.toBeNull();
    }

    expect(getSuggestions).toHaveBeenCalledTimes(3);
    expect(getSuggestions).toHaveBeenCalledWith('New note');
  });

  it('a fully-emptied reference still lets the source attempt to query (an empty query legitimately yielding no suggestions is a separate, unrelated concern)', () => {
    // "x [[]] y" — the reference has been deleted down to nothing.
    const view = mountView('x [[]] y');
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => []);
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 4)); // right after "[["

    expect(getSuggestions).toHaveBeenCalledWith('');
    expect(result).toBeNull(); // legitimately null because the (unrelated) suggester returns [] for '' — not because the source failed to try
  });

  it('returns null (no WikiLink completion) when the cursor is inside the alias portion', () => {
    const view = mountView('x [[News|My news]] y');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    // Cursor inside "My news", well past the "|".
    const result = call(source, contextAt(view, 12));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('returns null exactly at the boundary one character into the alias (right after "|")', () => {
    const view = mountView('x [[News|My news]] y');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 9)); // just past the "|" at index 8

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('still offers completions for the reference of an at-rest link that has no alias at all, querying only the visible filename', () => {
    // "x [[Projects/Page]] y" — no "|", so the whole path is the reference
    // zone, but the query must be scoped to the visible (post-folder)
    // segment "Page" — the folder prefix is concealed while engaged
    // (wikiLinkMarkerDecorations.ts) and must never be exposed to search
    // either. The *replace range* (result.to) still covers the whole
    // reference zone, folder included — that's unaffected by query scoping.
    const view = mountView('x [[Projects/Page]] y');
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'Projects/Page', title: 'Page', breadcrumb: 'Projects' },
    ]);
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 5)); // inside "Projects"

    expect(getSuggestions).toHaveBeenCalledWith('Page');
    expect(result).not.toBeNull();
    expect(result?.to).toBe(17); // right before the closing "]]"
  });

  it('accepting a reactivated reference completion replaces only the reference zone, leaving the alias and closing brackets untouched', () => {
    const view = mountView('x [[News|My news]] y');
    const getSuggestions: GetWikiLinkSuggestions = () => [
      { kind: 'page', path: 'New Note', title: 'New Note', breadcrumb: null },
    ];
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 6));
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, result?.to ?? 0);
    }

    expect(view.state.doc.toString()).toBe('x [[New Note|My news]] y');
  });

  it('nested reference paths work when reactivating an existing reference, querying only the visible filename', () => {
    const view = mountView('x [[Projects/Project A/Note|My note]] y');
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'Projects/Project A/Note', title: 'Note', breadcrumb: 'Projects/Project A' },
    ]);
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const pos = 'x [[Projects/Project A/Note'.length;
    const result = call(source, contextAt(view, pos));

    // Concealment hides up to the LAST unescaped "/", so the query is just
    // "Note" — never the folder segments, even though this reference has
    // two levels of nesting.
    expect(getSuggestions).toHaveBeenCalledWith('Note');
    const option = result?.options[0];
    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, result?.to ?? 0);
    }

    // Accepting still replaces the WHOLE reference zone (folder included)
    // with the picked suggestion's own full canonical path.
    expect(view.state.doc.toString()).toBe('x [[Projects/Project A/Note|My note]] y');
  });

  it('does not activate when the cursor merely touches the WikiLink\'s own opening boundary from outside (text typed immediately before it)', () => {
    // "pro[[Note]]" — cursor at 3 sits exactly at the node's own `from`,
    // touching it from outside (the edit that produced this position —
    // typing "pro" — happened entirely before the node, never inside its
    // reference). Regression for a bug where `referenceZoneAt` checked
    // only `pos <= to`, never `pos >= from`, so this position wrongly
    // satisfied "inside the reference zone".
    const view = mountView('pro[[Note]]');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 3));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('does not activate between the two opening brackets either — still before the reference zone starts', () => {
    // "[[Note]]" — position 1 sits between the two "[" characters: inside
    // the node's own range (so `findWikiLinkAt` matches), but still before
    // `zone.from` (2, right after "[["), the actual start of the editable
    // reference text.
    const view = mountView('[[Note]]');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 1));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('does not activate with the cursor touching the WikiLink from outside on the left, "|[[Note]]"', () => {
    const view = mountView('[[Note]]');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 0));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('does not activate with the cursor touching the WikiLink from outside on the right, "[[Note]]|"', () => {
    const view = mountView('[[Note]]');
    const getSuggestions = vi.fn();
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 8)); // right after "]]"

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('an escaped "\\|" inside an at-rest reference is decoded and does not end the reference zone early', () => {
    // Raw "A\|B" inside the brackets — the escaped pipe is literal content
    // of the reference, not a real alias separator, so there is no alias
    // and the whole "A\|B" is the reference zone.
    const view = mountView('x [[A\\|B]] y');
    const getSuggestions: GetWikiLinkSuggestions = vi.fn(() => [
      { kind: 'page' as const, path: 'A|B', title: 'A|B', breadcrumb: null },
    ]);
    const source = wikiLinkCompletionSource(() => getSuggestions);

    const pos = 'x [[A\\|B'.length; // cursor right after the escaped pipe, still inside the reference
    call(source, contextAt(view, pos));

    expect(getSuggestions).toHaveBeenCalledWith('A|B');
  });
});
