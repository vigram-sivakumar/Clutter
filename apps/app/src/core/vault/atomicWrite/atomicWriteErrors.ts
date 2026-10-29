import { PERMANENT_NOT_COMMITTED_REASONS, type NotCommittedReason } from './AtomicWriteContract';

/**
 * What a save through the atomic provider can fail with (ADR-063, decision 13). The three are different situations
 * and callers must be able to tell them apart:
 *
 * - `AtomicNotCommittedError`: nothing changed, the original is intact. Retrying is safe if the reason can change.
 * - `AtomicUncertainError`: the replacement's effect could not be proven. Nothing is retried blindly; the next write
 *   to the path inspects first.
 * - `AtomicExternalChangeError`: after an uncertain write the file holds something Clutter did not write. Nothing was
 *   overwritten; Sync reconciles and the unsaved text stays in crash recovery.
 *
 * A committed write is never an error, whatever its durability: "saved, flush pending" is reported to the
 * `DurabilityTracker`, not thrown.
 */
export class AtomicNotCommittedError extends Error {
  readonly name = 'AtomicNotCommittedError';

  constructor(
    readonly reason: NotCommittedReason,
    readonly detail: string,
    readonly leftovers: readonly string[] = []
  ) {
    super(`The save was not written (${reason}): ${detail}`);
  }

  /** Whether trying again can change the answer. */
  get retryable(): boolean {
    return !PERMANENT_NOT_COMMITTED_REASONS.has(this.reason);
  }
}

export class AtomicUncertainError extends Error {
  readonly name = 'AtomicUncertainError';

  constructor(
    readonly detail: string,
    readonly recoveryPaths: readonly string[]
  ) {
    super(`The save may or may not have been written: ${detail}`);
  }
}

export class AtomicExternalChangeError extends Error {
  readonly name = 'AtomicExternalChangeError';

  constructor(readonly path: string) {
    super(`The file changed on disk while a save was in doubt, so nothing was written: ${path}`);
  }
}

/**
 * What the user needs to be told about a failed save, which is not always "try again":
 * - `failed`: nothing was written and trying again can help (no room, a locked file, anything unclassified);
 * - `changed-on-disk`: the file holds something this app did not write, so a repeat would overwrite it;
 * - `unverified`: the save may or may not have landed; the next attempt checks before it writes;
 * - `unsupported-location`: this location cannot be saved to safely, and trying again will not change that.
 */
export type SaveFailureKind = 'failed' | 'changed-on-disk' | 'unverified' | 'unsupported-location';

export function classifySaveFailure(error: unknown): SaveFailureKind {
  if (error instanceof AtomicExternalChangeError) return 'changed-on-disk';
  if (error instanceof AtomicUncertainError) return 'unverified';
  if (error instanceof AtomicNotCommittedError && (error.reason === 'unsupportedFilesystem' || error.reason === 'unsupportedOperation')) {
    return 'unsupported-location';
  }

  return 'failed';
}

/**
 * Whether the bounded automatic retry should run for a failed save. Only an atomic failure that can change is
 * retried; an uncertain or externally-changed one is not (the inspection runs on the next explicit save), and an
 * error from any other provider is retried exactly as before.
 */
export function isRetryableSaveFailure(error: unknown): boolean {
  if (error instanceof AtomicNotCommittedError) return error.retryable;
  if (error instanceof AtomicUncertainError || error instanceof AtomicExternalChangeError) return false;

  return true;
}

/**
 * Whether a write was refused because the file is not what the caller read: it changed (`staleExpected`) or appeared
 * (`destinationExists`) in between. A read-modify-write caller re-reads once and redoes its merge; it never retries
 * the same write over the top.
 */
export function isWriteConflict(error: unknown): boolean {
  return error instanceof AtomicNotCommittedError && (error.reason === 'staleExpected' || error.reason === 'destinationExists');
}
