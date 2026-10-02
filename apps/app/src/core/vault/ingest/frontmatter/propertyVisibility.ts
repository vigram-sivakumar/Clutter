import {
  flowListItem,
  splitKeyBlocks,
  type KeyBlock,
} from './customFrontmatter';
import {
  quoteFrontmatterString,
  splitFlowSequence,
  unquoteFrontmatterString,
} from './frontmatterStringValue';

/**
 * Which Properties a note shows: the `visible` list under the reserved
 * `properties` key.
 *
 * ```yaml
 * properties:
 *   visible:
 *     - tags
 *     - Due date
 * ```
 *
 * Nothing is shown by default; a Property is shown only when its
 * canonical key is listed — the system key (`tags`, `aliases`, `created`,
 * `modified`) or a custom Property's actual frontmatter key, never a UI
 * label. Visibility is separate from the Property's existence and value:
 * adding a key here changes nothing else.
 *
 * This is internal UI configuration kept as preserved raw lines
 * (PageMetadata.unownedFrontmatter), not parsed into the page model, so
 * the flat FrontmatterParser needs no nested-YAML support and every other
 * line — including anything else under `properties:` — stays
 * byte-identical. Everything here is show-only: it appends to the list
 * (insertion order is kept, nothing is reordered) and rewrites an entry
 * when its Property is renamed; nothing removes one.
 */
const PROPERTIES_KEY = 'properties';
const VISIBLE_KEY = 'visible';

const indentOf = (line: string): string => /^\s*/.exec(line)![0];
const isBlank = (line: string): boolean => line.trim() === '';

interface VisibleList {
  /** The `properties:` block. */
  readonly block: KeyBlock;
  /** Index (in the raw lines) of the `visible:` line, or -1 when the block has none. */
  readonly line: number;
  /** The text after `visible:` ('' for a block list). */
  readonly inline: string;
  /** Indexes of the block list's `- item` lines. */
  readonly items: readonly number[];
}

function findProperties(lines: readonly string[]): KeyBlock | undefined {
  return splitKeyBlocks(lines).find((block) => block.key.trim().toLowerCase() === PROPERTIES_KEY);
}

/** Index of the last non-blank line of `block` (its key line when it has no content). */
function lastContentLine(block: KeyBlock): number {
  let last = block.start;
  block.continuation.forEach((line, offset) => {
    if (!isBlank(line)) {
      last = block.start + 1 + offset;
    }
  });
  return last;
}

function findVisible(lines: readonly string[]): VisibleList | undefined {
  const block = findProperties(lines);

  if (!block) {
    return undefined;
  }

  const firstChild = block.continuation.findIndex((line) => !isBlank(line));
  const childIndent = firstChild === -1 ? '' : indentOf(block.continuation[firstChild]!);
  const offset = block.continuation.findIndex(
    (line) =>
      childIndent !== '' &&
      indentOf(line) === childIndent &&
      new RegExp(`^${VISIBLE_KEY}\\s*:`).test(line.trim())
  );

  if (offset === -1) {
    return { block, line: -1, inline: '', items: [] };
  }

  const line = block.start + 1 + offset;
  const visibleLine = lines[line]!;
  const inline = visibleLine.slice(visibleLine.indexOf(':') + 1).trim();
  const items: number[] = [];

  for (let index = line + 1; index <= lastContentLine(block); index++) {
    const candidate = lines[index]!;

    if (isBlank(candidate)) {
      continue;
    }

    if (indentOf(candidate).length <= indentOf(visibleLine).length) {
      break;
    }

    if (/^\s*-(?:\s|$)/.test(candidate)) {
      items.push(index);
    }
  }

  return { block, line, inline, items };
}

const itemText = (line: string): string => unquoteFrontmatterString(line.trim().slice(1)).trim();

/**
 * The canonical keys the note shows, in the order they were added. Reads a
 * block list and a one-line flow list (`visible: [tags, aliases]`);
 * empty entries are skipped. No `properties.visible` means none.
 */
export function readVisibleProperties(lines: readonly string[]): string[] {
  const visible = findVisible(lines);

  if (!visible || visible.line === -1) {
    return [];
  }

  const entries =
    visible.inline !== ''
      ? (splitFlowSequence(visible.inline)?.map((raw) => unquoteFrontmatterString(raw).trim()) ?? [])
      : visible.items.map((index) => itemText(lines[index]!));

  return entries.filter((entry) => entry !== '');
}

