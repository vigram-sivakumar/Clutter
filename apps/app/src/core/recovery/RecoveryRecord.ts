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

/** The session tag a record file name carries, or null for a name this module did not write. */
export function sessionOfFileName(name: string): string | null {
  return /\.([0-9a-f]{8})\.json$/.exec(name)?.[1] ?? null;
}

function hashName(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
