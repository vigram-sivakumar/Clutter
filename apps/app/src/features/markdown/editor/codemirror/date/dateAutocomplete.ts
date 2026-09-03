import { CompletionContext } from '@codemirror/autocomplete';
import type { EditorState, Extension } from '@codemirror/state';

import { completionReactivation, type CompletionZone } from '../completionLifecycle';
import { extractDateTriggerQuery } from './dateTrigger';

/**
 * Date's own "zone" for the shared reactivation lifecycle
 * (`completionLifecycle.ts`). Unlike WikiLink/Embed, `@` has no closing
 * delimiter and no Lezer node at all until it forms a complete, valid
 * date shape (an unterminated/invalid `@` never parses as a `Date` node —
 * see `markdownLanguage.regression.test.ts`), so there is no syntax-tree
 * interior to point at the way `referenceZoneAt`/`embedReferenceZoneAt`
 * do. Reusing Date's own trigger extractor — the exact boundary
 * `dateCompletionSource.ts` itself queries against — as the zone finder
 * is both simpler and can never drift from what the completion source
 * itself considers "inside a live `@` query": a constructed
 * `CompletionContext` (`explicit: false`, the same public constructor CM6
 * builds completion sources from) at `pos`, with the query span (content
 * after the `@`) as the zone. `from === to` (an empty query) is exactly
 * "nothing typed after `@` yet" — the only "empty" state `@` can be in,
 * since there's no interior to navigate into when nothing follows it.
 */
function dateReactivationZoneAt(state: EditorState, pos: number): CompletionZone | null {
  const trigger = extractDateTriggerQuery(new CompletionContext(state, pos, false));
  if (!trigger) {
    return null;
  }

  const from = trigger.from + 1;
  return { from, to: from + trigger.query.length };
}

/**
 * Date's own non-`autocompletion()` completion extras — the counterpart
 * to `wikiLinkAutocomplete()`/`embedAutocomplete()`, closing the gap the
 * investigation found: Date previously had no reactivation lifecycle at
 * all, so arrow-key/click navigation back into an existing empty `@`
 * (autocomplete dismissed via Escape or click-elsewhere) never reopened
 * it. `@codemirror/autocomplete`'s own `autocompletion()` call lives in
 * `codemirror/completion.ts`.
 */
export function dateAutocomplete(): Extension {
  return completionReactivation(dateReactivationZoneAt);
}
