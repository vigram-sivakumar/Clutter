import { fingerprint } from './fingerprint';
import {
  RECOVERY_FORMAT,
  RECOVERY_VERSION,
  committedNameOf,
  compareFreshness,
  isTempRecordName,
  parseRecord,
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
  /** This session's tag (8 hex digits). Random by default; a test can fix it. */
  readonly session?: string;
  readonly onWriteError?: (error: unknown, pageId: string) => void;
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
  private readonly lastWritten = new Map<string, string>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxWaitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retries = new Map<string, number>();
  private readonly sequences = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();
  private unsubscribe: (() => void) | null = null;
  private disposed = false;
  public readonly session: string;

  constructor(private readonly options: RecoveryJournalOptions) {
    this.storage = options.storage;
    this.debounceMs = options.debounceMs ?? RECOVERY_DEBOUNCE_MS;
    this.maxWaitMs = options.maxWaitMs ?? RECOVERY_MAX_WAIT_MS;
    this.retryMs = options.retryMs ?? RECOVERY_RETRY_MS;
    this.maxRetries = options.maxRetries ?? RECOVERY_MAX_RETRIES;
    this.now = options.now ?? (() => new Date());
    this.session =
      options.session ?? Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /** Starts following the source. Anything already unsaved is scheduled. */
  public start(): void {
    this.unsubscribe = this.options.source.subscribeUnsaved((pageId, urgent) => this.schedule(pageId, urgent));
    this.schedule();
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
    const ids = new Set<string>([...this.options.source.unsavedPageIds(), ...this.owned]);

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
   * (the record's schema, that its note and session match the file name, and that it belongs to this vault directory):
   *
   * - the committed record and the `.tmp` record of one note and session are compared by the writer's own sequence
   *   (`compareFreshness`), never by file time, and the newer valid one is the candidate;
   * - a newer valid `.tmp` record is promoted: rewritten atomically as the committed record, and only then is the `.tmp`
   *   removed, so no step leaves the newest valid copy without a committed home;
   * - an older or equal `.tmp` record, or a malformed one beside a valid committed record, is removed (superseded or
   *   garbage); a malformed `.tmp` with no committed record, or one whose identity does not match, is left alone and
   *   never offered.
   */
  public async discover(): Promise<{ entries: RecoveryEntry[]; unreadable: number }> {
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

      const committedNames = new Set(names.filter((name) => !isTempRecordName(name)).map(committedNameOf));
      const groups = new Set([...names.map(committedNameOf)]);

      for (const committedName of groups) {
        if (sessionOfFileName(committedName) === this.session) continue;
        const tempName = `${committedName}.tmp`;
        const hasTemp = names.includes(tempName);

        const committed = committedNames.has(committedName) ? await this.readValid(dir, committedName, committedName) : 'missing';
        const temp = hasTemp ? await this.readValid(dir, tempName, committedName) : 'missing';

        if (committed === 'unreadable') unreadable += 1;
        if (temp === 'unreadable' || temp === 'foreign') unreadable += 1;

        const committedRecord = typeof committed === 'object' ? committed : null;
        const tempRecord = typeof temp === 'object' ? temp : null;

        if (tempRecord && (!committedRecord || compareFreshness(tempRecord, committedRecord) > 0)) {
          // The interrupted write is the newest valid copy: make it the committed record, then drop the temp file.
          try {
            await this.storage.writeAtomic(dir, committedName, serializeRecord(tempRecord));
            await this.storage.remove(dir, tempName).catch(() => undefined);
            entries.push({ dir, name: committedName, record: tempRecord });
          } catch {
            // Could not promote: still offer it, from where it is, and keep every file.
            entries.push({
              dir,
              name: tempName,
              record: tempRecord,
              ...(committedRecord || committed === 'unreadable' ? { siblings: [committedName] } : {}),
            });
          }
          continue;
        }

        if (committedRecord) {
          entries.push({ dir, name: committedName, record: committedRecord });
          // The temp file is superseded (older or equal) or garbage beside a valid committed record: safe to remove.
          if (hasTemp && temp !== 'foreign') await this.storage.remove(dir, tempName).catch(() => undefined);
        }
      }
    }

    return { entries, unreadable };
  }

  /** Reads one file and validates it as the record of the note and session `expectedName` names, in this vault. */
  private async readValid(dir: string, name: string, expectedName: string): Promise<RecoveryRecord | 'missing' | 'unreadable' | 'foreign'> {
    try {
      const text = await this.storage.read(dir, name);
      if (text === null) return 'missing';
      const record = parseRecord(text);
      if (!record) return 'unreadable';
      const session = sessionOfFileName(expectedName);
      if (record.vaultKey !== dir || session === null || recordFileName(record.pageId, session) !== expectedName) return 'foreign';
      return record;
    } catch {
      return 'unreadable';
    }
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
    await this.reconcile(pageId);
    const state = this.options.source.recoverableState(pageId);

    return state === null || this.lastWritten.has(pageId);
  }

  /** Removes this session's own record for a note. */
  private async removeOwn(pageId: string): Promise<void> {
    this.owned.delete(pageId);
    this.lastWritten.delete(pageId);
    await this.storage.remove(this.options.vaultKey, recordFileName(pageId, this.session));
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
  private reconcile(pageId: string): Promise<void> {
    const previous = this.queues.get(pageId) ?? Promise.resolve();
    const next = previous.then(() => this.reconcileNow(pageId));
    const tail = next.catch(() => undefined);
    this.queues.set(pageId, tail);
    void tail.then(() => {
      if (this.queues.get(pageId) === tail) this.queues.delete(pageId);
    });
    return next;
  }

  private async reconcileNow(pageId: string): Promise<void> {
    const state = this.options.source.recoverableState(pageId);
    const name = recordFileName(pageId, this.session);

    try {
      if (state === null) {
        // Nothing unsaved right now. Only a record this session wrote is ours to remove.
        if (this.owned.has(pageId)) {
          await this.removeOwn(pageId);
        }
        this.retries.delete(pageId);
        return;
      }

      const sequence = (this.sequences.get(pageId) ?? 0) + 1;
      const record = this.buildRecord(state, sequence);
      const unchangedKey = serializeRecord({ ...record, capturedAt: '', sequence: 0 });

      if (this.lastWritten.get(pageId) === unchangedKey) {
        return;
      }

      await this.storage.writeAtomic(this.options.vaultKey, name, serializeRecord(record));
      this.sequences.set(pageId, sequence);
      this.owned.add(pageId);
      this.lastWritten.set(pageId, unchangedKey);
      this.retries.delete(pageId);
    } catch (error) {
      this.options.onWriteError?.(error, pageId);
      this.retryLater(pageId);
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
