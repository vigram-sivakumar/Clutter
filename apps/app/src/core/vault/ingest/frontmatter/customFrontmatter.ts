import {
  quoteFrontmatterString,
  splitFlowSequence,
  unquoteFrontmatterString,
} from './frontmatterStringValue';
import { isReservedRawKey, OWNED_FRONTMATTER_KEYS } from './ownedFrontmatterKeys';

/**
 * Custom properties — the frontmatter keys Clutter doesn't own — read from
 * the page's preserved raw lines (PageMetadata.unownedFrontmatter), which
 * stay their one source of truth: a custom property is derived here on
 * demand, never stored. Its type is inferred from how its value is
 * written, so a rename (which never touches the value) keeps it.
 *
 * An empty value has nothing to infer from, so the types that can be
 * empty and aren't text carry theirs as a trailing YAML comment on the
 * key line — `due: # date`, `estimate: # number`, `site: # url` (a null
 * to any other YAML reader, and kept byte-identical on every save). An
 * empty list is `key: []`, and an empty text value is `key:`. No other
 * schema exists: this is the whole of how a typed property stays typed
 * while it is empty.
 */
export type CustomFrontmatterProperty =
  | { readonly key: string; readonly type: 'text'; readonly value: string }
  | { readonly key: string; readonly type: 'number'; readonly value: number | null }
  | { readonly key: string; readonly type: 'boolean'; readonly value: boolean }
  | { readonly key: string; readonly type: 'date'; readonly value: string | null }
  | { readonly key: string; readonly type: 'url'; readonly value: string | null }
  | { readonly key: string; readonly type: 'list'; readonly value: readonly string[] };

