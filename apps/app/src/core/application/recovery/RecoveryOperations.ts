import type { Vault } from '../../vault/models/Vault';
import type { Page } from '../../vault/models/Page';
import { fingerprint } from '../../recovery/fingerprint';
import type { RecoveryEntry, RecoveryJournal } from '../../recovery/RecoveryJournal';
import type { RecoveryRecord } from '../../recovery/RecoveryRecord';
import type { PageOperations } from '../page/PageOperations';

/**
 * - `recoverable`: the note in the vault is unchanged since the snapshot; the edits can be put back into the editor.
 * - `conflict`: the note in the vault changed (or is archived) since the snapshot. The edits are never applied over it;
 *   they can only be saved as a new note.
 * - `missing-note`: the note is no longer in the vault. Same: only as a new note.
 * - `draft`: a new note that was never saved. It can be saved as a note.
 */
export type RecoveryOutcome = 'recoverable' | 'conflict' | 'missing-note' | 'draft';

export type RecoveryChange = 'body' | 'title' | 'description';

export interface RecoveryCandidate {
  /** Identifies this record file (a note can have more than one, from different sessions). */
  readonly key: string;
  readonly entry: RecoveryEntry;
  /**
   * Other records of the same note holding exactly the same recovered content (and classified the same way), for
   * instance the original and the protecting copy a crash during a Restore leaves behind. Offered once; resolved
   * together. Records whose content differs are never here: they are separate candidates.
   */
  readonly duplicates: readonly RecoveryEntry[];
  readonly record: RecoveryRecord;
  readonly outcome: RecoveryOutcome;
  /** What the record holds. */
  readonly changes: readonly RecoveryChange[];
  /** Plain-language reasons, for the review dialog. */
  readonly reasons: readonly string[];
}

type ChannelStatus = 'saved' | 'unchanged' | 'changed';

export interface RecoveryClassification {
  readonly outcome: RecoveryOutcome | 'already-saved';
  readonly changes: readonly RecoveryChange[];
  readonly reasons: readonly string[];
}

/**
 * Decides what a record means against the vault as it is now. Pure. The page id alone proves nothing: each recovered
 * field is compared with the vault's current value and with the value the snapshot started from.
 */
export function classifyRecord(record: RecoveryRecord, page: Page | null, archived: boolean): RecoveryClassification {
  const changes: RecoveryChange[] = [];
  if (record.body) changes.push('body');
  if (record.title !== null) changes.push('title');
  if (record.description !== null) changes.push('description');

  if (page === null) {
    return record.kind === 'draft'
      ? { outcome: 'draft', changes, reasons: ['This note was never saved to your vault'] }
      : { outcome: 'missing-note', changes, reasons: ['This note is no longer in your vault'] };
  }

  const current = { body: page.source.markdown, title: page.name, description: page.metadata.description ?? '' };
  const status = (recovered: string, now: string, base: string | null, compareFingerprint = false): ChannelStatus => {
    if (now === recovered) return 'saved';
    if (base === null) return 'changed';
    return (compareFingerprint ? fingerprint(now) : now) === base ? 'unchanged' : 'changed';
  };

  const statuses: [RecoveryChange, ChannelStatus][] = [];
  if (record.body) statuses.push(['body', status(record.body.markdown, current.body, record.base.body, true)]);
  if (record.title !== null) statuses.push(['title', status(record.title, current.title, record.base.title)]);
  if (record.description !== null) {
    statuses.push(['description', status(record.description, current.description, record.base.description)]);
  }

  if (statuses.every(([, channel]) => channel === 'saved')) {
    return { outcome: 'already-saved', changes, reasons: [] };
  }

  const changed = statuses.filter(([, channel]) => channel === 'changed').map(([name]) => name);

  if (changed.length > 0) {
    return {
      outcome: 'conflict',
      changes,
      reasons: [
        `The ${changed.map((name) => (name === 'body' ? 'text' : name)).join(' and ')} of this note changed in your vault after these edits were captured`,
      ],
    };
  }

  if (archived) {
    return { outcome: 'conflict', changes, reasons: ['This note is archived, so it can’t be edited'] };
  }

  return { outcome: 'recoverable', changes, reasons: [] };
}

