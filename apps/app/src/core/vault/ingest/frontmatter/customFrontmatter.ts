import { parseFlowSequence, unquoteFrontmatterString } from './frontmatterStringValue';
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

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const WEB_URL = /^https?:\/\/\S+$/i;

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

function readBlock({ key, inlineValue, continuation }: KeyBlock): CustomFrontmatterProperty {
  const nonBlank = continuation.filter((line) => line.trim() !== '');

  if (inlineValue === '' || inlineValue === '|' || inlineValue === '>') {
    if (inlineValue === '' && nonBlank.length > 0 && nonBlank.every((line) => line.trim().startsWith('- '))) {
      return {
        key,
        type: 'list',
        value: nonBlank.map((line) => unquoteFrontmatterString(line.trim().slice(2))),
      };
    }

    // No value, a block scalar, or a nested mapping: shown as its text.
    return { key, type: 'text', value: nonBlank.map((line) => line.trim()).join('\n') };
  }

  const list = parseFlowSequence(inlineValue);

  if (list) {
    return { key, type: 'list', value: list.filter((item) => item !== '') };
  }

  // A quoted value is a string in YAML, whatever it looks like.
  if (/^["']/.test(inlineValue)) {
    return { key, type: 'text', value: unquoteFrontmatterString(inlineValue) };
  }

  if (inlineValue === 'true' || inlineValue === 'false') {
    return { key, type: 'boolean', value: inlineValue === 'true' };
  }

  if (NUMBER.test(inlineValue) && Number.isFinite(Number(inlineValue))) {
    return { key, type: 'number', value: Number(inlineValue) };
  }

  if (ISO_DATE.test(inlineValue)) {
    return { key, type: 'date', value: inlineValue };
  }

  if (WEB_URL.test(inlineValue)) {
    return { key, type: 'url', value: inlineValue };
  }

  return { key, type: 'text', value: inlineValue === 'null' || inlineValue === '~' ? '' : inlineValue };
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
