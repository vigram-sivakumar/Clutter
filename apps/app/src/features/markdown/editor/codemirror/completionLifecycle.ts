import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * The reference/query span a completion-driven construct is editing —
 * `WikiLinkReferenceZone`/`EmbedReferenceZone`'s own shape, generalized.
 * `from === to` means the zone is currently empty (nothing typed yet
 * between the trigger and wherever the construct closes, or — for a
 * trigger character with no closing delimiter at all, like `@`/`#` — right
 * after the trigger with no query typed).
 */
export interface CompletionZone {
  readonly from: number;
  readonly to: number;
}

/**
 * Finds the completion-relevant zone (if any) containing `pos`, in
 * whichever way is natural for that construct's own grammar — a
 * syntax-tree node's interior for a bracket-delimited construct
 * (`referenceZoneAt`, `embedReferenceZoneAt`), or a trigger-boundary scan
 * for a construct with no closing delimiter (`@`/`#`). The shared
 * reactivation lifecycle below only ever asks "is `pos` inside a zone, and
 * is that zone empty" — it has no opinion on how the answer is computed.
 */
export type FindCompletionZone = (state: EditorState, pos: number) => CompletionZone | null;

/**
 * The one shared autocomplete re-entry lifecycle every completion-driven
 * Markdown construct needs, extracted from what were, until now,
 * near-identical hand-written pairs in `wikiLinkAutocomplete.ts` and
 * `embedAutocomplete.ts` (and entirely absent for Date/Tag — see
 * docs/editor-architecture-decisions.md's "Currently wired vs. dormant"
 * lineage and the 2026-09 autocomplete-lifecycle-unification investigation
 * report for the full audit this consolidates).
 *
 * `@codemirror/autocomplete`'s own `activateOnTyping` heuristic
 * (`getUpdateType`) only ever sets its `Activate` bit for an
 * insertion-classified transaction (`input.type`) — never for a
 * deletion-classified one (`delete.backward`/`delete.forward`) or a
 * pure-selection (cursor-only) transaction. That default is correct for
 * ordinary word completion, but wrong for editing an already-existing
 * construct's value: deleting into `News` to get `New` must reactivate
 * completion exactly as typing into it would, and clicking/arrow-key-ing
 * into an *empty* target (`[[]]`, `![[]]`, a bare `@`/`#`) must open
 * completion immediately, without requiring the user to type a throwaway
 * character first. Two listeners cover exactly these two gaps, and
 * nothing else:
 *
 * - `reactivateOnZoneDeletion`: after any deletion-classified,
 *   doc-changing transaction, if the cursor now sits inside `findZoneAt`'s
 *   zone (empty or not — deleting into a construct always means "resume
 *   editing its value"), calls the public `startCompletion` command.
 * - `reactivateOnEnteringEmptyZone`: after a pure cursor-move (no doc
 *   change), if the cursor now sits inside a zone that is *empty*, calls
 *   `startCompletion`. Deliberately gated on emptiness only — entering an
 *   already-populated zone via a mere cursor move (click, arrow key) must
 *   never reopen completion; only an actual edit does (which the deletion
 *   listener above, or `@codemirror/autocomplete`'s own
 *   insertion-triggered `activateOnTyping`, already covers). This is the
 *   locked product rule (see the investigation report's product contract,
 *   item 3/4): "entering valid syntax must not open autocomplete; editing
 *   it must." Embed previously had a deliberately *broader* version of
 *   this listener that reopened on entering any non-empty zone too — that
 *   was a documented, intentional divergence from WikiLink's rule at the
 *   time, since reversed (item under "valid-value entry" in the product
 *   contract this module implements) precisely because it violated this
 *   same rule. Embed now gets the identical, narrower behavior for free by
 *   using this shared factory with no override point for the old
 *   broadening — there is no longer a supported way for a construct to
 *   opt into the old, wider behavior.
 *
 * Both listeners guard on `completionStatus(update.state) !== null` before
 * calling `startCompletion` — meaningful primarily for the deletion
 * listener (a `delete.backward`/`delete.forward`-tagged transaction is
 * classified by CM6's own `getUpdateType` as `Backspacing`, not `Reset`,
 * so an already-open popup is left as-is by CM6's own core and doesn't
 * need this module to reopen it). A pure selection-only transaction is a
 * different case: CM6's own core classifies *any* such transaction as a
 * `Reset` regardless of prior status, so by the time either listener here
 * runs, a previously-open popup has already been closed as part of
 * computing `update.state` — the guard is then never actually the thing
 * preventing redundant work for that path; `findZoneAt` simply gets
 * re-consulted fresh, and re-opens if the (possibly unchanged) cursor
 * position is still in an empty zone. This is intentional and harmless,
 * not a gap — see `completionLifecycle.test.ts`'s own note on this.
 */
export function completionReactivation(findZoneAt: FindCompletionZone): Extension {
  const reactivateOnZoneDeletion = EditorView.updateListener.of((update) => {
    if (!update.docChanged || completionStatus(update.state) !== null) {
      return;
    }

    const isDeletion = update.transactions.some((tr) => tr.isUserEvent('delete'));
    if (!isDeletion) {
      return;
    }

    if (findZoneAt(update.state, update.state.selection.main.head)) {
      startCompletion(update.view);
    }
  });

  const reactivateOnEnteringEmptyZone = EditorView.updateListener.of((update) => {
    if (!update.selectionSet || update.docChanged || completionStatus(update.state) !== null) {
      return;
    }

    const zone = findZoneAt(update.state, update.state.selection.main.head);
    if (zone && zone.from === zone.to) {
      startCompletion(update.view);
    }
  });

  return [reactivateOnZoneDeletion, reactivateOnEnteringEmptyZone];
}
