import type { Completion } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { DateSuggestion } from './dateSuggestion';

import './dateCompletion.css';

/**
 * The one property `dateCompletionSource.ts` adds on top of CM6's own
 * `Completion` shape — mirrors `WikiLinkCompletion`'s `suggestion` field,
 * deliberately under a *different* property name (`dateSuggestion`, not
 * `suggestion`) so `renderDateCompletion`/`renderWikiLinkCompletion` can
 * each cheaply tell whether a given `Completion` is theirs to render.
 * This distinction is required, not optional: CM6's `addToOptions` calls
 * every registered `render` callback for every visible option regardless
 * of which `CompletionSource` produced it (confirmed by reading
 * `@codemirror/autocomplete`'s own `optionContent()` source — there is no
 * per-source scoping), which only became a real coexistence question once
 * WikiLink's and Date's completion sources started sharing one
 * `autocompletion()` call (`codemirror/completion.ts`).
 */
export interface DateCompletion extends Completion {
  readonly dateSuggestion: DateSuggestion;
}

function isDateCompletion(completion: Completion): completion is DateCompletion {
  return 'dateSuggestion' in completion;
}

/**
 * `autocompletion()`'s `addToOptions[].render` hook, mirroring
 * `renderWikiLinkCompletion`'s shape/rationale (plain DOM, not React — see
 * that file's own comment). Returns `null` for any completion that isn't
 * its own kind (see `DateCompletion`'s doc comment for why that check is
 * required now that multiple sources share one `addToOptions` array).
 */
export function renderDateCompletion(
  completion: Completion,
  _state: EditorState,
  _view: EditorView
): Node | null {
  if (!isDateCompletion(completion)) {
    return null;
  }

  const row = document.createElement('div');
  row.className = 'date-completion';

  const label = document.createElement('span');
  label.className = 'date-completion__label';
  label.textContent = completion.dateSuggestion.label;
  row.appendChild(label);

  const iso = document.createElement('span');
  iso.className = 'date-completion__iso';
  iso.textContent = completion.dateSuggestion.isoDate;
  row.appendChild(iso);

  return row;
}
