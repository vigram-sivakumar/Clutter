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
 * Whether a note shows its Properties section (`show`), and which
 * Properties the section lists (`visible`) — two independent settings under
 * the reserved `properties` key.
 *
 * ```yaml
 * properties:
 *   show: true
 *   visible:
 *     - tags
 *     - Due date
 * ```
 *
 * `show` controls the whole section: `true` shows it; `false` or no
 * `show` hides it (hidden is the default, so nothing is written to
 * establish it). It never touches `visible`, and `visible` never touches
 * it.
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
 * byte-identical. The list keeps insertion order: a Property is shown by
 * appending its key, hidden by removing only its key, and renamed by
 * rewriting its entry in place — nothing is ever reordered.
 */
const PROPERTIES_KEY = 'properties';
const VISIBLE_KEY = 'visible';
const SHOW_KEY = 'show';

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

/**
 * The raw lines with `key` removed from `properties.visible` — hidden from
 * now on. Only that entry goes: the rest of the list keeps its order and
 * spelling, the `visible:` line stays (empty if that was the last entry),
 * and every other line, including other keys under `properties:`, stays
 * byte-identical. Nothing changes when `key` isn't listed. The property's
 * own value is never touched — visibility is separate from existence.
 */
export function removeVisibleProperty(lines: readonly string[], key: string): string[] {
  const visible = findVisible(lines);
  const name = key.trim();

  if (!visible || visible.line === -1 || !readVisibleProperties(lines).includes(name)) {
    return [...lines];
  }

  if (visible.inline !== '') {
    const raw = splitFlowSequence(visible.inline);

    if (!raw) {
      return [...lines];
    }

    const visibleLine = lines[visible.line]!;
    const prefix = visibleLine.slice(0, visibleLine.indexOf(':'));
    const kept = raw.filter((entry) => entry !== '' && unquoteFrontmatterString(entry).trim() !== name);
    const result = [...lines];

    result[visible.line] = `${prefix}: [${kept.join(', ')}]`;
    return result;
  }

  const drop = new Set(visible.items.filter((index) => itemText(lines[index]!) === name));

  return lines.filter((_, index) => !drop.has(index));
}

/**
 * The `show:` line of the `properties:` block — a direct child of the block
 * (at its own indentation, so a `show` nested deeper is not it) — or
 * `line: -1` when the block has none; `undefined` when there is no block.
 */
function findShow(lines: readonly string[]): { block: KeyBlock; line: number } | undefined {
  const block = findProperties(lines);

  if (!block) {
    return undefined;
  }

  const firstChild = block.continuation.find((line) => !isBlank(line));

  if (firstChild === undefined) {
    return { block, line: -1 };
  }

  const childIndent = indentOf(firstChild);
  const offset = block.continuation.findIndex(
    (line) => indentOf(line) === childIndent && new RegExp(`^${SHOW_KEY}\\s*:`).test(line.trim())
  );

  return { block, line: offset === -1 ? -1 : block.start + 1 + offset };
}

/**
 * Whether the note shows its Properties section: only an explicit
 * `properties.show: true`. No `properties` block, no `show`, `show: false`,
 * or any other value all mean hidden — the default.
 */
export function readPropertiesSectionVisibility(lines: readonly string[]): boolean {
  const found = findShow(lines);

  if (!found || found.line === -1) {
    return false;
  }

  const text = lines[found.line]!;
  const value = text
    .slice(text.indexOf(':') + 1)
    .split(/\s#/)[0]!
    .trim();

  return /^(?:true|True|TRUE)$/.test(unquoteFrontmatterString(value));
}

/**
 * The raw lines with `properties.show` set so the Properties section is
 * shown (`true`) or hidden (`false`). Only `show` changes: `visible` and
 * everything else under `properties:` — and every other line — stay
 * byte-identical.
 *
 * - An existing `show:` line is rewritten in place (its spelling,
 *   indentation and any trailing comment kept).
 * - Showing with no `show:` adds `show: true` as the block's first entry,
 *   creating the `properties:` block if there is none.
 * - Hiding with no `show:` changes nothing: hidden is already the default,
 *   and `show: false` is never written just to say so.
 *
 * Throws when `properties` is something other than a mapping this can
 * extend (e.g. a scalar), rather than overwrite it.
 */
export function setPropertiesSectionVisibility(lines: readonly string[], show: boolean): string[] {
  const found = findShow(lines);

  if (!found) {
    return show ? [...lines, `${PROPERTIES_KEY}:`, `  ${SHOW_KEY}: true`] : [...lines];
  }

  const { block, line } = found;

  if (line !== -1) {
    const result = [...lines];
    result[line] = lines[line]!.replace(/^(\s*show\s*:)\s*[^\s#]*(.*)$/, `$1 ${show}$2`);
    return result;
  }

  if (!show) {
    return [...lines];
  }

  if (block.inlineValue !== '') {
    throw new Error(`"${PROPERTIES_KEY}" is not a mapping, so "${SHOW_KEY}" can't be added to it.`);
  }

  const first = block.continuation.find((candidate) => !isBlank(candidate));
  const indent = first ? indentOf(first) : '  ';

  return [...lines.slice(0, block.start + 1), `${indent}${SHOW_KEY}: true`, ...lines.slice(block.start + 1)];
}