export interface KeyBlock {
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
// A comment-only value naming the type of an empty property (see the
// module doc): `# date`, `# number`, `# url`.
const TYPED_EMPTY = /^#\s*(number|date|url)\s*$/;
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
export function splitKeyBlocks(lines: readonly string[]): KeyBlock[] {
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

  const emptyType = TYPED_EMPTY.exec(inlineValue)?.[1] as 'number' | 'date' | 'url' | undefined;

  if (emptyType) {
    return { key, type: emptyType, value: null };
  }

  const flowItems = splitFlowSequence(inlineValue);

  if (flowItems) {
    // `[]` is a YAML sequence too: a list whatever its length, never text
    // because it has no items. A nested `[`/`{` item fails stringArray (ambiguous): text.
    const items = flowItems.length === 1 && flowItems[0] === '' ? [] : stringArray(flowItems);
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
  // A reserved raw key (`properties`) is Clutter's own UI configuration,
  // never a custom property.
  return splitKeyBlocks(lines)
    .filter((block) => !isReservedRawKey(block.key))
    .map(readBlock);
}

/** Whether `name` is a system property's canonical key or a reserved raw key (`properties`), ignoring case (`Tags`, `CREATED`, …). */
export function isReservedPropertyName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return (
    isReservedRawKey(lower) || [...OWNED_FRONTMATTER_KEYS].some((key) => key.toLowerCase() === lower)
  );
}

export type CustomPropertyNameProblem = 'empty' | 'reserved' | 'unsupported' | 'taken';

/**
 * Why `name` can't be the name of custom property `currentKey` on a page
 * with these raw lines (`currentKey` is '' for a property that doesn't
 * exist yet), or null when it can — the one rule both adding and renaming
 * use. Names are trimmed (the same normalization the parser applies to
 * keys). Rejected:
 * - `empty`: nothing but whitespace;
 * - `reserved`: a system property's canonical key, case-insensitively;
 * - `unsupported`: text the frontmatter reader can't read back as this
 *   key — a `:` (the key/value separator), a line break, or a leading YAML
 *   indicator (`#` would make it a comment, `-` a list item, …);
 * - `taken`: another custom key on this page — or one of `otherNames`,
 *   names the UI holds that aren't in the lines yet — already has that
 *   name, ignoring letter case (`Priority` and `priority` can't coexist).
 *   The property's own key never conflicts with itself, so changing only
 *   its letter case is allowed.
 */
export function validateCustomPropertyName(
  lines: readonly string[],
  currentKey: string,
  name: string,
  otherNames: readonly string[] = []
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

  const lower = trimmed.toLowerCase();
  const taken = [
    ...splitKeyBlocks(lines)
      .map((block) => block.key)
      .filter((key) => key !== currentKey),
    ...otherNames,
  ];

  return taken.some((existing) => existing.trim().toLowerCase() === lower) ? 'taken' : null;
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
 * The raw lines with list custom property block `block` emptied: its
 * `key:` line becomes `key: []` and its `- item` lines go. The property
 * stays (a list with no values, not a removed or text property); every
 * other line is untouched.
 */
function withEmptiedList(lines: readonly string[], block: KeyBlock): string[] {
  const keyLine = lines[block.start]!;
  const end = block.start + 1 + block.continuation.length;

  return lines.flatMap((line, index) => {
    if (index === block.start) {
      return [`${keyLine.slice(0, keyLine.indexOf(':'))}: []`];
    }

    return index > block.start && index < end && /^\s*-(?:\s|$)/.test(line) ? [] : [line];
  });
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
 * the last item leaves the property with an empty list (`key: []`).
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

  if (property.value.length === 1) {
    return withEmptiedList(lines, block);
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
      return result;
    }
  }

  throw new Error(`List property "${key}" has no item at ${index}.`);
}

/**
 * A flow-list item's text: quoteFrontmatterString's, and always quoted
 * when it holds a flow indicator (`,` `[` `]` `{` `}`), which would
 * otherwise end the item early.
 */
export function flowListItem(value: string): string {
  return /[,[\]{}]/.test(value)
    ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : quoteFrontmatterString(value);
}

/**
 * The raw lines with list custom property `key`'s whole value replaced by
 * `values` — the pill editor committing its complete list. Values are
 * trimmed; empty ones are dropped; one containing a line break is refused
 * (throws), since a list item is a single line. Throws when `key` isn't a
 * list property.
 *
 * The list keeps its form: a flow list (`[a, b]`) is rewritten as a flow
 * list, a block list keeps its `- item` lines and indentation. An item
 * unchanged at its position keeps its original spelling (quoting
 * included); an empty `key: []` fills as a block list; a new or changed
 * one is written by quoteFrontmatterString,
 * plain unless that would be misread (a flow list also quotes
 * `,` `[` `]` `{` `}`). Every other line stays
 * byte-identical. An empty `values` leaves the property as `key: []`, as
 * removing a list's last item does — it empties the list, never removes it.
 */
export function setCustomListValue(
  lines: readonly string[],
  key: string,
  values: readonly string[]
): string[] {
  const block = splitKeyBlocks(lines).find((candidate) => candidate.key === key);
  const property = block && readBlock(block);

  if (!block || !property || property.type !== 'list') {
    throw new Error(`No list property "${key}".`);
  }

  if (values.some((value) => /[\n\r]/.test(value))) {
    throw new Error(`List property "${key}" cannot hold a value with a line break.`);
  }

  const next = values.map((value) => value.trim()).filter((value) => value !== '');
  if (next.length === 0) {
    return withEmptiedList(lines, block);
  }

  const keyLine = lines[block.start]!;
  const keyPrefix = keyLine.slice(0, keyLine.indexOf(':'));
  const result = [...lines];

  // An empty list (`key: []`) has no form of its own to keep: it fills as a
  // block list, the canonical shape.
  if (property.value.length === 0 && block.inlineValue !== '') {
    result[block.start] = `${keyPrefix}:`;
    result.splice(block.start + 1, 0, ...next.map((value) => `  - ${quoteFrontmatterString(value)}`));
    return result;
  }

  if (block.inlineValue !== '') {
    const rawItems = splitFlowSequence(block.inlineValue)!;
    const items = next.map((value, index) =>
      property.value[index] === value ? rawItems[index]! : flowListItem(value)
    );
    result[block.start] = `${keyPrefix}: [${items.join(', ')}]`;
    return result;
  }

  // Block list: the key line is followed by its `- item` lines, which are
  // replaced in place (comments or blank lines between them are kept after).
  const end = block.start + 1 + block.continuation.length;
  const itemLineIndexes: number[] = [];
  for (let lineIndex = block.start + 1; lineIndex < end; lineIndex++) {
    if (/^\s*-(?:\s|$)/.test(lines[lineIndex]!)) {
      itemLineIndexes.push(lineIndex);
    }
  }

  const indent = /^\s*/.exec(lines[itemLineIndexes[0]!]!)![0];
  const itemLines = next.map((value, index) =>
    property.value[index] === value
      ? lines[itemLineIndexes[index]!]!
      : `${indent}- ${quoteFrontmatterString(value)}`
  );

  // Splice from the end so earlier indexes stay valid; the new lines go
  // where the first item line was.
  const first = itemLineIndexes[0]!;
  for (const lineIndex of [...itemLineIndexes].reverse()) {
    result.splice(lineIndex, 1);
  }
  result.splice(first, 0, ...itemLines);
  return result;
}

/** The custom property types whose value is one scalar (everything but a list). */
export type CustomScalarType = 'text' | 'number' | 'boolean' | 'date' | 'url';
export type CustomScalarValue = string | number | boolean;

/**
 * What a typed URL becomes as a custom property's value: the text itself
 * when it is an absolute `http(s)` URL (all that a stored value is read
 * back as a url by), `https://` + the text for a bare domain
 * (`example.com`, `www.example.com/a`), else null — so `mailto:` links,
 * emails and plain words aren't stored as a url they would read back as
 * text instead of.
 */
export function toCustomUrl(text: string): string | null {
  const trimmed = text.trim();

  if (isWebUrl(trimmed)) {
    return trimmed;
  }

  const withScheme = `https://${trimmed}`;

  return /^[^\s/:@]+\.[^\s/:@]+/.test(trimmed) && isWebUrl(withScheme) ? withScheme : null;
}

/**
 * The raw YAML spelling of `value` as a `type` custom property — the text
 * after `key: `. A custom property's type is inferred from how its value
 * is written (readBlock), so a value is only written when it reads back
 * as exactly `type`; anything else throws, never a silently different
 * type. `null` is the empty value: `# number` / `# date` / `# url` for
 * those types, '' for text. Text is written plain when safe, else double-quoted (a quoted
 * value is always a string, whatever it looks like); a value with a line
 * break is refused, since a scalar is one line.
 */
export function formatCustomScalar(
  type: CustomScalarType,
  value: CustomScalarValue | null
): string {
  const fail = (): never => {
    throw new Error(`"${String(value)}" is not a valid ${type} value.`);
  };
  let raw: string;

  // Empty: nothing for the type to be inferred from, so a number, date or
  // url keeps it as a comment (see the module doc); an empty text value is
  // just no value. A boolean has no empty state — unchecked is `false`.
  if (value === null) {
    if (type === 'boolean') {
      return fail();
    }

    raw = type === 'text' ? '' : `# ${type}`;

    if (readValue(raw).type !== type) {
      fail();
    }

    return raw;
  }

  switch (type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail();
      }
      raw = String(value);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        fail();
      }
      raw = String(value);
      break;
    case 'date':
    case 'url':
      if (typeof value !== 'string') {
        fail();
      }
      raw = (value as string).trim();
      break;
    case 'text': {
      if (typeof value !== 'string' || /[\n\r]/.test(value)) {
        fail();
      }
      const text = (value as string).trim();
      raw = quoteFrontmatterString(text);
      // Plain text that would read as another type (`42`, a date, a URL)
      // must be quoted to stay text.
      if (readValue(raw).type !== 'text') {
        raw = `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      }
      break;
    }
  }

  if (readValue(raw).type !== type) {
    fail();
  }

  return raw;
}

/** How `raw` (the text after `key:`) would be read back — what a value's type is judged by. */
function readValue(raw: string): CustomFrontmatterProperty {
  return readBlock({ key: 'k', start: 0, inlineValue: raw, continuation: [] });
}

/**
 * The raw lines with scalar custom property `key`'s value replaced by
 * `value` (spelled by formatCustomScalar as `type`), or emptied when
 * `value` is null — written so it keeps its type (`key: # date`, or just
 * `key:` for text), never falling back to text. Only that property's own
 * lines change (a block scalar's continuation lines go with its value);
 * every other line stays byte-identical. Throws when `key` isn't a
 * scalar property or the value is refused.
 */
export function setCustomScalarValue(
  lines: readonly string[],
  key: string,
  type: CustomScalarType,
  value: CustomScalarValue | null
): string[] {
  const block = splitKeyBlocks(lines).find((candidate) => candidate.key === key);
  const property = block && readBlock(block);

  if (!block || !property || property.type === 'list') {
    throw new Error(`No scalar property "${key}".`);
  }

  const raw = formatCustomScalar(type, value);
  const keyLine = lines[block.start]!;
  const prefix = keyLine.slice(0, keyLine.indexOf(':'));

  let last = block.start;
  block.continuation.forEach((line, offset) => {
    if (line.trim() !== '') {
      last = block.start + 1 + offset;
    }
  });

  return [
    ...lines.slice(0, block.start),
    raw === '' ? `${prefix}:` : `${prefix}: ${raw}`,
    ...lines.slice(last + 1),
  ];
}

/** A custom property to add: its type, and the value it starts with. */
export type NewCustomProperty =
  | { readonly type: CustomScalarType; readonly value: CustomScalarValue | null }
  | { readonly type: 'multi-select'; readonly value: readonly string[] };

/**
 * The value a newly added custom property of `type` starts with: empty,
 * and written so it keeps its type — a boolean is unchecked (`false`, its
 * only empty state), a list is `[]`, and the rest are an empty value
 * (a number, date or url as a `# type` comment; text as no value).
 */
export function emptyCustomProperty(
  type: CustomScalarType | 'multi-select'
): NewCustomProperty {
  if (type === 'multi-select') {
    return { type, value: [] };
  }

  return type === 'boolean' ? { type, value: false } : { type, value: null };
}

/**
 * The raw lines with custom property `name` appended after every existing
 * line (so every other line stays byte-identical). The name is validated
 * (validateCustomPropertyName) and the value must read back as the
 * given type, else it throws. A scalar is one `name: value` line; a list
 * is a block list, or `name: []` when empty — which reads back as an
 * (empty) list, so a multi-select can exist before it has any value.
 */
export function addCustomProperty(
  lines: readonly string[],
  name: string,
  property: NewCustomProperty
): string[] {
  const problem = validateCustomPropertyName(lines, '', name);

  if (problem) {
    throw new Error(`Cannot add property "${name}": ${problem}.`);
  }

  const key = name.trim();

  if (property.type === 'multi-select') {
    const items = property.value.map((item) => item.trim()).filter((item) => item !== '');

    if (property.value.some((item) => /[\n\r]/.test(item))) {
      throw new Error(`List property "${key}" cannot hold a value with a line break.`);
    }

    return [
      ...lines,
      ...(items.length === 0
        ? [`${key}: []`]
        : [`${key}:`, ...items.map((item) => `  - ${quoteFrontmatterString(item)}`)]),
    ];
  }

  const raw = formatCustomScalar(property.type, property.value);

  return [...lines, raw === '' ? `${key}:` : `${key}: ${raw}`];
}

/**
 * The raw lines without custom property `key` — its `key:` line and every
 * continuation line up to its last non-blank one (a list's items, a block
 * scalar's text). Blank lines after that, and every other line, are
 * untouched. Throws when `key` isn't a custom property here (a reserved
 * raw key such as `properties` never is).
 */
export function removeCustomProperty(lines: readonly string[], key: string): string[] {
  const block = splitKeyBlocks(lines).find(
    (candidate) => candidate.key === key && !isReservedRawKey(candidate.key)
  );

  if (!block) {
    throw new Error(`No custom property "${key}".`);
  }

  let last = block.start;
  block.continuation.forEach((line, offset) => {
    if (line.trim() !== '') {
      last = block.start + 1 + offset;
    }
  });

  return [...lines.slice(0, block.start), ...lines.slice(last + 1)];
}
