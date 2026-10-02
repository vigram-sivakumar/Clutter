import { splitFlowSequence, unquoteFrontmatterString } from './frontmatterStringValue';
import { OWNED_FRONTMATTER_KEYS } from './ownedFrontmatterKeys';

/**
 * Custom properties — the frontmatter keys Clutter doesn't own — read from
 * the page's preserved raw lines (PageMetadata.unownedFrontmatter), which
 * stay their one source of truth: a custom property is derived here on
 * demand, never stored. Its type is inferred from how its value is
 * written, so a rename (which never touches the value) keeps it.
 */
export type CustomFrontmatterProperty =
  | { readonly key: string; readonly type: 'text'; readonly value: string }
  | { readonly key: string; readonly type: 'number'; readonly value: number }
  | { readonly key: string; readonly type: 'boolean'; readonly value: boolean }
  | { readonly key: string; readonly type: 'date'; readonly value: string }
  | { readonly key: string; readonly type: 'url'; readonly value: string }
  | { readonly key: string; readonly type: 'list'; readonly value: readonly string[] };

interface KeyBlock {
  readonly key: string;
  /** Index of the `key: …` line within the raw lines. */
  readonly start: number;
  /** The text after the key's `:`, trimmed. */
  readonly inlineValue: string;
  /** The block's continuation lines (indented lines, list items, inner blanks). */
  readonly continuation: readonly string[];
}

/**
 * Conservative scalar recognizers: each accepts only an unambiguous,
 * unquoted spelling, so anything doubtful stays `text` (shown as written).
 */
const BOOLEAN = /^(?:true|True|TRUE|false|False|FALSE)$/;
// Decimal only, no leading zeros on the integer part (`007` is an id, not
// 7), no YAML-only forms (`1_000`, `0x1F`, `.inf`).
const NUMBER = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

/** A real calendar date (`2026-02-30` is not), or an ISO date-time that parses. */
function isValidDate(text: string): boolean {
  const date = ISO_DATE.exec(text);

  if (date) {
    const [year, month, day] = [Number(date[1]), Number(date[2]), Number(date[3])];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    );
  }

  return ISO_DATE_TIME.test(text) && Number.isFinite(Date.parse(text));
}

/** An absolute `http(s)` URL with a host — bare domains and other schemes stay text. */
function isWebUrl(text: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(text)) {
    return false;
  }

  try {
    return new URL(text).hostname !== '';
  } catch {
    return false;
  }
}

/**
 * A list item as a string, or null when it isn't one: quoted items are
 * strings whatever they contain; an unquoted item must not read as another
 * YAML type (number, boolean, null) or a nested structure.
 */
