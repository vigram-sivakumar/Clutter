import { CompletionContext } from '@codemirror/autocomplete';
import type { EditorState, Extension } from '@codemirror/state';

import { completionReactivation, type CompletionZone } from '../completionLifecycle';
import { extractTagTriggerQuery } from './tagTrigger';

/**
 * Tag's own "zone" for the shared reactivation lifecycle
 * (`completionLifecycle.ts`) — the counterpart to
 * `date/dateAutocomplete.ts`'s `dateReactivationZoneAt`, same reasoning:
 * `#` has no closing delimiter and no Lezer node until it forms a
 * complete identifier, so there's no syntax-tree interior to reuse the
 * way WikiLink/Embed's bracket zones do. Reuses `tagTrigger.ts`'s own
 * `extractTagTriggerQuery` — unlike Date's, Tag's `to` already extends
 * across the *whole* identifier (not just up to the cursor), so the zone
 * below is exact regardless of where inside an already-typed tag the
 * cursor sits, matching `tagCompletionSource.ts`'s own query span.
 */
function tagReactivationZoneAt(state: EditorState, pos: number): CompletionZone | null {
  const trigger = extractTagTriggerQuery(new CompletionContext(state, pos, false));
  if (!trigger) {
    return null;
  }

  return { from: trigger.from + 1, to: trigger.to };
}

/**
 * Tag's own non-`autocompletion()` completion extras — the counterpart to
 * `wikiLinkAutocomplete()`/`embedAutocomplete()`/`dateAutocomplete()`,
 * closing the same reactivation gap Date had: arrow-key/click navigation
 * back into an existing empty `#` (autocomplete dismissed via Escape or
 * click-elsewhere) previously never reopened it. `@codemirror/autocomplete`'s
 * own `autocompletion()` call lives in `codemirror/completion.ts`.
 */
export function tagAutocomplete(): Extension {
  return completionReactivation(tagReactivationZoneAt);
}
