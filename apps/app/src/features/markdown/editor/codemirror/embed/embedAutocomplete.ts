import type { Extension } from '@codemirror/state';

import { completionReactivation } from '../completionLifecycle';
import { embedReferenceZoneAt } from './embedCompletionSource';

/**
 * Embed's own non-`autocompletion()` completion extras — the resource-
 * scoped counterpart to `wikiLinkAutocomplete()`, built on the same shared
 * deletion/empty-entry reactivation lifecycle (`completionLifecycle.ts`).
 *
 * Previously had its own, deliberately *broader* entering-reactivation
 * listener that reopened completion on entering an already-populated
 * reference zone too (not just an empty one) — a documented divergence
 * from WikiLink's narrower rule at the time. That divergence violated the
 * product contract's "entering valid syntax must not open autocomplete;
 * only editing it should" rule (locked 2026-09), so it's gone: Embed now
 * shares the exact same narrower semantics as WikiLink, Date, and Tag —
 * entering an *empty* `![[]]` reopens completion; entering an already-
 * populated `![[hero.png]]` via a mere cursor move does not. Editing it
 * (typing or deleting) still reopens/filters, via
 * `embedCompletionSource.ts`'s own source (typing) and this module's
 * deletion listener (deleting), exactly as before.
 *
 * `@codemirror/autocomplete`'s own `autocompletion()` call itself
 * (triggering, popup lifecycle, positioning, keyboard navigation,
 * dismissal, the shared theme) lives in `codemirror/completion.ts`, the
 * one shared call every `@`/`[[`/`![[` source registers through.
 */
export function embedAutocomplete(): Extension {
  return completionReactivation(embedReferenceZoneAt);
}