/** What a record would put back: the same note, kind and recovered text, title and description. */
function contentKey(record: RecoveryRecord): string {
  return JSON.stringify([record.pageId, record.kind, record.body?.markdown ?? null, record.title, record.description]);
}

/**
 * Offers records with identical recovered content once. Only records of the same note, with the same recovered text,
 * title and description AND the same classification are merged, and the newest is kept as the candidate with the rest
 * attached to it, so nothing is deleted at discovery: the others go when the kept one is resolved. A record whose content
 * differs in any way (a different revision) stays its own candidate.
 */
function mergeIdentical(candidates: readonly RecoveryCandidate[]): RecoveryCandidate[] {
  const groups = new Map<string, RecoveryCandidate[]>();

  for (const candidate of candidates) {
    const key = `${contentKey(candidate.record)}|${candidate.outcome}|${candidate.changes.join(',')}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  const merged: RecoveryCandidate[] = [];
  for (const group of groups.values()) {
    const newest = group.reduce((best, next) => (next.record.capturedAt > best.record.capturedAt ? next : best));
    merged.push({ ...newest, duplicates: [...newest.duplicates, ...group.filter((other) => other !== newest).map((other) => other.entry)] });
  }

  // A group appears where its first record was found, so the order records were found in is kept.
  return merged;
}

/**
 * Finds the unsaved work an earlier session left behind and lets the user put it back, save it as a new note, or
 * throw it away. Nothing here ever writes over a note in the vault: a recovered edit re-enters the editor as an
 * ordinary unsaved edit (autosave and the Persistence Gate then save it like any other), and anything that cannot be
 * applied safely becomes a new note.
 */
export class RecoveryOperations {
  private current: readonly RecoveryCandidate[] = [];
  private unreadable = 0;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly journal: RecoveryJournal,
    private readonly vault: Vault,
    private readonly pageOperations: PageOperations
  ) {}

  public get candidates(): readonly RecoveryCandidate[] {
    return this.current;
  }

  /** How many files in the recovery location could not be read as records (they are left untouched). */
  public get unreadableCount(): number {
    return this.unreadable;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A string that changes exactly when the candidate list does (for useSyncExternalStore). */
  public snapshot(): string {
    return String(this.version);
  }

  /**
   * Reads the records an earlier session left and classifies them. Never throws. A record whose content the vault
   * already holds is removed (it is redundant); every other record stays until the user decides.
   */
  public async discover(): Promise<void> {
    const candidates: RecoveryCandidate[] = [];

    try {
      const { entries, unreadable } = await this.journal.discover();
      this.unreadable = unreadable;

      for (const entry of entries) {
        const page = this.vault.getPage(entry.record.pageId) ?? null;
        const result = classifyRecord(entry.record, page, page !== null && this.vault.isPageEffectivelyArchived(page));

        if (result.outcome === 'already-saved') {
          await this.journal.removeEntry(entry).catch(() => undefined);
          continue;
        }

        candidates.push({
          key: `${entry.dir}/${entry.name}`,
          entry,
          duplicates: [],
          record: entry.record,
          outcome: result.outcome,
          changes: result.changes,
          reasons: result.reasons,
        });
      }
      candidates.splice(0, candidates.length, ...mergeIdentical(candidates));
    } catch (error) {
      console.error('Recovery: could not look for unsaved work from an earlier session.', error);
    }

    this.current = candidates;
    this.notify();
  }

  /**
   * Puts a recovered edit back. For a note unchanged in the vault, with no unsaved work of its own, it goes into the open
   * editor as an unsaved edit; for anything else it becomes a new note. The record is removed only once this session's own record protects the
   * restored content (or the new note is saved), so an interruption here loses nothing.
   */
  public async restore(key: string): Promise<void> {
    const candidate = this.find(key);

    if (!candidate) {
      return;
    }

    if (candidate.outcome !== 'recoverable') {
      return this.restoreAsNewNote(key);
    }

    const { record } = candidate;
    const pageId = record.pageId;

    // The record was classified when it was found, possibly long before the user pressed Restore. Decide again against
    // the note as it is now: putting the text into the editor replaces whatever the editor holds, so it is only safe
    // when the vault still has what the snapshot started from AND the note has no unsaved work of its own (typed since,
    // or just restored from another record of the same note). Otherwise the text is kept as a new note, never lost and
    // never written over anything.
    const page = this.vault.getPage(pageId) ?? null;
    const now = classifyRecord(record, page, page !== null && this.vault.isPageEffectivelyArchived(page));

    if (now.outcome === 'already-saved') {
      await this.removeAll(candidate);
      this.drop(key);
      return;
    }
    // The editor may already hold exactly this record's text: a Restore that failed to protect it (and was kept) leaves
    // it there, and pressing Retry must finish that restore, not turn it into a second, duplicate note.
    const unsaved = this.pageOperations.recoverableState(pageId);
    const alreadyHolds =
      unsaved !== null &&
      (record.body ? unsaved.body?.markdown === record.body.markdown : true) &&
      (record.title !== null ? unsaved.title === record.title : true) &&
      (record.description !== null ? unsaved.description === record.description : true);

    if (now.outcome !== 'recoverable' || (unsaved !== null && !alreadyHolds)) {
      return this.restoreAsNewNote(key);
    }

    if (!alreadyHolds) {
      await this.pageOperations.open(pageId);
      if (record.body) this.pageOperations.commitEdit(pageId, record.body.markdown);
      if (record.title !== null) this.pageOperations.commitTitle(pageId, record.title);
      if (record.description !== null) this.pageOperations.commitDescription(pageId, record.description);
    }
    if (!(await this.journal.snapshotNow(pageId))) {
      throw new Error('Couldn’t protect the restored changes, so the recovery copy was kept');
    }

    // The original is not removed here. It is handed to the journal, which keeps it until the note has nothing unsaved
    // (the vault save succeeded) and removes it together with this session's own record, retrying a failed removal.
    // Until then both exist; if the process ends first, discovery offers them once, not twice.
    await this.journal.adopt(pageId, [candidate.entry, ...candidate.duplicates]);
    this.drop(key);
  }

  /** Saves a record's content as a new note, never touching the existing one. */
  public async restoreAsNewNote(key: string): Promise<void> {
    const candidate = this.find(key);

    if (!candidate) {
      return;
    }

    const { record } = candidate;
    const existing = this.vault.getPage(record.pageId);
    const baseTitle = record.title ?? record.draft?.title ?? record.label;
    const options = {
      title: record.kind === 'draft' ? baseTitle : `${baseTitle} (recovered)`,
      body: record.body?.markdown ?? existing?.source.markdown ?? '',
      ...(record.description ? { description: record.description } : {}),
    };
    const folderId = existing?.parentId ?? record.draft?.folderId ?? null;

    try {
      await this.pageOperations.create({ ...options, folderId });
    } catch (error) {
      if (folderId === null) throw error;
      // The folder is gone or no longer accepts notes: the vault's top level always does.
      await this.pageOperations.create({ ...options, folderId: null });
    }

    await this.removeAll(candidate);
    this.drop(key);
  }

  /** Throws a record away on the user's explicit say-so. */
  public async discard(key: string): Promise<void> {
    const candidate = this.find(key);

    if (!candidate) {
      return;
    }

    await this.removeAll(candidate);
    this.drop(key);
  }

  /** The candidate's own record(s) and every identical duplicate, so none is offered again. */
  private async removeAll(candidate: RecoveryCandidate): Promise<void> {
    await this.journal.removeEntry(candidate.entry);
    for (const duplicate of candidate.duplicates) await this.journal.removeEntry(duplicate);
  }

  private find(key: string): RecoveryCandidate | undefined {
    return this.current.find((candidate) => candidate.key === key);
  }

  private drop(key: string): void {
    this.current = this.current.filter((candidate) => candidate.key !== key);
    this.notify();
  }

  private notify(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }
}
