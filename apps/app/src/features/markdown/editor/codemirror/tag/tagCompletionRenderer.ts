import type { Completion } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import './tagCompletion.css';

/**
 * `autocompletion()`'s `addToOptions[].render` hook, mirroring
 * `renderWikiLinkCompletion`'s/`renderDateCompletion`'s shape and
 * rationale exactly: `wikiLinkAutocompleteTheme()` (shared by every
 * source in the one `autocompletion()` call, `codemirror/completion.ts`)
 * hides CM6's own default `.cm-completionLabel` element for every popup
 * row, not just WikiLink's — so any source without its own `addToOptions`
 * renderer ends up with a real, correctly-populated option that simply
 * has no visible content. This was Tag's actual bug: the completion
 * source and its data were already correct; nothing filled the gap the
 * shared theme's `display: none` leaves.
 *
 * Detects a Tag completion by its label shape (`#name`, exactly what
 * `tagCompletionSource.ts`'s own `toCompletion` already produces) rather
 * than a dedicated discriminant field like `WikiLinkCompletion.suggestion`/
 * `DateCompletion.dateSuggestion` — `tagCompletionSource.ts` is
 * deliberately out of scope for this fix, so this renderer distinguishes
 * a Tag completion purely from what's already on it. WikiLink's labels
 * are page titles or `Create "X"`, and Date's are relative/absolute date
 * labels (`Today`, `12 August`, ...) — neither ever begins with `#`, so
 * this is an unambiguous, if structurally looser, check within this
 * codebase's fixed set of completion kinds.
 *
 * Returns `null` for any completion that isn't Tag's — required so this
 * cannot interfere with WikiLink's or Date's own rendering, same as their
 * own guards already do for each other.
 */
export function renderTagCompletion(
  completion: Completion,
  _state: EditorState,
  _view: EditorView
): Node | null {
  if (!completion.label.startsWith('#')) {
    return null;
  }

  const row = document.createElement('div');
  row.className = 'tag-completion';
  row.textContent = completion.label;
  return row;
}
