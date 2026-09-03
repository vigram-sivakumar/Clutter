// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { closeCompletion, completionStatus } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { semanticCompletion } from '../completion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { dateAutocomplete } from './dateAutocomplete';

/**
 * Coverage for `dateAutocomplete()` — the reactivation lifecycle Date
 * previously had none of (see the autocomplete-lifecycle-unification
 * investigation report: unlike WikiLink/Embed, Date had no listener for
 * either "re-entering an existing empty target" or "deleting into an
 * existing value" reopening completion). Mirrors
 * `wikilink/wikiLinkAutocomplete.test.ts`'s "empty-reference activation"
 * suite in shape; Date has no reference-vs-alias split, so there is no
 * counterpart to that file's `|`-key tests.
 */
function mountView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), semanticCompletion(() => undefined), dateAutocomplete()],
  });
  return new EditorView({ state, parent });
}

async function waitForQuery(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe('dateAutocomplete — empty-target reactivation', () => {
  it('re-entering a bare "@" by cursor placement alone (after the popup was dismissed) reopens autocomplete', async () => {
    const view = mountView('x @ y', 0);
    view.dispatch({ selection: { anchor: 3 } }); // enters the bare "@" once
    await waitForQuery();
    expect(completionStatus(view.state)).toBe('active');

    closeCompletion(view);
    view.dispatch({ selection: { anchor: 0 } }); // leaves
    expect(completionStatus(view.state)).toBeNull();

    view.dispatch({ selection: { anchor: 3 } }); // re-enters the still-bare "@"
    await waitForQuery();

    expect(completionStatus(view.state)).toBe('active');
  });

  it('merely moving the cursor into an already-valid "@2026-08-22" does NOT auto-open', async () => {
    const doc = 'x @2026-08-22 y';
    const view = mountView(doc, 0);

    view.dispatch({ selection: { anchor: 6 } }); // lands inside the date, no edit
    await waitForQuery();

    expect(completionStatus(view.state)).toBeNull();
  });

  it('deleting into an existing value reactivates completion, filtered by what remains', async () => {
    const view = mountView('x @Tomorrow y', 0);

    // Backspace the trailing "w" off "Tomorrow", as a real Backspace would
    // — "Tomorro" still prefix-matches the "Tomorrow" relative keyword, so
    // this exercises reactivation without also depending on
    // getDateSuggestions's own resolution rules for a specific date shape.
    const from = 10; // right before the "w" in "Tomorrow"
    view.dispatch({
      changes: { from, to: from + 1, insert: '' },
      selection: { anchor: from },
      userEvent: 'delete.backward',
    });
    await waitForQuery();

    expect(completionStatus(view.state)).toBe('active');
  });
});
