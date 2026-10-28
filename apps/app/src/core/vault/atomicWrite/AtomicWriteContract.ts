/**
 * The contract of the experimental atomic vault writer (ADR-063, Stage 2a).
 *
 * **Nothing in the application uses this yet.** Saves still go through `VaultFileSystem.writeFile`, whose production
 * implementation is the fs plugin's in-place, truncating `writeTextFile`. This contract is deliberately a separate
 * interface (`AtomicVaultWriter`) and not an extension of `VaultFileSystem`: `LocalFileSystem` does not implement it,
 * and a `Promise<void>` from `writeFile` can never be mistaken for one of these outcomes. A caller that holds an
 * `AtomicVaultWriter` knows its `kind`, and therefore whether the guarantees below were enforced by the native layer
 * or merely simulated by a test double.
 */

/**
 * What the caller means by a write. It is part of the request and is **never inferred from an existence check**, so
 * it survives a failure and a retry: a retried create is still a create (ADR-063, decision 11).
 */
export type WriteIntent =
  /** A new file. Anything at the destination, now or at the rename, refuses the write. */
  | { readonly kind: 'create' }
  /** An existing file. A missing one is refused (`targetMissing`); a save never re-creates a deleted note. */
  | { readonly kind: 'replace' }
  /** An existing file, only while it holds exactly `expected`. Anything else is `staleExpected`. */
  | { readonly kind: 'replaceIfContent'; readonly expected: string }
  /** Replace or create, last writer wins. For application state files, never for user content. */
  | { readonly kind: 'upsert' };

export const writeIntent = {
  create: { kind: 'create' } as const satisfies WriteIntent,
  replace: { kind: 'replace' } as const satisfies WriteIntent,
  upsert: { kind: 'upsert' } as const satisfies WriteIntent,
  replaceIfContent: (expected: string): WriteIntent => ({ kind: 'replaceIfContent', expected }),
};

/** Why a write did not happen. The original is intact in every case. */
export type NotCommittedReason =
  | 'readOnlyTarget'
  | 'unsupportedSymlink'
  | 'notARegularFile'
  | 'invalidTarget'
  | 'outOfScope'
  | 'insufficientSpace'
  | 'permissionDenied'
  | 'unsupportedOperation'
  | 'staleExpected'
  | 'targetChanged'
  | 'unsupportedFilesystem'
  | 'metadataPreservationFailed'
  | 'destinationExists'
  | 'destinationAppeared'
  | 'targetMissing'
  | 'io';

/**
 * Reasons that cannot change by trying again. A retry budget is wasted on them; `staleExpected`, `targetMissing` and
 * `destinationExists` additionally mean the file changed behind the app: the caller reconciles, it does not retry as
 * a replace.
 */
export const PERMANENT_NOT_COMMITTED_REASONS: ReadonlySet<NotCommittedReason> = new Set([
  'readOnlyTarget',
  'unsupportedSymlink',
  'notARegularFile',
  'invalidTarget',
  'outOfScope',
  'unsupportedOperation',
  'unsupportedFilesystem',
  'staleExpected',
  'targetMissing',
  'destinationExists',
]);

/** A flush request that did not reach its strongest form. */
export type DurabilityGap =
  | { readonly kind: 'fileFsyncOnly' }
  | { readonly kind: 'directoryFsyncOnly' }
  | { readonly kind: 'directorySyncFailed'; readonly detail: string }
  | { readonly kind: 'fileSyncFailed'; readonly detail: string };

/**
 * How far the flush requests got. `confirmed` is the strongest request the platform offers (`F_FULLFSYNC` on the
 * file and its directory); it is **not** a proof against every drive or power failure.
 */
export type DurabilityStatus =
  | { readonly status: 'confirmed' }
  | { readonly status: 'unconfirmed'; readonly gaps: readonly DurabilityGap[] };

