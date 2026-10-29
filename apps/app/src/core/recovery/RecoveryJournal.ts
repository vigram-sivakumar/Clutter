import { fingerprint } from './fingerprint';
import {
  RECOVERY_FORMAT,
  RECOVERY_VERSION,
  committedNameOf,
  compareFreshness,
  isTempRecordName,
  parseRecord,
  newSessionId,
  recordFileName,
  serializeRecord,
  sessionOfFileName,
  type RecoveryDraftInfo,
  type RecoveryKind,
  type RecoveryRecord,
} from './RecoveryRecord';
import type { RecoveryStorage } from './RecoveryStorage';

/** The unsaved work of one page or draft, as PageOperations reports it. */
export interface RecoverableState {
  readonly pageId: string;
  readonly kind: RecoveryKind;
  readonly label: string;
  readonly pagePath: string | null;
  /** The body, only when it has an unsaved change. */
  readonly body: { readonly markdown: string; readonly revision: number } | null;
  /** The title / description, only when they have an unsaved change. */
  readonly title: string | null;
  readonly description: string | null;
  /** The vault's own body text, saved title and saved description right now (null for a draft, which has none). */
  readonly vault: { readonly body: string; readonly title: string; readonly description: string } | null;
  readonly draft: RecoveryDraftInfo | null;
}

/** What the journal needs from PageOperations. */
export interface RecoverySource {
  recoverableState(pageId: string): RecoverableState | null;
  unsavedPageIds(): readonly string[];
  /**
   * Called when a page's unsaved state may have changed; no id means "any page may have". `urgent` asks for a snapshot
   * now rather than after the quiet period (the user is leaving the page). Returns the unsubscribe.
   */
  subscribeUnsaved(listener: (pageId?: string, urgent?: boolean) => void): () => void;
}

/** A record found on disk, with where it is (so it can be removed exactly). */
export interface RecoveryEntry {
  readonly dir: string;
  readonly name: string;
  readonly record: RecoveryRecord;
  /** Other files holding an older copy of the same record, removed together with this one (see `discover`). */
  readonly siblings?: readonly string[];
}

/** What reading one recovery file turned up (see `RecoveryJournal.discover`). */
type ReadFile =
  | { readonly kind: 'record'; readonly record: RecoveryRecord; readonly text: string }
  | { readonly kind: 'missing' }
  /** It read fine but is not a record (it does not parse, or fails the schema). */
  | { readonly kind: 'malformed' }
  /** It could not be read at all, which says nothing about what it holds. */
  | { readonly kind: 'error' }
  /** A valid record, but of another note, session or vault than its name says. */
  | { readonly kind: 'foreign' };

const MISSING: ReadFile = { kind: 'missing' };

export interface RecoveryJournalOptions {
  readonly storage: RecoveryStorage;
  /** The directory records are written to. */
  readonly vaultKey: string;
  /** Other directories this vault's records may be in (the key it had before it had a stable id). Read-only. */
  readonly readKeys?: readonly string[];
  readonly source: RecoverySource;
  /** Quiet time after the last change before a snapshot is written. */
  readonly debounceMs?: number;
  /** The longest a continuously-edited note goes without a snapshot. */
  readonly maxWaitMs?: number;
  /** Delay before re-trying a failed snapshot write, and how many times. */
  readonly retryMs?: number;
  readonly maxRetries?: number;
  readonly now?: () => Date;
  /** This session's tag. A random UUID by default; a test can fix it. */
  readonly session?: string;
  /** Makes a new tag when the one in use is found on disk already (default: a random UUID). For tests. */
  readonly newSession?: () => string;
  readonly onWriteError?: (error: unknown, pageId: string) => void;
  /**
   * True while a saved revision of the note is installed on disk but not yet confirmed durable (ADR-063, decision 13).
   * A note that is clean is normally released; while this holds, its record is kept, because a power loss could still
   * take the saved file back. Call `recheck(pageId)` when it stops holding.
   */
  readonly holdRecord?: (pageId: string) => boolean;
}

export const RECOVERY_DEBOUNCE_MS = 1000;
/**
 * Measured in the real app (debug and release builds): a snapshot write is a few milliseconds, so a snapshot every 2 s of
 * continuous typing costs about half a write per second per dirty note. It was 5 s, which lost up to ~3.5 s of typing in
 * the kill-during-typing measurement.
 */