function listItemString(raw: string): string | null {
  const item = raw.trim();

  if (/^["']/.test(item)) {
    return unquoteFrontmatterString(item);
  }

  if (
    item === '' ||
    BOOLEAN.test(item) ||
    NUMBER.test(item) ||
    /^(?:null|~)$/.test(item) ||
    /^[[{]/.test(item) ||
    /: |:$/.test(item)
  ) {
    return null;
  }

  return item;
}

/** Every item as a string, or null when any isn't (the list then shows as text). */
function stringArray(items: readonly string[]): string[] | null {
  const strings = items.map(listItemString);
  return strings.every((item): item is string => item !== null) ? strings : null;
}

/**
 * Splits raw frontmatter lines into top-level key blocks — the same
 * boundaries FrontmatterParser captured them by: a block starts at an
 * unindented `key:` line; indented lines, list items and blank lines
 * belong to it. Comment lines (`# …`) are never keys.
 */
function splitKeyBlocks(lines: readonly string[]): KeyBlock[] {
  const blocks: { key: string; start: number; inlineValue: string; continuation: string[] }[] = [];

  lines.forEach((line, index) => {
    const isTopLevel = line !== '' && !/^\s/.test(line) && !line.startsWith('- ');
    const separator = line.indexOf(':');

    if (isTopLevel && separator !== -1 && !line.startsWith('#')) {
      blocks.push({
        key: line.slice(0, separator).trim(),
        start: index,
        inlineValue: line.slice(separator + 1).trim(),
        continuation: [],
      });
    } else {
      blocks[blocks.length - 1]?.continuation.push(line);
    }
  });

  return blocks;
}

/**
 * Infers a custom property's type from its parsed value, conservatively:
 * boolean, number, a valid date/date-time, a valid web URL, or a string
 * array (→ list) only when the value is unambiguously that; everything
 * else — strings, quoted values, empty/null, nested mappings, block
 * scalars, non-string or nested lists — is `text`, shown as written.
 * Inference only shapes the Property model; the frontmatter is never
 * rewritten because of it.
 */
function readBlock({ key, inlineValue, continuation }: KeyBlock): CustomFrontmatterProperty {
  const nonBlank = continuation.filter((line) => line.trim() !== '');
  const asText = (): CustomFrontmatterProperty => ({
    key,
    type: 'text',
    value: [inlineValue, ...nonBlank.map((line) => line.trim())].filter(Boolean).join('\n'),
  });

  if (inlineValue === '') {
    const isBlockList =
      nonBlank.length > 0 && nonBlank.every((line) => /^\s*- /.test(line) || /^\s*-$/.test(line));
    const items = isBlockList ? stringArray(nonBlank.map((line) => line.trim().slice(1))) : null;

    return items ? { key, type: 'list', value: items } : asText();
  }

  // Anything after the value line (a block scalar `|`/`>`, or a value
  // continued on indented lines) is text.
  if (nonBlank.length > 0) {
    return asText();
  }

  const flowItems = splitFlowSequence(inlineValue);

  if (flowItems) {
    // An empty `[]` has nothing to show as pills; a nested `[`/`{` item
    // fails stringArray (ambiguous) — both text.
    const items = flowItems.length === 1 && flowItems[0] === '' ? null : stringArray(flowItems);
    return items ? { key, type: 'list', value: items } : asText();
  }

  // A quoted value is a string in YAML, whatever it looks like.
  if (/^["']/.test(inlineValue)) {
    return { key, type: 'text', value: unquoteFrontmatterString(inlineValue) };
  }

  if (BOOLEAN.test(inlineValue)) {
    return { key, type: 'boolean', value: inlineValue.toLowerCase() === 'true' };
  }

  if (NUMBER.test(inlineValue) && Number.isFinite(Number(inlineValue))) {
    return { key, type: 'number', value: Number(inlineValue) };
  }

  if (isValidDate(inlineValue)) {
    return { key, type: 'date', value: inlineValue };
  }

  if (isWebUrl(inlineValue)) {
    return { key, type: 'url', value: inlineValue };
  }

  return { key, type: 'text', value: /^(?:null|~)$/.test(inlineValue) ? '' : inlineValue };
}

/** The page's custom properties, in file order. */
export function readCustomProperties(lines: readonly string[]): CustomFrontmatterProperty[] {
  return splitKeyBlocks(lines).map(readBlock);
}

/** Whether `name` is a system property's canonical key, ignoring case (`Tags`, `CREATED`, …). */
export function isReservedPropertyName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return [...OWNED_FRONTMATTER_KEYS].some((key) => key.toLowerCase() === lower);
}

export type CustomPropertyNameProblem = 'empty' | 'reserved' | 'unsupported' | 'taken';

/**
 * Why `name` can't become the new name of custom property `currentKey` on
 * a page with these raw lines, or null when it can. Names are trimmed (the
 * same normalization the parser applies to keys). Rejected:
 * - `empty`: nothing but whitespace;
 * - `reserved`: a system property's canonical key, case-insensitively;
 * - `unsupported`: text the frontmatter reader can't read back as this
 *   key — a `:` (the key/value separator), a line break, or a leading YAML
 *   indicator (`#` would make it a comment, `-` a list item, …);
 * - `taken`: another custom key on this page already has that exact name
 *   (YAML keys are case-sensitive; two equal keys would lose a value).
 */
export function validateCustomPropertyName(
  lines: readonly string[],
  currentKey: string,
  name: string
): CustomPropertyNameProblem | null {
  const trimmed = name.trim();

  if (trimmed === '') {
    return 'empty';
  }

  if (isReservedPropertyName(trimmed)) {
    return 'reserved';
  }

  if (/[:\n\r]/.test(trimmed) || /^[-?,[\]{}#&*!|>'"%@`]/.test(trimmed)) {
    return 'unsupported';
  }

  if (trimmed !== currentKey && splitKeyBlocks(lines).some((block) => block.key === trimmed)) {
    return 'taken';
  }

  return null;
}

/**
 * The raw lines with custom property `currentKey` renamed to `name`
 * (trimmed): only the key text of its `key:` line changes — everything
 * from the `:` on, its continuation lines, and every other line stay
 * byte-identical. Throws when the key isn't there or the name is invalid
 * (validateCustomPropertyName) — callers check first.
 */
export function renameCustomProperty(
  lines: readonly string[],
  currentKey: string,
  name: string
): string[] {
  const problem = validateCustomPropertyName(lines, currentKey, name);

  if (problem) {
    throw new Error(`Cannot rename property "${currentKey}" to "${name}": ${problem}.`);
  }

  const block = splitKeyBlocks(lines).find((candidate) => candidate.key === currentKey);

  if (!block) {
    throw new Error(`No custom property "${currentKey}".`);
  }

  const line = lines[block.start]!;
  const renamed = [...lines];
  renamed[block.start] = `${name.trim()}${line.slice(line.indexOf(':'))}`;
  return renamed;
}

/**
 * The raw lines with item `index` removed from list custom property
 * `key` — the pill being dismissed. `expected` is that item's value as
 * shown; the removal is refused (throws) unless the item there still has
 * it, so a file changed in the meantime never loses the wrong item.
 *
 * Only that item's text goes: a block list drops its `- item` line; a
 * flow list (`[a, b]`) is rewritten from its remaining items exactly as
 * written (quoting kept). Every other line stays byte-identical. Removing
 * the last item leaves the key with an empty list (`key: []`).
 */
export function removeCustomListItem(
  lines: readonly string[],
  key: string,
  index: number,
  expected: string
): string[] {
  const block = splitKeyBlocks(lines).find((candidate) => candidate.key === key);
  const property = block && readBlock(block);

  if (!block || !property || property.type !== 'list') {
    throw new Error(`No list property "${key}".`);
  }

  if (property.value[index] !== expected) {
    throw new Error(`List property "${key}" has no item "${expected}" at ${index}.`);
  }

  const result = [...lines];

  if (block.inlineValue !== '') {
    const remaining = splitFlowSequence(block.inlineValue)!.filter((_, itemIndex) => itemIndex !== index);
    const line = lines[block.start]!;
    result[block.start] = `${line.slice(0, line.indexOf(':'))}: [${remaining.join(', ')}]`;
    return result;
  }

  // Block list: the index-th list-item line after the key.
  let seen = -1;
  for (let lineIndex = block.start + 1; lineIndex < lines.length; lineIndex++) {
    if (/^\s*-(?:\s|$)/.test(lines[lineIndex]!) && ++seen === index) {
      result.splice(lineIndex, 1);
      if (property.value.length === 1) {
        const keyLine = lines[block.start]!;
        result[block.start] = `${keyLine.slice(0, keyLine.indexOf(':'))}: []`;
      }
      return result;
    }
  }

  throw new Error(`List property "${key}" has no item at ${index}.`);
}
