import type { ParseMemo, ParsedNoteParts } from '../../ingest/ParseMemo';
import { encodeParts, restoreUndefined } from './parseResultCodec';
import { PARSER_FINGERPRINT } from './parserFingerprint';
import {
  MAX_PARSED_NOTE_CACHE_BYTES,
  type ParsedNoteCacheBackend,
} from './ParsedNoteCacheBackend';

/**
 * The persistent parsed-note cache (ADR-053): a content-addressed memo of
 * `FrontmatterParser.parse`, kept in the application cache directory.
 *
 * - Markdown files stay authoritative. An entry is keyed by the SHA-256 of the
 *   exact text that was parsed, so a hit can only ever return the result of
 *   parsing identical text; the cache never supplies content.
 * - It is derived data and disposable. Every failure (missing, corrupt,
 *   oversized, incompatible, unavailable) means "no cache" and ordinary
 *   parsing; nothing here throws into bootstrap or editing.
 * - Entries are encoded and verified when recorded, so an entry that would not
 *   round-trip identically is not cached.
 * - It is read once at startup and written at most once, after the workspace
 *   is up, only when something changed.
 */
const FORMAT = 1;
const KEY_PATTERN = /^[0-9a-f]{64}$/;

export type ParsedNoteCacheLoadStatus =
  'disabled' | 'unavailable' | 'empty' | 'loaded' | 'discarded';
export type ParsedNoteCacheWriteOutcome =
  | 'not-attempted'
  | 'written'
  | 'unchanged'
  | 'skipped-oversize'
  | 'failed'
  | 'cancelled'
  | 'disabled';

/** What happened, for diagnostics and tests. */
export interface ParsedNoteCacheReport {
  loadStatus: ParsedNoteCacheLoadStatus;
  loadReason?: string;
  entriesLoaded: number;
  hits: number;
  misses: number;
  /** Misses whose result could not be reproduced exactly and so were not cached. */
  rejected: number;
  hashMs: number;
  decodeMs: number;
  loadMs: number;
  writeStatus: ParsedNoteCacheWriteOutcome;
  writeReason?: string;
  bytes?: number;
  entriesWritten?: number;
}

export function digestAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ANALYSIS_LISTS = [
  'tasks',
  'tags',
  'links',
  'embeds',
  'headings',
  'blockReferences',
] as const;

/** Minimal shape check of one encoded entry (a checksum already guards integrity). */
function isEntryShape(entry: unknown): boolean {
  if (!isPlainObject(entry)) return false;
  const { frontmatter, frontmatterAnalysis, analysis } = entry;
  if (
    !isPlainObject(frontmatter) ||
    !isPlainObject(frontmatterAnalysis) ||
    !isPlainObject(analysis)
  ) {
    return false;
  }
  return ANALYSIS_LISTS.every((name) => Array.isArray(analysis[name]));
}

const now = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

const FOLDER_ID_PREFIX = 'folder\u0000';

/** The id under which a folder's `.folder.md` entry is indexed (internal; never persisted). */
export function folderCacheId(folderId: string): string {
  return `${FOLDER_ID_PREFIX}${folderId}`;
}

/** The folder id behind a namespaced cache id, or undefined for a note id. */
export function folderIdOfCacheId(cacheId: string): string | undefined {
  return cacheId.startsWith(FOLDER_ID_PREFIX) ? cacheId.slice(FOLDER_ID_PREFIX.length) : undefined;
}

export class ParsedNoteCache implements ParseMemo {
  private readonly entries: Map<string, unknown>;
  private readonly loadedKeys: Set<string>;
  private readonly seen = new Set<string>();
  private readonly fresh = new Set<string>();
  private cancelled = false;
  private persisted = false;
  private readonly info: ParsedNoteCacheReport;
  /** Persist and forget run one at a time, in the order they were asked for. */
  private queue: Promise<unknown> = Promise.resolve();
  /** While the scan runs: the key each scanned file was parsed under, by path. Emptied by `bindNotes`. */
  private readonly keyByPath = new Map<string, string>();
  /** The note identity the file does not store: which note each startup entry belongs to, and the other way round. */
  private readonly keyByNoteId = new Map<string, { readonly key: string; readonly fingerprint: string | undefined }>();
  private readonly noteIdsByKey = new Map<string, Set<string>>();
  /** Keys that must leave the file but whose rewrite did not succeed yet; retried by the next forget. */
  private readonly pendingRemoval = new Set<string>();