export const RECOVERY_MAX_WAIT_MS = 2000;
export const RECOVERY_RETRY_MS = 5000;
export const RECOVERY_MAX_RETRIES = 3;

/**
 * Keeps one recovery record per note that has unsaved work, and removes it again once that work is saved.
 *
 * - A note's record is rewritten at most once per `debounceMs` of quiet, and at least once per `maxWaitMs` of
 *   continuous editing: never per keystroke, and the window in which a crash can lose typing is bounded.
 * - Writes are decided when they run, not when they were requested: each one reads the note's state at that moment,
 *   and writes for one note run strictly one after another. A delayed older snapshot therefore can never replace a
 *   newer one, and a record is removed only if the note has nothing unsaved *right now*, so saving an older revision
 *   while a newer one is waiting leaves the newer one protected.
 * - It only ever touches records it wrote this session (file names carry the session tag): a record an earlier
 *   session left, still awaiting the user's decision, is neither overwritten nor removed by anything done here.
 * - A failed write changes nothing about the normal vault save (the journal only reads state), keeps the previous
 *   record, and is retried a bounded number of times.
 */
export class RecoveryJournal {
  private readonly storage: RecoveryStorage;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly retryMs: number;
  private readonly maxRetries: number;
  private readonly now: () => Date;

  private readonly owned = new Set<string>();
  /** Records of earlier sessions handed over by a Restore: kept until the note has nothing unsaved (see `adopt`). */
  private readonly adopted = new Map<string, RecoveryEntry[]>();
  private readonly lastWritten = new Map<string, string>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxWaitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retries = new Map<string, number>();
  private readonly sequences = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private unsubscribe: (() => void) | null = null;
  private disposed = false;
  private sessionTag: string;
  private sessionChecked: Promise<void> | null = null;

  constructor(private readonly options: RecoveryJournalOptions) {
    this.storage = options.storage;
    this.debounceMs = options.debounceMs ?? RECOVERY_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? RECOVERY_MAX_WAIT_MS;
    this.retryMs = options.retryMs ?? RECOVERY_RETRY_MS;
    this.maxRetries = options.maxRetries ?? RECOVERY_MAX_RETRIES;
    this.now = options.now ?? (() => new Date());
    this.sessionTag = options.session ?? (options.newSession ?? newSessionId)();
  }

  /** This session's tag; every file this journal writes carries it. */
  public get session(): string {
    return this.sessionTag;
  }

  /**
   * Makes sure no file in this vault's recovery directory already carries this session's tag before anything is
   * written or discovered. A random UUID makes a clash unrealistic; this makes it impossible to overwrite another
   * session's recovery data silently even so: on a clash a new tag is drawn (up to a bounded number of times).
   */
  private ensureFreshSession(): Promise<void> {
    this.sessionChecked ??= (async () => {
      const make = this.options.newSession ?? newSessionId;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        let names: string[];

        try {
          names = await this.storage.list(this.options.vaultKey);
        } catch {
          return; // Cannot look; the write that follows reports its own failure.
        }
        if (!names.some((name) => sessionOfFileName(name) === this.sessionTag)) return;
        this.sessionTag = make();
      }

      // Every tag drawn was taken: writing now could overwrite another session's record, so nothing is written.
      throw new Error('Recovery: no unused session tag could be found, so no snapshot is written');
    })();

