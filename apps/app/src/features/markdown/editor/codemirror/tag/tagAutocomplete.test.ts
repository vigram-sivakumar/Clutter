// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { closeCompletion, completionStatus } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { semanticCompletion } from '../completion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { tagAutocomplete } from './tagAutocomplete';
import type { GetTagSuggestions } from './tagSuggestion';

/**
 * Coverage for `tagAutocomplete()` — the counterpart to
 * `date/dateAutocomplete.test.ts`. Tag, like Date, previously had no
 * reactivation lifecycle at all (see the autocomplete-lifecycle-
 * unification investigation report).
 */
function mountView(doc: string, anchor: number, getSuggestions: GetTagSuggestions): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdownLanguageExtension(),
      semanticCompletion(() => undefined, () => getSuggestions),
      tagAutocomplete(),
    ],
  });
  return new EditorView({ state, parent });
}

async function waitForQuery(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe('tagAutocomplete — empty-target reactivation', () => {
  it('re-entering a bare "#" by cursor placement alone (after the popup was dismissed) reopens autocomplete', async () => {
    const getSuggestions: GetTagSuggestions = () => ['design', 'product'];
    const view = mountView('x # y', 0, getSuggestions);
    view.dispatch({ selection: { anchor: 3 } }); // enters the bare "#" once
    await waitForQuery();
    expect(completionStatus(view.state)).toBe('active');

    closeCompletion(view);
    view.dispatch({ selection: { anchor: 0 } }); // leaves
    expect(completionStatus(view.state)).toBeNull();

    view.dispatch({ selection: { anchor: 3 } }); // re-enters the still-bare "#"
    await waitForQuery();

    expect(completionStatus(view.state)).toBe('active');
  });

  it('merely moving the cursor into an already-populated "#design" does NOT auto-open', async () => {
    const getSuggestions: GetTagSuggestions = vi.fn(() => ['design']);
    const view = mountView('x #design y', 0, getSuggestions);

    view.dispatch({ selection: { anchor: 6 } }); // lands inside "design", no edit
    await waitForQuery();

    expect(completionStatus(view.state)).toBeNull();
  });

  it('deleting into an existing tag reactivates completion, filtered by what remains', async () => {
    const getSuggestions: GetTagSuggestions = (query) =>
      ['design', 'desk'].filter((name) => name.startsWith(query));
    const view = mountView('x #design y', 0, getSuggestions);

    // Backspace the trailing "n" off "design", as a real Backspace would.
    // "x #design y": x(0) (1)#(2)d(3)e(4)s(5)i(6)g(7)n(8) (9)y(10) — "n" is at index 8.
    const from = 8;
    view.dispatch({
      changes: { from, to: from + 1, insert: '' },
      selection: { anchor: from },
      userEvent: 'delete.backward',
    });
    await waitForQuery();

    expect(completionStatus(view.state)).toBe('active');
  });
});