  private constructor(
    private readonly backend: ParsedNoteCacheBackend | null,
    private readonly rootPath: string,
    private readonly spaceId: string | null,
    private readonly fingerprint: string,
    entries: Map<string, unknown>,
    /** No usable file on disk: write one even if nothing was missed. */
    private readonly needsReplacement: boolean,
    info: ParsedNoteCacheReport
  ) {
    this.entries = entries;
    this.loadedKeys = new Set(entries.keys());
    this.info = info;
  }

  /** A cache that does nothing: every file is parsed as before. */
  static disabled(reason = 'disabled'): ParsedNoteCache {
    return new ParsedNoteCache(
      null,
      '',
      null,
      PARSER_FINGERPRINT,
      new Map(),
      false,
      blankReport('disabled', reason, 'disabled')
    );
  }

  /** Loads the cache for a space. Never throws. */
  static async load(
    backend: ParsedNoteCacheBackend | null,
    rootPath: string,
    fingerprint: string = PARSER_FINGERPRINT
  ): Promise<ParsedNoteCache> {
    if (!backend) return ParsedNoteCache.disabled('no backend');
    if (!digestAvailable())
      return ParsedNoteCache.disabled('no digest available');

    const started = now();
    const finish = (report: ParsedNoteCacheReport) => {
      report.loadMs = Math.round((now() - started) * 10) / 10;
      return report;
    };

    let read;
    try {
      read = await backend.read(rootPath);
    } catch (error) {
      return new ParsedNoteCache(
        null,
        rootPath,
        null,
        fingerprint,
        new Map(),
        false,
        finish(blankReport('unavailable', String(error), 'disabled'))
      );
    }

    const discarded = (reason: string) =>
      new ParsedNoteCache(
        backend,
        rootPath,
        read.spaceId,
        fingerprint,
        new Map(),
        true,
        finish(blankReport('discarded', reason))
      );

    if (read.contents === null) {
      if (read.problem) return discarded(read.problem);
      return new ParsedNoteCache(
        backend,
        rootPath,
        read.spaceId,
        fingerprint,
        new Map(),
        true,
        finish(blankReport('empty'))
      );
    }
    if (read.contents.length > MAX_PARSED_NOTE_CACHE_BYTES)
      return discarded('oversize');

    const parsed = await parseEnvelope(
      read.contents,
      read.spaceId,
      fingerprint
    );
    if ('reason' in parsed) return discarded(parsed.reason);

    const report = finish(blankReport('loaded'));
    report.entriesLoaded = parsed.entries.size;
    return new ParsedNoteCache(
      backend,
      rootPath,
      read.spaceId,
      fingerprint,
      parsed.entries,
      false,
      report
    );
  }

  // ---- ParseMemo -----------------------------------------------------------

  async keyOf(text: string): Promise<string | null> {
    if (!this.backend || this.spaceId === null) return null;
    const started = now();
    try {
      return await sha256Hex(text);
    } catch {
      return null;
    } finally {
      this.info.hashMs += now() - started;
    }
  }

  recall(key: string): ParsedNoteParts | undefined {
    const raw = this.entries.get(key);
    if (raw === undefined) {
      this.info.misses += 1;
      return undefined;
    }
    this.info.hits += 1;
    this.seen.add(key);
    const started = now();
    const parts = restoreUndefined(raw) as ParsedNoteParts;
    this.info.decodeMs += now() - started;
    return parts;
  }

  remember(key: string, parts: ParsedNoteParts): void {
    if (!this.backend) return;
    const encoded = encodeParts(parts);
    if (!encoded) {
      this.info.rejected += 1;
      return;
    }
    this.entries.set(key, encoded.raw);
    this.seen.add(key);
    this.fresh.add(key);
  }

  noteSource(path: string, key: string): void {
    if (!this.backend) return;
    this.keyByPath.set(path, key);
  }