    return this.sessionChecked;
  }

  /** Starts following the source. Anything already unsaved is scheduled. */
  public start(): void {
    this.unsubscribe = this.options.source.subscribeUnsaved((pageId, urgent) => this.schedule(pageId, urgent));
    this.schedule();
  }

  /** Looks at a note again now, e.g. once `holdRecord` stopped holding, so its record can be released. */
  public recheck(pageId: string): void {
    this.schedule(pageId, true);
  }

  /** Stops following and cancels pending timers. Records are left exactly as they are. */
  public dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const timers of [this.debounceTimers, this.maxWaitTimers, this.retryTimers]) {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    }
  }

  /**
   * Writes (or removes) every record that is out of date, and resolves when they have all settled. Used before the
   * Application closes, so the latest state is on disk before the sessions are disposed.
   */
  public async flush(): Promise<void> {
    const ids = new Set<string>([...this.options.source.unsavedPageIds(), ...this.owned, ...this.adopted.keys()]);

    for (const handle of [...this.debounceTimers.values(), ...this.maxWaitTimers.values()]) clearTimeout(handle);
    this.debounceTimers.clear();
    this.maxWaitTimers.clear();
    await Promise.all([...ids].map((pageId) => this.reconcile(pageId)));
  }

  /**
   * Every valid record left for this vault by an earlier session (this session's own files are skipped), plus how
   * many files could not be used. Never throws; a file it cannot read is left where it is.
   *
   * A session writes a snapshot to `<note>.<session>.json.tmp` and renames it over `<note>.<session>.json`. A kill
   * between the two leaves a complete newer record only in the `.tmp` file, so both are read and checked the same way
   * (the record's schema, that its note and session match the file name, and that it belongs to this vault directory),
   * and the two are compared by the writer's own sequence (`compareFreshness`), never by file time.
   *
   * Discovery is read-only: it never writes, renames or deletes anything. A valid `.tmp` record is a candidate where
   * it is, so there is no destination to race for, and an incomplete or unreadable file is ignored, not removed: a
   * `.tmp` that does not parse might be a write still in progress, and one that cannot be read says nothing about what
   * it holds.
   *
   * - a valid `.tmp` newer than the committed record is the candidate. The older committed record (or a malformed
   *   one) is resolved together with it by the user's Restore or Discard, never before;
   * - a `.tmp` older than, or identical to, a valid committed record is not offered; it is attached to the committed
   *   candidate so it goes when that candidate is resolved. A `.tmp` that could not be read, or belongs to another
   *   note, is never attached, offered or deleted, and neither is a committed file that could not be read or holds
   *   another note's record;
   * - a malformed lone `.tmp`, or one malformed beside a valid committed record, is counted as unreadable and left.
   */
  public async discover(): Promise<{ entries: RecoveryEntry[]; unreadable: number }> {
    await this.ensureFreshSession().catch(() => undefined);
    const entries: RecoveryEntry[] = [];
    let unreadable = 0;

    for (const dir of [this.options.vaultKey, ...(this.options.readKeys ?? [])]) {
      let names: string[];

      try {
        names = await this.storage.list(dir);
      } catch {
        unreadable += 1;
        continue;
      }

      const hasCommitted = new Set(names.filter((name) => !isTempRecordName(name)));
      const groups = new Set(names.map(committedNameOf));

      for (const committedName of groups) {
        if (sessionOfFileName(committedName) === this.session) continue;
        const tempName = `${committedName}.tmp`;

        const committed = hasCommitted.has(committedName)
          ? await this.readValid(dir, committedName, committedName)
          : MISSING;
        const temp = names.includes(tempName) ? await this.readValid(dir, tempName, committedName) : MISSING;

        for (const file of [committed, temp]) {
          if (file.kind === 'malformed' || file.kind === 'error' || file.kind === 'foreign') unreadable += 1;
        }

        if (temp.kind === 'record') {
          entries.push(...(await this.settleInterrupted(dir, committedName, tempName, committed, temp)));
          continue;
        }

        if (committed.kind === 'record') {
          entries.push({ dir, name: committedName, record: committed.record });
        }
      }
    }

    return { entries, unreadable };
  }

  /** The valid interrupted record of one note and session against what is committed beside it (see `discover`). */
  private async settleInterrupted(
    dir: string,
    committedName: string,
    tempName: string,
    committed: ReadFile,
    temp: Extract<ReadFile, { kind: 'record' }>
  ): Promise<RecoveryEntry[]> {
    const offerTemp = (siblings: readonly string[]): RecoveryEntry => ({
      dir,
      name: tempName,
      record: temp.record,
      ...(siblings.length > 0 ? { siblings } : {}),
    });

    if (committed.kind === 'record') {
      const order = compareFreshness(temp.record, committed.record);
      const offerCommitted: RecoveryEntry = { dir, name: committedName, record: committed.record };

      if (order < 0 || (order === 0 && temp.text === committed.text)) {
        // Provably superseded (or the very same snapshot): the committed record is the candidate. The temp file is
        // not deleted here; it is removed with the candidate, when the user resolves it.
        return [{ ...offerCommitted, siblings: [tempName] }];
      }
      if (order === 0) {
        // The same position, different content (only possible for records written before `sequence` existed):
        // neither is provably newer, so neither is touched and both are offered, each resolved on its own.
        return [offerCommitted, offerTemp([])];
      }

      // The temp record is newer: it is the candidate, and the older committed record is resolved together with it.
      return [offerTemp([committedName])];
    }

    // A malformed committed file was never a record, so it goes with the candidate; a committed name that could not be
    // read, or holds another note's record, is left strictly alone.
    return [offerTemp(committed.kind === 'malformed' ? [committedName] : [])];
  }

  /** Reads one file and validates it as the record of the note and session `expectedName` names, in this vault. */
  private async readValid(dir: string, name: string, expectedName: string): Promise<ReadFile> {
    let text: string | null;

    try {
      text = await this.storage.read(dir, name);
    } catch {
      return { kind: 'error' };
    }

    if (text === null) return MISSING;
    const record = parseRecord(text);
    if (!record) return { kind: 'malformed' };
    const session = sessionOfFileName(expectedName);
    if (record.vaultKey !== dir || session === null || recordFileName(record.pageId, session) !== expectedName) {
      return { kind: 'foreign' };
    }

    return { kind: 'record', record, text };
  }

  /**
   * Takes over responsibility for records an earlier session left for `pageId`, after a Restore put their content in the
   * editor and this session's own record already protects it. They are kept, not removed, until the note has nothing
   * unsaved (the vault save succeeded): the original stays the second copy through the window in which the new record
   * is the only other one. They are removed together with this session's own record, by the same rule, and a failed
   * removal is retried with it. If the process ends first, both survive and discovery offers them once (identical
   * content) or as the distinct revisions they are.
   */
  public async adopt(pageId: string, entries: readonly RecoveryEntry[]): Promise<void> {
    this.adopted.set(pageId, [...(this.adopted.get(pageId) ?? []), ...entries]);
    await this.reconcile(pageId);
  }

  /** Removes one record file exactly (an explicit discard, a restore that has been re-protected, or an obsolete record). */
  public async removeEntry(entry: Pick<RecoveryEntry, 'dir' | 'name' | 'siblings'>): Promise<void> {
    await this.storage.remove(entry.dir, entry.name);
    for (const sibling of entry.siblings ?? []) await this.storage.remove(entry.dir, sibling);
  }

  /**
   * Snapshots every note that has unsaved work right now and resolves true only if every one is on disk. Used before a
   * decision that leaves the work unsaved (switching Spaces), so what the user is told about a recovery copy is true.
   */
  public async protectAll(): Promise<boolean> {
    const results = await Promise.all(this.options.source.unsavedPageIds().map((pageId) => this.snapshotNow(pageId)));

    return results.every(Boolean);
  }

  /**
   * Writes (or removes) a note's record right now and resolves when that has settled. True when the note's unsaved
   * work is on disk (or it has none); false when the write failed.
   */
  public async snapshotNow(pageId: string): Promise<boolean> {
    // The outcome of this very write, never "an earlier snapshot exists": a failed write of the newest state must not
    // be reported as protected just because an older snapshot of the note is on disk.
    return this.reconcile(pageId);
  }

  /** Removes this session's own record for a note. */
  private async removeOwn(pageId: string): Promise<void> {
    await this.storage.remove(this.options.vaultKey, recordFileName(pageId, this.session));
    // Forgotten only once the file is really gone: a failed removal leaves the note owned, so the retry that follows
    // a failure removes it, instead of leaving a stale record behind with nothing left to clean it up.
    this.owned.delete(pageId);
    this.lastWritten.delete(pageId);
  }

  /** Removes the records a Restore handed over once the note is clean; a failed removal keeps that record and throws. */
  private async removeAdopted(pageId: string): Promise<void> {
    const entries = this.adopted.get(pageId);
    if (!entries) return;

    const failed: RecoveryEntry[] = [];
    let firstError: unknown = null;

    for (const entry of entries) {
      try {
        await this.removeEntry(entry);
      } catch (error) {
        failed.push(entry);
        firstError ??= error;
      }
    }

    if (failed.length === 0) this.adopted.delete(pageId);
    else this.adopted.set(pageId, failed);
    if (firstError !== null) throw firstError;
  }

  // ---- scheduling ----

  private schedule(pageId?: string, urgent = false): void {
    if (this.disposed) return;

    if (pageId === undefined) {
      for (const id of new Set<string>([...this.options.source.unsavedPageIds(), ...this.owned])) this.schedule(id, urgent);
      return;
    }

    if (urgent) {
      // Not blocking whoever asked: the write runs in the background, still one at a time per note.
      this.fire(pageId);
      return;
    }

    const debounce = this.debounceTimers.get(pageId);
    if (debounce !== undefined) clearTimeout(debounce);
    this.debounceTimers.set(
      pageId,
      setTimeout(() => this.fire(pageId), this.debounceMs)
    );

    if (!this.maxWaitTimers.has(pageId)) {
      this.maxWaitTimers.set(
        pageId,
        setTimeout(() => this.fire(pageId), this.maxWaitMs)
      );
    }
  }

  private fire(pageId: string): void {
    for (const timers of [this.debounceTimers, this.maxWaitTimers]) {
      const handle = timers.get(pageId);
      if (handle !== undefined) clearTimeout(handle);
      timers.delete(pageId);
    }
    void this.reconcile(pageId);
  }

  // ---- writing ----

  /** Runs after every earlier reconcile of the same note, so writes for one note never overlap or reorder. */
  private reconcile(pageId: string): Promise<boolean> {
    const previous = this.queues.get(pageId) ?? Promise.resolve();
    const next = previous.then(() => this.reconcileNow(pageId));
    const tail = next.catch(() => undefined);
    this.queues.set(pageId, tail);
    void tail.then(() => {
      if (this.queues.get(pageId) === tail) this.queues.delete(pageId);
    });
    return next;
  }

  /** True when the note's unsaved state is on disk (or it has none); false when writing it failed. */
  private async reconcileNow(pageId: string): Promise<boolean> {
    const state = this.options.source.recoverableState(pageId);

    try {
      if (state === null) {
        // The note is clean, but its last save is not yet confirmed durable: the record stays until it is.
        if (this.options.holdRecord?.(pageId)) {
          return true;
        }
        // Nothing unsaved right now. Only a record this session wrote is ours to remove.
        if (this.owned.has(pageId)) {
          await this.removeOwn(pageId);
        }
        await this.removeAdopted(pageId);
        this.retries.delete(pageId);
        return true;
      }

      await this.ensureFreshSession();
      const name = recordFileName(pageId, this.session);
      const sequence = (this.sequences.get(pageId) ?? 0) + 1;
      const record = this.buildRecord(state, sequence);
      const unchangedKey = serializeRecord({ ...record, capturedAt: '', sequence: 0 });

      if (this.lastWritten.get(pageId) === unchangedKey) {
        return true;
      }

      await this.storage.writeAtomic(this.options.vaultKey, name, serializeRecord(record));
      this.sequences.set(pageId, sequence);
      this.owned.add(pageId);
      this.lastWritten.set(pageId, unchangedKey);
      this.retries.delete(pageId);

      return true;
    } catch (error) {
      this.options.onWriteError?.(error, pageId);
      this.retryLater(pageId);

      return false;
    }
  }

  private retryLater(pageId: string): void {
    const attempts = this.retries.get(pageId) ?? 0;

    if (this.disposed || attempts >= this.maxRetries) {
      return;
    }

    this.retries.set(pageId, attempts + 1);
    const pending = this.retryTimers.get(pageId);
    if (pending !== undefined) clearTimeout(pending);
    this.retryTimers.set(
      pageId,
      setTimeout(() => {
        this.retryTimers.delete(pageId);
        void this.reconcile(pageId);
      }, this.retryMs)
    );
  }

  private buildRecord(state: RecoverableState, sequence: number): RecoveryRecord {
    return {
      format: RECOVERY_FORMAT,
      version: RECOVERY_VERSION,
      vaultKey: this.options.vaultKey,
      pageId: state.pageId,
      kind: state.kind,
      capturedAt: this.now().toISOString(),
      sequence,
      label: state.label,
      pagePath: state.pagePath,
      body: state.body,
      title: state.title,
      description: state.description,
      base: {
        body: state.vault ? fingerprint(state.vault.body) : null,
        title: state.vault ? state.vault.title : null,
        description: state.vault ? state.vault.description : null,
      },
      draft: state.draft,
    };
  }
}