/**
 * The raw lines with `key` appended to `properties.visible` — shown from
 * now on. The list's existing entries keep their order and spelling; the
 * new key goes last. A key already listed changes nothing. If there is no
 * `properties:` block (or no `visible:` in it) one is created; every other
 * line, including other keys under `properties:`, stays byte-identical.
 * Throws when `properties` or `visible` is something other than a mapping
 * or list this can extend (e.g. a scalar), rather than overwrite it.
 */
export function addVisibleProperty(lines: readonly string[], key: string): string[] {
  const name = key.trim();

  if (name === '') {
    throw new Error('A visible property needs a key.');
  }

  if (readVisibleProperties(lines).includes(name)) {
    return [...lines];
  }

  const visible = findVisible(lines);
  const item = (indent: string): string => `${indent}- ${quoteFrontmatterString(name)}`;

  // No `properties:` block at all: a new one after every existing line.
  if (!visible) {
    return [...lines, `${PROPERTIES_KEY}:`, `  ${VISIBLE_KEY}:`, item('    ')];
  }

  const { block } = visible;

  if (block.inlineValue !== '') {
    throw new Error(`"${PROPERTIES_KEY}" is not a mapping, so "${VISIBLE_KEY}" can't be added to it.`);
  }

  // `properties:` without a `visible:` list: add one after its last line.
  if (visible.line === -1) {
    const first = block.continuation.find((line) => !isBlank(line));
    const indent = first ? indentOf(first) : '  ';
    const last = lastContentLine(block);

    return [...lines.slice(0, last + 1), `${indent}${VISIBLE_KEY}:`, item(`${indent}  `), ...lines.slice(last + 1)];
  }

  const visibleLine = lines[visible.line]!;
  const prefix = visibleLine.slice(0, visibleLine.indexOf(':'));

  // A one-line flow list: rewritten from its existing items as written.
  if (visible.inline !== '') {
    const raw = splitFlowSequence(visible.inline);

    if (!raw) {
      throw new Error(`"${PROPERTIES_KEY}.${VISIBLE_KEY}" is not a list, so a key can't be added to it.`);
    }

    const existing = raw.filter((entry) => entry !== '');
    const result = [...lines];
    result[visible.line] = `${prefix}: [${[...existing, flowListItem(name)].join(', ')}]`;
    return result;
  }

  // A block list (possibly empty): the new item follows the last one, in
  // the same indentation.
  const last = visible.items.length > 0 ? visible.items[visible.items.length - 1]! : visible.line;
  const indent = visible.items.length > 0 ? indentOf(lines[visible.items[0]!]!) : `${indentOf(visibleLine)}  `;

  return [...lines.slice(0, last + 1), item(indent), ...lines.slice(last + 1)];
}

/**
 * The raw lines with the entry `oldKey` of `properties.visible` rewritten
 * to `newKey`, in place (its position and the rest of the list untouched)
 * — a visible custom Property being renamed must stay visible. Nothing
 * changes when `oldKey` isn't listed.
 */
export function renameVisibleProperty(
  lines: readonly string[],
  oldKey: string,
  newKey: string
): string[] {
  const visible = findVisible(lines);

  if (!visible || visible.line === -1) {
    return [...lines];
  }

  const result = [...lines];
  const next = newKey.trim();

  if (visible.inline !== '') {
    const raw = splitFlowSequence(visible.inline);

    if (!raw) {
      return result;
    }

    const visibleLine = lines[visible.line]!;
    const prefix = visibleLine.slice(0, visibleLine.indexOf(':'));
    const entries = raw.map((entry) => (unquoteFrontmatterString(entry).trim() === oldKey ? flowListItem(next) : entry));

    result[visible.line] = `${prefix}: [${entries.filter((entry) => entry !== '').join(', ')}]`;
    return result;
  }

  for (const index of visible.items) {
    if (itemText(lines[index]!) === oldKey) {
      result[index] = `${indentOf(lines[index]!)}- ${quoteFrontmatterString(next)}`;
    }
  }

  return result;
}