  /**
   * Binds each note, by its stable id, to the entry its file was parsed under at startup (see `noteSource`). Called
   * once, right after the Vault is built from the scan and before anything rewrites a file. A note's id survives
   * archive, restore, move, rename and edits, so this stays the right way to find its entry for the whole session; a
   * note created or first parsed later was never in the cache and has no binding. `fingerprint` is the note's
   * `sourceFingerprint` at that moment: it lets `forget` tell whether another note that shared the entry still holds
   * that exact text.
   */
  bindNotes(
    notes: Iterable<{ readonly id: string; readonly path: string; readonly sourceFingerprint?: string }>,
    folders: Iterable<{ readonly id: string; readonly path: string }> = []
  ): void {
    if (this.backend) {
      for (const note of notes) {
        this.bindOne(note.id, note.path, note.sourceFingerprint);
      }
      // A folder's `.folder.md` goes through the same memo; `path` is that exact file. Its id is namespaced so it can
      // never collide with a note id, and it has no fingerprint.
      for (const folder of folders) {
        this.bindOne(folderCacheId(folder.id), folder.path, undefined);
      }
    }
    this.keyByPath.clear();
  }

  private bindOne(id: string, path: string, fingerprint: string | undefined): void {
    const key = this.keyByPath.get(path);
    if (key === undefined) return;

    this.keyByNoteId.set(id, { key, fingerprint });
    let ids = this.noteIdsByKey.get(key);
    if (!ids) {
      ids = new Set();
      this.noteIdsByKey.set(key, ids);
    }
    ids.add(id);
  }

  /**
   * Same as `forget`, for permanently deleted folders: drops the entry of each folder's `.folder.md`, under the same
   * shared-key rule. `isUnchanged` is asked about every other holder of an entry, folder holders by their namespaced
   * id (see `folderIdOfCacheId`).
   */
  forgetFolders(
    folderIds: readonly string[],
    isUnchanged: (noteId: string, fingerprint: string | undefined) => boolean
  ): Promise<void> {
    return this.forget(folderIds.map(folderCacheId), isUnchanged);
  }

  /**
   * Removes what the cache holds for notes that were permanently deleted, so their parsed text does not outlive them.
   * An entry goes only when no remaining note still holds the text it was parsed from: a note that shared the entry
   * and has not changed since the scan (`isUnchanged`) keeps it, one that has changed or is gone does not. Entries
   * of every other note are left alone, and so are the format and the keys.
   *
   * The index is updated at once; the file is rewritten on the same queue as `persist`, so the two never interleave.
   * A failed rewrite never removes the whole cache: the keys stay pending and the next call retries them. Never
   * throws.
   */
  forget(noteIds: readonly string[], isUnchanged: (noteId: string, fingerprint: string | undefined) => boolean): Promise<void> {
    if (!this.backend) return Promise.resolve();

    for (const noteId of noteIds) {
      const bound = this.keyByNoteId.get(noteId);
      if (!bound) continue;

      this.keyByNoteId.delete(noteId);
      const sharers = this.noteIdsByKey.get(bound.key);
      sharers?.delete(noteId);

      for (const other of [...(sharers ?? [])]) {
        const otherBound = this.keyByNoteId.get(other);
        if (!otherBound || !isUnchanged(other, otherBound.fingerprint)) {
          this.keyByNoteId.delete(other);
          sharers?.delete(other);
        }
      }

      if (!sharers || sharers.size === 0) {
        this.noteIdsByKey.delete(bound.key);
        this.pendingRemoval.add(bound.key);
      }
    }

    if (this.pendingRemoval.size === 0) return Promise.resolve();

    return this.enqueue(() => this.removePending());
  }

