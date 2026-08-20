// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tagCompletionSource } from './tagCompletionSource';
import type { GetTagSuggestions } from './tagSuggestion';

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
 * `tagCompletionSource` is always synchronous — this cast only narrows
 * `CompletionSource`'s own type (which allows an async source) to what
 * this particular source actually returns, for these tests' benefit.
 */
function call(source: CompletionSource, context: CompletionContext): CompletionResult | null {
  return source(context) as CompletionResult | null;
}

describe('tagCompletionSource', () => {
  it('# opens suggestions, queried with the text typed after it', () => {
    const view = mountView('x #proj');
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['project']);
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 7));

    expect(getSuggestions).toHaveBeenCalledWith('proj');
    expect(result?.from).toBe(2);
    expect(result?.to).toBe(7);
    expect(result?.options).toHaveLength(1);
    expect(result?.options[0]?.label).toBe('#project');
  });

  it('a partial query filters to only the suggestions the injected getter returns', () => {
    const view = mountView('x #wo');
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['work']);
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 5));

    expect(getSuggestions).toHaveBeenCalledWith('wo');
    expect(result?.options).toHaveLength(1);
    expect(result?.options[0]?.label).toBe('#work');
  });

  it('returns null when there is no # before the cursor', () => {
    const view = mountView('hello world');
    const getSuggestions = vi.fn();
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 5));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('invalid preceding context ("foo#tag") does not trigger', () => {
    const view = mountView('foo#tag');
    const getSuggestions = vi.fn();
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 7));

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('a bare # at the very start of the document is a valid preceding context', () => {
    const view = mountView('#proj');
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['project']);
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 5));

    expect(getSuggestions).toHaveBeenCalledWith('proj');
    expect(result?.options).toHaveLength(1);
  });

  it('selecting a suggestion inserts the expected #tag and places the cursor after it', () => {
    const view = mountView('x #proj y');
    const getSuggestions: GetTagSuggestions = () => ['project'];
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 7));
    const option = result?.options[0];
    expect(option).toBeDefined();

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, result?.to ?? 0);
    }

    expect(view.state.doc.toString()).toBe('x #project y');
  });

  it('selecting a suggestion with a space in its display label serializes it with a hyphen (canonical form), never the raw space', () => {
    const view = mountView('x #prod y');
    const getSuggestions: GetTagSuggestions = () => ['Product design'];
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 7));
    const option = result?.options[0];
    expect(option).toBeDefined();
    expect(option?.label).toBe('#Product design');

    if (typeof option?.apply === 'function') {
      option.apply(view, option, result?.from ?? 0, result?.to ?? 0);
    }

    expect(view.state.doc.toString()).toBe('x #Product-design y');
  });

  it('returns null (no popup) when the getter returns no matching tags', () => {
    const view = mountView('x #zzz');
    const getSuggestions: GetTagSuggestions = vi.fn(() => []);
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 6));

    expect(getSuggestions).toHaveBeenCalledWith('zzz');
    expect(result).toBeNull();
  });

  it('returns null when no suggester is injected', () => {
    const view = mountView('x #proj');
    const source = tagCompletionSource(() => undefined);

    expect(call(source, contextAt(view, 7))).toBeNull();
  });

  it('uses the tag nearest the cursor when multiple tags appear on the same line', () => {
    const view = mountView('#foo #bar');
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['bar']);
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 9)); // end of "#bar"

    expect(getSuggestions).toHaveBeenCalledWith('bar');
    expect(result?.from).toBe(5); // the second "#", not the first
  });

  it('queries and replaces the FULL tag when the cursor sits in the middle of it, not just the prefix before the cursor', () => {
    // "#project" — cursor placed between "pro" and "ject".
    const view = mountView('#project');
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['project']);
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 4)); // right after "#pro"

    expect(getSuggestions).toHaveBeenCalledWith('project');
    expect(result?.from).toBe(0);
    expect(result?.to).toBe(8); // end of the full identifier, past the cursor
  });

  it('queries the full tag when the cursor sits at the very start of an existing identifier', () => {
    const view = mountView('#project');
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['project']);
    const source = tagCompletionSource(() => getSuggestions);

    call(source, contextAt(view, 1)); // right after "#"

    expect(getSuggestions).toHaveBeenCalledWith('project');
  });

  it('a space between # and the cursor ends the query — no trigger past a terminated tag', () => {
    const view = mountView('#foo bar');
    const getSuggestions = vi.fn();
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 8)); // end of "bar", well past "#foo "

    expect(result).toBeNull();
    expect(getSuggestions).not.toHaveBeenCalled();
  });

  it('a bare # with nothing typed after it still triggers with an empty query', () => {
    const view = mountView('#');
    const getSuggestions: GetTagSuggestions = vi.fn(() => []);
    const source = tagCompletionSource(() => getSuggestions);

    call(source, contextAt(view, 1));

    expect(getSuggestions).toHaveBeenCalledWith('');
  });

  it('a hyphen/underscore/digit identifier is queried in full, matching tagScanner.ts\'s own identifier grammar', () => {
    const view = mountView('#tag_name-2');
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['tag_name-2']);
    const source = tagCompletionSource(() => getSuggestions);

    const result = call(source, contextAt(view, 11));

    expect(getSuggestions).toHaveBeenCalledWith('tag_name-2');
    expect(result?.to).toBe(11);
  });

  it('a dot, slash, or pipe right after the tag terminates the query there, matching tagScanner.ts', () => {
    const view = mountView('#tag.name');
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['tag']);
    const source = tagCompletionSource(() => getSuggestions);

    // Cursor placed right after "tag", before the ".".
    const result = call(source, contextAt(view, 4));

    expect(getSuggestions).toHaveBeenCalledWith('tag');
    expect(result?.to).toBe(4); // does not extend past the "."
  });
});
