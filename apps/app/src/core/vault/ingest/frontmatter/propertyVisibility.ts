import { splitKeyBlocks, type KeyBlock } from './customFrontmatter';
import { PAGE_SYSTEM_PROPERTY_KEYS, type PageSystemPropertyKey } from '../../../properties/systemProperties';
import { unquoteFrontmatterString } from './frontmatterStringValue';

/**
 * Which properties a note lists, and whether the section is shown (ADR-058).
 *
 * - **A property is declared by its frontmatter key.** A system property
 *   (`tags`, `aliases`, `created`, `modified`) is listed when its key is one
 *   of the file's top-level entries (the recorded entry order,
 *   PageMetadata.frontmatterEntryOrder) — `created: true` and `modified: true`
 *   declare Created and Last edited, whose values come only from the file's own
 *   times (ADR-057); `tags: []` still declares Tags. A custom property is
 *   listed because its key exists. There is no per-property hidden state.
 * - **`showProperties: false`** hides the whole section and nothing else —
 *   every key and value stays. Absent (or any other value) means shown. It is a
 *   presentation setting, kept as a preserved raw line like any key Clutter does
 *   not parse, and it is never a row.
 */
export const SHOW_PROPERTIES_KEY = 'showProperties';

/** The system properties whose keys are entries of the file (`order`), in the canonical system order. */
export function readListedSystemProperties(order: readonly string[] | undefined): PageSystemPropertyKey[] {
  const declared = new Set(order ?? []);

  return PAGE_SYSTEM_PROPERTY_KEYS.filter((key) => declared.has(key));
}

/** The preserved `showProperties` entry, or undefined. */
function findShowProperties(lines: readonly string[]): KeyBlock | undefined {
  return splitKeyBlocks(lines).find((block) => block.key.trim().toLowerCase() === SHOW_PROPERTIES_KEY.toLowerCase());
}

/**
 * Whether the note's Properties section is hidden: only `showProperties: false` (any letter case of the key,
 * `False` / `FALSE`, quoted, a trailing comment ignored). Absent, `true` or anything else is the shown state.
 */
export function isPropertiesSectionHidden(lines: readonly string[]): boolean {
  const block = findShowProperties(lines);

  return Boolean(block && /^(?:false|False|FALSE)$/.test(unquoteFrontmatterString(block.inlineValue.split(/\s#/)[0]!.trim())));
}

/**
 * The raw lines with the section hidden or shown.
 *
 * - **Hidden:** `showProperties: false` — an existing entry is rewritten in place (key spelling and a trailing
 *   comment kept), otherwise it is appended after every existing line. Nothing else changes.
 * - **Shown:** the entry is removed (absent means shown; `true` is never written).
 */
export function setPropertiesSectionHidden(lines: readonly string[], hidden: boolean): string[] {
  const block = findShowProperties(lines);

  if (!hidden) {
    return block
      ? lines.filter((_, index) => index < block.start || index > block.start + block.continuation.length)
      : [...lines];
  }

  if (!block) {
    return [...lines, `${SHOW_PROPERTIES_KEY}: false`];
  }

  const result = [...lines];
  result[block.start] = lines[block.start]!.replace(/^(\s*[^:]+:)\s*[^\s#]*(.*)$/, '$1 false$2');
  return result;
}
