import { normalizeTagName, type TagMetadataEntry } from '../models/Tag';

/**
 * The `.clutter/tags.json` format — one pure codec (parse + serialize), the
 * only place that knows the file's shape. Everything else (the store, boot,
 * external reload) goes through it.
 *
 * ```json
 * {
 *   "version": 2,
 *   "tags": {
 *     "design": { "name": "Design", "icon": "🎨", "favorite": true },
 *     "research": {}
 *   }
 * }
 * ```
 *
 * - Keys are normalized tag names (`normalizeTagName`); an entry's presence
 *   *is* the tag's declaration, so `{}` is a valid, meaningful entry.
 * - `version` 1 (the pre-v2 file, no `version` field) reads identically.
 * - Deterministic: keys sorted, fixed field order, 2-space indent, trailing
 *   newline — stable diffs, minimal Git conflicts.
 * - Forward compatible: fields this version doesn't know (e.g. a future
 *   `color`) are preserved on every read-modify-write, never dropped.
 */
export const TAG_METADATA_FILE_VERSION = 2;

export type TagMetadata = ReadonlyMap<string, TagMetadataEntry>;

export type ParsedTagMetadataFile =
  | { readonly ok: true; readonly entries: TagMetadata; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly reason: string };

export function parseTagMetadataFile(text: string): ParsedTagMetadataFile {
  if (text.trim() === '') {
    return { ok: true, entries: new Map(), warnings: [] };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `not valid JSON (${(error as Error).message})` };
  }

  if (!isRecord(raw)) {
    return { ok: false, reason: 'top level is not an object' };
  }

  const tags = raw.tags ?? {};

  if (!isRecord(tags)) {
    return { ok: false, reason: '"tags" is not an object' };
  }

  const entries = new Map<string, TagMetadataEntry>();
  const warnings: string[] = [];

  for (const [rawKey, rawEntry] of Object.entries(tags)) {
    const key = normalizeTagName(rawKey);

    if (!key) {
      warnings.push(`dropped entry with empty tag name ${JSON.stringify(rawKey)}`);
      continue;
    }

    if (!isRecord(rawEntry)) {
      warnings.push(`dropped entry "${rawKey}": not an object`);
      continue;
    }

    const entry = cleanEntry(rawEntry, rawKey, warnings);
    // Two spellings of one identity in a hand-edited file: later wins per field.
    entries.set(key, { ...entries.get(key), ...entry });
  }

  return { ok: true, entries, warnings };
}

/** The exact text written to disk for `entries` — deterministic. */
export function serializeTagMetadataFile(entries: TagMetadata): string {
  const tags: Record<string, Record<string, unknown>> = {};

  for (const key of [...entries.keys()].sort()) {
    tags[key] = orderedEntry(entries.get(key)!);
  }

  return `${JSON.stringify({ version: TAG_METADATA_FILE_VERSION, tags }, null, 2)}\n`;
}

/** Whether two metadata maps would serialize identically. */
export function tagMetadataEquals(a: TagMetadata, b: TagMetadata): boolean {
  return serializeTagMetadataFile(a) === serializeTagMetadataFile(b);
}

const KNOWN_FIELD_ORDER = ['name', 'icon', 'favorite'] as const;

function cleanEntry(
  rawEntry: Record<string, unknown>,
  rawKey: string,
  warnings: string[]
): TagMetadataEntry {
  const entry: Record<string, unknown> = { ...rawEntry };

  if ('name' in entry && (typeof entry.name !== 'string' || entry.name.trim() === '')) {
    warnings.push(`entry "${rawKey}": ignored invalid "name"`);
    delete entry.name;
  }

  if ('icon' in entry && (typeof entry.icon !== 'string' || entry.icon === '')) {
    warnings.push(`entry "${rawKey}": ignored invalid "icon"`);
    delete entry.icon;
  }

  if ('favorite' in entry && typeof entry.favorite !== 'boolean') {
    warnings.push(`entry "${rawKey}": ignored invalid "favorite"`);
    delete entry.favorite;
  }

  return entry as TagMetadataEntry;
}

function orderedEntry(entry: TagMetadataEntry): Record<string, unknown> {
  const source = entry as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const field of KNOWN_FIELD_ORDER) {
    const value = source[field];

    // `favorite: false` is the default — never written.
    if (value !== undefined && !(field === 'favorite' && value === false)) {
      out[field] = value;
    }
  }

  for (const field of Object.keys(source).sort()) {
    if (!(KNOWN_FIELD_ORDER as readonly string[]).includes(field) && source[field] !== undefined) {
      out[field] = source[field];
    }
  }

  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
