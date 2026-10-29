import type {
  MoveFileOptions,
  VaultEntry,
  VaultFileStat,
  VaultFileSystem,
  VaultWriteIntent,
} from '../providers/VaultFileSystem';
import {
  AtomicExternalChangeError,
  AtomicNotCommittedError,
  AtomicUncertainError,
} from './atomicWriteErrors';
import type { AtomicVaultWriter, WriteAttempt, WriteIntent } from './AtomicWriteContract';
import type { DurabilityTracker } from './DurabilityTracker';
import { decideAfterUncertain } from './uncertainWritePolicy';

interface UncertainWrite {
  readonly attempt: WriteAttempt;
  readonly tempPaths: readonly string[];
}

/**
 * A `VaultFileSystem` whose text writes replace a file whole through the atomic writer (ADR-063). It is the single
 * place every vault writer shares (the Persistence Gate, Sync's repairs, the state files), so they all follow one
 * policy at once: there is no state in which one of them truncates a file in place while another replaces it.
 *
 * What it adds to the writer:
 * - the intent a caller states is passed on as is, never inferred; a call without one is a programming error;
 * - a committed write is a successful `writeFile`; if its flush only partly succeeded, the revision is handed to the
 *   `DurabilityTracker` and the call still succeeds (it must never be retried by rewriting);
 * - a write that did not happen throws `AtomicNotCommittedError`; one whose effect could not be proven is inspected
 *   at once and again before any later write to the same path, and throws `AtomicUncertainError` while it stays in
 *   doubt, `AtomicExternalChangeError` if the file turns out to hold something else.
 *
 * Reads, moves, deletes and binary writes are the inner provider's, unchanged.
 */
export class AtomicWriteFileSystem implements VaultFileSystem {
  readonly writesAreAtomic = true;

  private readonly uncertain = new Map<string, UncertainWrite>();
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(
    private readonly inner: VaultFileSystem,
    private readonly writer: AtomicVaultWriter,
    private readonly durability?: DurabilityTracker,
    /**
     * Throws when the provider must not write (a lost root, a folder rename in progress: `LocalVaultProvider.seal`).
     * The native writer knows nothing of that, so the seal is honoured here, before anything reaches it.
     */
    private readonly assertWritable?: () => void
  ) {}

