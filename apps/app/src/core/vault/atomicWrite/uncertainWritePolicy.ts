import type { InspectionResult, WriteAttempt, WriteIntent } from './AtomicWriteContract';

/**
 * What to do after a write whose outcome is `uncertain` (ADR-063, decision 13). Pure: it decides, it performs
 * nothing. The caller has already inspected the destination; **no retry of any kind may be planned without that
 * inspection** (`mayRetryWithoutInspecting`).
 *
 * The invariants it encodes, each tested:
 * - the original intent is preserved: a create stays a create, nothing is ever "upgraded" into a blind replace;
 * - where the previous content was observed, a replace is retried as a *conditional* replace against exactly that
 *   content, so an intervening change makes the retry fail (`staleExpected`) instead of overwriting;
 * - different content is never overwritten: the recovery record is kept and the conflict goes to reconciliation;
 * - a missing destination is handled explicitly, never silently re-created through a replace;
 * - visible attempted content is recognised as visible, and **durability is not claimed**: it stays unconfirmed
 *   until `confirmDurability` says otherwise.
 *
 * Who asked is irrelevant: an automatic retry and the user's manual Retry get the same decision. The unavoidable
 * race remains: between the final comparison and the rename an application that does not take Clutter's lock can
 * still change the file; a conditional replace narrows that window, it cannot close it.
 */
export type UncertainDecision =
  /** The attempted content is on disk. Visible is not durable: confirm durability before releasing recovery data. */
  | { readonly action: 'visible-durability-unconfirmed' }
  /** The write did not take effect. Retrying is safe, with exactly this request (the intent is preserved). */
  | { readonly action: 'retry'; readonly request: WriteAttempt; readonly keepRecoveryRecord: true }
  /** The destination holds something else. Do not write; keep the recovery record; reconcile. */
  | { readonly action: 'conflict'; readonly keepRecoveryRecord: true }
  /** The file is gone and the intent does not allow creating it. Do not re-create; reconcile. */
  | { readonly action: 'target-missing'; readonly keepRecoveryRecord: true }
  /** The inspection itself was refused or failed. The outcome is still uncertain; ask again later. */
  | { readonly action: 'still-uncertain'; readonly keepRecoveryRecord: true };

export type RetryTrigger = 'automatic' | 'manual';

export function decideAfterUncertain(
  attempt: WriteAttempt,
  previous: string | null,
  inspection: InspectionResult,
  // Deliberately unused for the decision: a manual Retry must not bypass the checks.
  _trigger: RetryTrigger = 'automatic'
): UncertainDecision {
  if (inspection.status !== 'inspected') {
    return { action: 'still-uncertain', keepRecoveryRecord: true };
  }

  switch (inspection.target) {
    case 'holdsAttempted':
      return { action: 'visible-durability-unconfirmed' };

    case 'holdsOther':
      return { action: 'conflict', keepRecoveryRecord: true };

    case 'holdsPrevious':
      return {
        action: 'retry',
        request: { ...attempt, intent: retryIntent(attempt.intent, previous) },
        keepRecoveryRecord: true,
      };

    case 'missing':
      switch (attempt.intent.kind) {
        // Nothing was installed and nothing is there: a create is simply still to do, as a create.
        case 'create':
        // An upsert is allowed to create.
        case 'upsert':
          return { action: 'retry', request: { ...attempt }, keepRecoveryRecord: true };
        // A replace never creates: the file was deleted behind the app.
        case 'replace':
        case 'replaceIfContent':
          return { action: 'target-missing', keepRecoveryRecord: true };
      }
  }
}

/**
 * The intent to retry with after the destination was seen holding the previous content. A replace becomes a
 * conditional replace against that observed content; a conditional replace keeps its own expectation; a create and
 * an upsert that find nothing to compare keep their intent unchanged.
 */
function retryIntent(intent: WriteIntent, previous: string | null): WriteIntent {
  switch (intent.kind) {
    case 'replace':
    case 'upsert':
      return previous === null ? intent : { kind: 'replaceIfContent', expected: previous };
    case 'replaceIfContent':
    case 'create':
      return intent;
  }
}

/** True only for outcomes that did not leave the destination in doubt. An uncertain one must be inspected first. */
export function mayRetryWithoutInspecting(outcomeStatus: 'committed' | 'notCommitted' | 'uncertain'): boolean {
  return outcomeStatus === 'notCommitted';
}