  /** Resolves once every persist and forget asked for so far has finished (for shutdown checks and tests). */
  async idle(): Promise<void> {
    await this.queue;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation);
    // One failed step must not wedge the queue (each operation reports its own failure).
    this.queue = run.catch(() => {});
    return run;
  }

  /** Applies `pendingRemoval` to wherever the entries live now: memory before the one write, the file after it. */
  private async removePending(): Promise<void> {
    const backend = this.backend;
    if (!backend || this.spaceId === null || this.cancelled || this.pendingRemoval.size === 0) return;
    const keys = [...this.pendingRemoval];

    if (!this.persisted) {
      // The write has not happened yet and will only carry what was `seen`: dropping the keys here is enough. They stay
      // in `loadedKeys`, which is what makes that write happen even when nothing else changed.
      for (const key of keys) {
        this.entries.delete(key);
        this.seen.delete(key);
        this.fresh.delete(key);
        this.pendingRemoval.delete(key);
      }
      return;
    }

    try {
      const read = await backend.read(this.rootPath);
      if (read.contents === null && read.problem) {
        // The file exists but could not be read (unreadable, oversize): the entries may still be in it. Keep the keys
        // pending so a later forget retries; never remove the file.
        console.warn(`[parsed-note-cache] cache file not readable (${read.problem}); cleanup kept for retry`);
        return;
      }
      if (read.contents === null) {
        // No file: nothing holds these entries any more.
        for (const key of keys) this.pendingRemoval.delete(key);
        return;
      }
      if (read.spaceId !== this.spaceId) return;

      const parsed = await parseEnvelope(read.contents, this.spaceId, this.fingerprint);
      if ('reason' in parsed) {
        // A file this build cannot read is replaced or discarded at the next launch; there is nothing to rewrite.
        return;
      }

      const present = keys.filter((key) => parsed.entries.has(key));
      if (present.length === 0) {
        for (const key of keys) this.pendingRemoval.delete(key);
        return;
      }
      for (const key of present) parsed.entries.delete(key);

      if (parsed.entries.size === 0) {
        await backend.remove(this.rootPath);
      } else {
        const text = await this.serialize(parsed.entries);
        if (this.cancelled) return;
        if ((await backend.write(this.rootPath, text)) !== 'written') return;
      }
      for (const key of keys) this.pendingRemoval.delete(key);
    } catch (error) {
      // Deliberately not a reason to delete the whole cache: another operation may be relying on the other entries.
      // The keys stay pending and the next forget retries; the worst case is stale derived data until then.
      console.warn('[parsed-note-cache] could not remove deleted notes from the cache:', String(error));
    }
  }

  private async serialize(entries: ReadonlyMap<string, unknown>): Promise<string> {
    const record: Record<string, unknown> = {};
    for (const key of [...entries.keys()].sort()) record[key] = entries.get(key);
    const entriesText = JSON.stringify(record);
    const checksum = await sha256Hex(entriesText);
    return (
      `{"format":${FORMAT},"parserFingerprint":${JSON.stringify(this.fingerprint)},` +
      `"spaceId":${JSON.stringify(this.spaceId)},"checksum":"${checksum}","entries":${entriesText}}`
    );
  }

  /** One diagnostic line after the scan; silent when the cache is off. */
  logScanSummary(): void {
    if (!this.backend) return;
    const { loadStatus, loadReason, entriesLoaded, hits, misses, rejected } =
      this.info;
    console.info(
      `[parsed-note-cache] ${loadStatus}${loadReason ? ` (${loadReason})` : ''}: ` +
        `${entriesLoaded} entries loaded, ${hits} hits, ${misses} misses, ${rejected} not cacheable`
    );
  }

  // ---- persistence ---------------------------------------------------------

  /** Stops any write that has not started. Does not wait for one in flight. */
  cancel(): void {
    this.cancelled = true;
    this.release();
  }

  /** The entries are only needed until the one write; don't hold them for the whole session. */
  private release(): void {
    this.entries.clear();
    this.loadedKeys.clear();
    this.seen.clear();
    this.fresh.clear();
  }

  report(): ParsedNoteCacheReport {
    return { ...this.info };
  }

  /**
   * Writes the cache if it changed. Best effort: never throws, never touches
   * the Vault, and a failure only means the next launch parses again.
   */
  async persist(): Promise<ParsedNoteCacheReport> {
    return this.enqueue(async () => {
      try {
        return await this.persistOnce();
      } finally {
        this.release();
      }
    });
  }

  private async persistOnce(): Promise<ParsedNoteCacheReport> {
    if (!this.backend || this.spaceId === null) {
      this.info.writeStatus = 'disabled';
      return this.report();
    }
    if (this.persisted) return this.report();
    this.persisted = true;
    if (this.cancelled) {
      this.info.writeStatus = 'cancelled';
      return this.report();
    }

    try {
      const unseenLoaded = [...this.loadedKeys].some(
        (key) => !this.seen.has(key)
      );
      const keys = [...this.seen].sort();
      if (keys.length === 0 && this.loadedKeys.size > 0) {
        // Every entry that was in the file is gone (its notes were deleted, or changed on disk) and nothing new is
        // worth keeping: an empty cache is no file, never a stale one that still holds the old entries.
        await this.backend.remove(this.rootPath);
        this.info.writeStatus = 'written';
        this.info.entriesWritten = 0;
        return this.report();
      }
      if (
        keys.length === 0 ||
        !(this.needsReplacement || this.fresh.size > 0 || unseenLoaded)
      ) {
        this.info.writeStatus = 'unchanged';
        return this.report();
      }

      const entries: Record<string, unknown> = {};
      for (const key of keys) entries[key] = this.entries.get(key);
      const entriesText = JSON.stringify(entries);
      const checksum = await sha256Hex(entriesText);
      if (this.cancelled) {
        this.info.writeStatus = 'cancelled';
        return this.report();
      }
      const text =
        `{"format":${FORMAT},"parserFingerprint":${JSON.stringify(this.fingerprint)},` +
        `"spaceId":${JSON.stringify(this.spaceId)},"checksum":"${checksum}","entries":${entriesText}}`;
      this.info.entriesWritten = keys.length;
      this.info.bytes = text.length;

      if (text.length > MAX_PARSED_NOTE_CACHE_BYTES) {
        // Not cached; also remove a now-stale file so it doesn't linger.
        await this.backend.remove(this.rootPath).catch(() => {});
        this.info.writeStatus = 'skipped-oversize';
        this.info.writeReason = `serialized cache ${text.length} bytes exceeds ${MAX_PARSED_NOTE_CACHE_BYTES}`;
        return this.report();
      }
      const status = await this.backend.write(this.rootPath, text);
      this.info.writeStatus = status;
      if (status === 'skipped-oversize')
        this.info.writeReason = 'rejected by the native store (size limit)';
    } catch (error) {
      this.info.writeStatus = 'failed';
      this.info.writeReason = String(error);
    }
    return this.report();
  }
}