  exists(path: string) {
    return this.inner.exists(path);
  }
  createDirectory(path: string) {
    return this.inner.createDirectory(path);
  }
  readDirectory(path: string): Promise<VaultEntry[]> {
    return this.inner.readDirectory(path);
  }
  readFile(path: string) {
    return this.inner.readFile(path);
  }
  deleteFile(path: string, options?: { recursive?: boolean }) {
    return this.inner.deleteFile(path, options);
  }
  moveFile(sourcePath: string, destinationPath: string, options?: MoveFileOptions) {
    return this.inner.moveFile(sourcePath, destinationPath, options);
  }
  copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string) {
    return this.inner.copyFile(sourceAbsolutePath, destinationAbsolutePath);
  }
  duplicate(sourcePath: string, kind: 'file' | 'directory'): Promise<string> {
    return this.inner.duplicate!(sourcePath, kind);
  }
  stat(path: string): Promise<VaultFileStat> {
    return this.inner.stat!(path);
  }
  readBinaryFile(path: string): Promise<Uint8Array> {
    return this.inner.readBinaryFile!(path);
  }
  writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
    return this.inner.writeBinaryFile!(path, bytes);
  }

  /** Whether a write to this path is currently in doubt (an inspection is owed before the next one). */
  hasUncertainWrite(path: string): boolean {
    return this.uncertain.has(path);
  }

  writeFile(path: string, contents: string, intent?: VaultWriteIntent): Promise<void> {
    try {
      this.assertWritable?.();
    } catch (error) {
      return Promise.reject(error);
    }
    if (intent === undefined) {
      return Promise.reject(new TypeError(`A vault write must state its intent (create, replace, upsert or replaceIf): ${path}`));
    }
    const attempt: WriteAttempt = { path, contents, intent: toWriteIntent(intent) };
    // One write per path at a time, in request order: the in-doubt state below is per path.
    const previous = this.tails.get(path) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.write(attempt));
    this.tails.set(path, run.catch(() => undefined));

    return run;
  }

  private async write(attempt: WriteAttempt): Promise<void> {
    await this.settleEarlierDoubt(attempt);
    await this.record(attempt, await this.writer.write(attempt));
  }

  private async record(attempt: WriteAttempt, outcome: Awaited<ReturnType<AtomicVaultWriter['write']>>): Promise<void> {
    switch (outcome.status) {
      case 'committed':
        if (outcome.durability.status === 'unconfirmed') this.durability?.register(attempt.path, attempt.contents);
        return;

      case 'notCommitted':
        throw new AtomicNotCommittedError(outcome.reason, outcome.detail, outcome.leftovers);

      case 'uncertain': {
        this.uncertain.set(attempt.path, { attempt, tempPaths: outcome.recoveryPaths });
        const resolved = await this.resolveDoubt(attempt.path);
        if (resolved === 'committed') return;
        if (resolved === 'not-committed' || resolved === 'missing') {
          const gone = resolved === 'missing' && (attempt.intent.kind === 'replace' || attempt.intent.kind === 'replaceIfContent');
          throw new AtomicNotCommittedError(
            gone ? 'targetMissing' : 'io',
            `${outcome.detail} (inspected: the replacement did not happen)`
          );
        }
        throw resolved === 'conflict'
          ? new AtomicExternalChangeError(attempt.path)
          : new AtomicUncertainError(outcome.detail, outcome.recoveryPaths);
      }
    }
  }

  /** Before writing to a path with a write in doubt, find out what that write did. */
  private async settleEarlierDoubt(next: WriteAttempt): Promise<void> {
    if (!this.uncertain.has(next.path)) return;
    const resolved = await this.resolveDoubt(next.path);

    if (resolved === 'still-uncertain') {
      throw new AtomicUncertainError('an earlier save of this note is still in doubt', this.uncertain.get(next.path)?.tempPaths ?? []);
    }
    if (resolved === 'conflict') {
      throw new AtomicExternalChangeError(next.path);
    }
    if (resolved === 'missing' && (next.intent.kind === 'replace' || next.intent.kind === 'replaceIfContent')) {
      throw new AtomicNotCommittedError('targetMissing', 'the file is gone');
    }
  }

  /**
   * Inspects a path with a write in doubt and settles it. `committed`: the attempted content is on disk (its flush
   * is unconfirmed, so it is tracked). `not-committed`: the replacement provably did not happen. `missing`: nothing
   * is there. `conflict`: the file holds something else; the doubt is cleared so a later explicit save is not blocked
   * forever, but this one is not written. `still-uncertain`: the inspection itself failed; the doubt stays.
   */
  private async resolveDoubt(path: string): Promise<'committed' | 'not-committed' | 'missing' | 'conflict' | 'still-uncertain'> {
    const doubt = this.uncertain.get(path);
    if (!doubt) return 'not-committed';

    let inspection;
    try {
      inspection = await this.writer.inspect({
        path,
        attempted: doubt.attempt.contents,
        previous: null,
        tempPaths: doubt.tempPaths,
      });
    } catch {
      return 'still-uncertain';
    }

    const decision = decideAfterUncertain(doubt.attempt, null, inspection);
    switch (decision.action) {
      case 'visible-durability-unconfirmed':
        this.uncertain.delete(path);
        this.durability?.register(path, doubt.attempt.contents);
        return 'committed';
      case 'retry':
        this.uncertain.delete(path);
        return inspection.status === 'inspected' && inspection.target === 'missing' ? 'missing' : 'not-committed';
      case 'target-missing':
        this.uncertain.delete(path);
        return 'missing';
      case 'conflict':
        this.uncertain.delete(path);
        return 'conflict';
      case 'still-uncertain':
        return 'still-uncertain';
    }
  }
}

function toWriteIntent(intent: VaultWriteIntent): WriteIntent {
  if (typeof intent === 'object') return { kind: 'replaceIfContent', expected: intent.replaceIf };

  return { kind: intent };
}
