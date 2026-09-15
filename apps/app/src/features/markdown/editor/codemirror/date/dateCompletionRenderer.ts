import type { Completion } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';

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
 *
 * Shows only the human-readable date, formatted with `formatDateDisplay`'s
 * `'shortWeekday'` mode — the same Daily-Note-title format
 * (`toResourcePageModel.ts`, `DateWidget.ts`'s own doc comment) but with
 * an abbreviated weekday (`Sat` rather than `Saturday`), since this popup
 * row has less room than a page title — rather than `dateSuggestion.label`
 * directly. A raw `YYYY-MM-DD` used to be shown alongside the label for
 * date identification, but that's redundant once the label itself always
 * spells out the full calendar date: unlike `label` (bare "Today"/
 * "Tomorrow" for the relative-keyword suggestions, with no date attached
 * at all), `formatDateDisplay('shortWeekday')` always includes the
 * day/month/year, so there's no information the ISO value added that this
 * doesn't already show. `isoDate` itself is untouched — still the only
 * value that ever reaches the document (`dateCompletionSource.ts`'s
 * `apply()`).
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
  label.textContent = formatDateDisplay(completion.dateSuggestion.isoDate, 'shortWeekday');
  row.appendChild(label);

  return row;
}