function blankReport(
  loadStatus: ParsedNoteCacheLoadStatus,
  loadReason?: string,
  writeStatus: ParsedNoteCacheWriteOutcome = 'not-attempted'
): ParsedNoteCacheReport {
  return {
    loadStatus,
    ...(loadReason !== undefined && { loadReason }),
    entriesLoaded: 0,
    hits: 0,
    misses: 0,
    rejected: 0,
    hashMs: 0,
    decodeMs: 0,
    loadMs: 0,
    writeStatus,
  };
}

/** Validates the envelope; returns the raw entries or why the cache is unusable. */
async function parseEnvelope(
  text: string,
  expectedSpaceId: string,
  fingerprint: string
): Promise<{ entries: Map<string, unknown> } | { reason: string }> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return { reason: 'not valid JSON' };
  }
  if (!isPlainObject(envelope)) return { reason: 'malformed envelope' };
  if (envelope.format !== FORMAT)
    return { reason: `format ${String(envelope.format)} is not ${FORMAT}` };
  if (envelope.parserFingerprint !== fingerprint)
    return { reason: 'parser fingerprint changed' };
  if (envelope.spaceId !== expectedSpaceId)
    return { reason: 'space id mismatch' };
  if (
    typeof envelope.checksum !== 'string' ||
    !isPlainObject(envelope.entries)
  ) {
    return { reason: 'malformed envelope' };
  }
  let checksum: string;
  try {
    checksum = await sha256Hex(JSON.stringify(envelope.entries));
  } catch {
    return { reason: 'checksum could not be computed' };
  }
  if (checksum !== envelope.checksum) return { reason: 'checksum mismatch' };

  const entries = new Map<string, unknown>();
  for (const key of Object.keys(envelope.entries)) {
    const entry = envelope.entries[key];
    if (!KEY_PATTERN.test(key) || !isEntryShape(entry))
      return { reason: 'malformed entry' };
    entries.set(key, entry);
  }
  return { entries };
}
