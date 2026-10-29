/**
 * One recovery record: the unsaved work of one note (or draft) as it was at the last snapshot, plus enough about
 * the vault's copy at that moment to tell, after a crash, whether the vault has changed since.
 *
 * Recovery records are a safety net beside the vault, never a replacement for it: the Markdown file stays the
 * source of truth, and a record only ever re-enters the editor as an unsaved edit (see RecoveryOperations).
 */
export const RECOVERY_FORMAT = 'clutter-recovery';
export const RECOVERY_VERSION = 1;

export type RecoveryKind = 'page' | 'draft';

/** What a draft needs in order to become a note again. */
export interface RecoveryDraftInfo {
  readonly folderId: string | null;
  readonly type: string;
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly deterministicPath?: string;
}

export interface RecoveryRecord {
  readonly format: typeof RECOVERY_FORMAT;
  readonly version: typeof RECOVERY_VERSION;
  /** Which vault the note belongs to (see RecoveryJournal's vault keys). */
  readonly vaultKey: string;
  /** The note's id, or the id a draft will keep once it is saved (a draft is told apart by `kind`, never by id). */
  readonly pageId: string;
  readonly kind: RecoveryKind;
  readonly capturedAt: string;
  /**
   * Counts the snapshots one session wrote for this note: 1, 2, 3... It is the ordering of two records of the same note
   * and session (a committed file and an interrupted `.tmp` one), which clocks and file times cannot give reliably. Absent
   * only in a record written before this field existed.
   */
  readonly sequence?: number;
  /** A name to show the user: the note's title, or what a draft starts with. */
  readonly label: string;
  /** The note's path when it was captured, for display only (the id is what identifies it). */
  readonly pagePath: string | null;
  /** The unsaved body, or null when the body had no unsaved change. `revision` is the editor's revision number. */
  readonly body: { readonly markdown: string; readonly revision: number } | null;
  /** The unsaved title / description, or null when that field had no unsaved change. */
  readonly title: string | null;
  readonly description: string | null;
  /** The vault's own values at capture time: the body's fingerprint, the saved title and description. */
  readonly base: {
    readonly body: string | null;
    readonly title: string | null;
    readonly description: string | null;
  };
  readonly draft: RecoveryDraftInfo | null;
}

export function serializeRecord(record: RecoveryRecord): string {
  return JSON.stringify(record);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);

/** Parses a record, or returns null for anything that is not exactly a version-1 record. Never throws. */
export function parseRecord(text: string): RecoveryRecord | null {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const base = record.base as Record<string, unknown> | null | undefined;
  const body = record.body as Record<string, unknown> | null | undefined;
  const draft = record.draft as Record<string, unknown> | null | undefined;

  const valid =
    record.format === RECOVERY_FORMAT &&
    record.version === RECOVERY_VERSION &&
    isString(record.vaultKey) &&
    isString(record.pageId) &&
    record.pageId.length > 0 &&
    (record.kind === 'page' || record.kind === 'draft') &&
    isString(record.capturedAt) &&
    (record.sequence === undefined || (typeof record.sequence === 'number' && Number.isInteger(record.sequence) && record.sequence >= 1)) &&
    isString(record.label) &&
    isNullableString(record.pagePath) &&
    isNullableString(record.title) &&
    isNullableString(record.description) &&
    typeof base === 'object' &&
    base !== null &&
    isNullableString(base.body) &&
    isNullableString(base.title) &&
    isNullableString(base.description) &&
    (body === null || (typeof body === 'object' && body !== undefined && isString(body.markdown) && typeof body.revision === 'number')) &&
    (draft === null ||
      (typeof draft === 'object' &&
        draft !== undefined &&
        (draft.folderId === null || isString(draft.folderId)) &&
        isString(draft.type)));

  // A record that holds nothing recoverable is not a record.
  if (!valid || (record.body === null && record.title === null && record.description === null)) {
    return null;
  }

  return record as unknown as RecoveryRecord;
}

/**
 * The file a session keeps one note's record in: `<safe id>.<session>.json`. Every Clutter session writes under its own
 * session tag, so a record left behind by a crashed session is never overwritten by the next one (a new session
 * editing the same note cannot destroy what the crashed one had), and cleanup only ever touches a session's own files.
 */
export function recordFileName(pageId: string, session: string): string {
  const safe = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(pageId) ? pageId : `h-${pageId.length}-${hashName(pageId)}`;

  return `${safe}.${session}.json`;
}

/**
 * A session tag for a new session: a random UUID (122 random bits), so two sessions cannot realistically collide. Tags
 * from before this (8 hex digits) are still read everywhere; nothing is renamed or migrated.
 */
export function newSessionId(): string {
  const crypto = globalThis.crypto;

  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto?.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const SESSION_TAG = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{8}';
const SESSION_IN_NAME = new RegExp(`\\.(${SESSION_TAG})\\.json(?:\\.tmp)?$`);

/**
 * The session tag a record file name carries (committed `.json` or interrupted `.json.tmp`), or null for another name.
 * Both formats: a UUID (current) and 8 hex digits (records written before UUID tags). The tag is the last dotted part
 * before `.json`, so a note id containing dots or dashes cannot be mistaken for one.
 */
export function sessionOfFileName(name: string): string | null {
  return SESSION_IN_NAME.exec(name)?.[1] ?? null;
}

/** Whether a file name is an interrupted write of a record (never the committed record itself). */
export function isTempRecordName(name: string): boolean {
  return name.endsWith('.json.tmp');
}

/** The committed record's name for a file name that may be its temporary one. */
export function committedNameOf(name: string): string {
  return isTempRecordName(name) ? name.slice(0, -'.tmp'.length) : name;
}

/**
 * Which of two records of the same note and session is newer, by the writer's own counter and never by file time:
 * positive when `a` is newer, negative when `b` is, 0 when they are the same snapshot. Without a counter on both (an
 * older record) it falls back to the editor revision, then the capture time.
 */
export function compareFreshness(a: RecoveryRecord, b: RecoveryRecord): number {
  if (a.sequence !== undefined && b.sequence !== undefined) return a.sequence - b.sequence;
  const revision = (a.body?.revision ?? -1) - (b.body?.revision ?? -1);
  if (revision !== 0) return revision;
  return a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0;
}

function hashName(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
