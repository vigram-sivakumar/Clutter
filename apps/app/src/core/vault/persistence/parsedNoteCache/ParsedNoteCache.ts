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

export class ParsedNoteCache implements ParseMemo {
  private readonly entries: Map<string, unknown>;
  private readonly loadedKeys: Set<string>;
  private readonly seen = new Set<string>();
  private readonly fresh = new Set<string>();
  private cancelled = false;
  private persisted = false;
  private readonly info: ParsedNoteCacheReport;

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
    try {
      return await this.persistOnce();
    } finally {
      this.release();
    }
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