export type AtomicWriteOutcome =
  /** The new content is installed and visible. Nothing can roll that back. Do **not** retry by rewriting. */
  | {
      readonly status: 'committed';
      readonly replaced: 'existing' | 'created';
      readonly durability: DurabilityStatus;
      /** The rename reported an error, but inspection proved the new file is installed. */
      readonly confirmedByInspection: boolean;
      readonly metadataNotes: readonly string[];
      readonly leftovers: readonly string[];
    }
  /** The destination was not modified by this operation. */
  | {
      readonly status: 'notCommitted';
      readonly reason: NotCommittedReason;
      readonly detail: string;
      readonly leftovers: readonly string[];
    }
  /**
   * The replacement returned an error and its effect could not be proven. Never repeat blindly: inspect first
   * (`AtomicVaultWriter.inspect`). `recoveryPaths` may hold the only copy of a revision.
   */
  | { readonly status: 'uncertain'; readonly detail: string; readonly recoveryPaths: readonly string[] };

export type DurabilityResult =
  | { readonly status: 'confirmed' }
  | { readonly status: 'unconfirmed'; readonly gaps: readonly DurabilityGap[] }
  /** The file now holds different content: nothing was flushed on behalf of the revision that was asked about. */
  | { readonly status: 'superseded' }
  | { readonly status: 'missing' }
  | { readonly status: 'refused'; readonly reason: NotCommittedReason; readonly detail: string }
  | { readonly status: 'failed'; readonly detail: string };

export type InspectedTarget = 'holdsAttempted' | 'holdsPrevious' | 'missing' | 'holdsOther';

export type TempState =
  | { readonly state: 'absent' }
  | { readonly state: 'holdsAttempted' }
  | { readonly state: 'holdsOther' }
  | { readonly state: 'unreadable'; readonly detail: string };

export type InspectionResult =
  | {
      readonly status: 'inspected';
      readonly target: InspectedTarget;
      readonly temps: readonly ({ readonly path: string } & TempState)[];
    }
  | { readonly status: 'refused'; readonly reason: NotCommittedReason; readonly detail: string }
  | { readonly status: 'failed'; readonly detail: string };

export interface WriteAttempt {
  readonly path: string;
  readonly intent: WriteIntent;
  readonly contents: string;
}

export interface InspectQuery {
  readonly path: string;
  /** What the uncertain write was installing. */
  readonly attempted: string;
  /** What the destination held before (`null` for a create). */
  readonly previous: string | null;
  /** The temporary files the uncertain outcome listed. */
  readonly tempPaths: readonly string[];
}

/** A request refused before anything was touched (not an outcome: nothing was attempted). */
export type AtomicWriteRefusalCode = 'invalidVaultRoot' | 'invalidPath' | 'outOfScope';

export class AtomicWriteRefusedError extends Error {
  constructor(
    readonly code: AtomicWriteRefusalCode,
    readonly detail: string
  ) {
    super(`The atomic writer refused the request (${code}): ${detail}`);
    this.name = 'AtomicWriteRefusedError';
  }
}

/** The native layer answered with something this contract does not describe. */
export class AtomicWriteProtocolError extends Error {
  constructor(what: string) {
    super(`Unexpected response from the atomic writer: ${what}`);
    this.name = 'AtomicWriteProtocolError';
  }
}

/**
 * The atomic writer. `kind` says who enforces the contract: `native-atomic` is the Rust writer (same-directory
 * temporary file, flush, atomic rename, APFS only, per-path lock); `in-memory-simulation` is a test double that
 * expresses the same semantics over an in-memory filesystem and proves nothing about durability.
 */
export interface AtomicVaultWriter {
  readonly kind: 'native-atomic' | 'in-memory-simulation';
  write(attempt: WriteAttempt): Promise<AtomicWriteOutcome>;
  inspect(query: InspectQuery): Promise<InspectionResult>;
  /** Flushes an installed file and its directory without rewriting it, only while it still holds `expected`. */
  confirmDurability(path: string, expected: string): Promise<DurabilityResult>;
}
