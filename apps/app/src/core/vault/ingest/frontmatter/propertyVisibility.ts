import {
  flowListItem,
  splitKeyBlocks,
  type KeyBlock,
} from './customFrontmatter';
import { PAGE_SYSTEM_PROPERTY_KEYS, type PageSystemPropertyKey } from '../../../properties/systemProperties';
import {
  quoteFrontmatterString,
  splitFlowSequence,
  unquoteFrontmatterString,
} from './frontmatterStringValue';

/**
 * The Properties section's configuration — the reserved `properties` key.
 * It holds two things, both about *system* properties and the section:
 *
 * ```yaml
 * properties:
 *   show: false        # only ever written as false: the section is hidden
 *   visible:           # which system properties are listed
 *     - tags
 *     - created
 * ```
 *
 * - `visible` lists, by **canonical key**, the system properties
 *   (`tags`, `aliases`, `created`, `modified`) a note currently displays.
 *   It is never a label, never a custom property (a custom property is
 *   displayed because its frontmatter key exists), and listing or unlisting
 *   a key never touches the property's value. The list is a set: rows
 *   always follow the canonical system order, whatever order it is written in.
 * - `show: false` is the one section-level override: the section is hidden
 *   while everything stays configured. A missing `show` is the normal state,
 *   `show: true` is never written, and a legacy `show: true` (or any other
 *   value) reads as "not hidden" and is dropped the next time the block is
 *   rewritten (normalizePropertiesConfig).
 *
 * This is internal UI configuration kept as preserved raw lines
 * (PageMetadata.unownedFrontmatter), not parsed into the page model, so the
 * flat FrontmatterParser needs no nested-YAML support and every other line —
 * including anything else under `properties:` — stays byte-identical.
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

/** The page system key `entry` spells (any letter case), or null for anything else. */
const systemKeyOf = (entry: string): PageSystemPropertyKey | null =>
  PAGE_SYSTEM_PROPERTY_KEYS.find((key) => key === entry.trim().toLowerCase()) ?? null;

/** Every entry of `properties.visible` as written (a block list or a one-line flow list), blanks skipped. */
function readVisibleEntries(lines: readonly string[]): string[] {
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
 * The system properties the note lists, in the canonical system order
 * (PAGE_SYSTEM_PROPERTY_KEYS) — not the order they were written in. Keys are
 * matched ignoring letter case; anything that isn't a page system key
 * (a legacy custom entry, `lastOpened`) is ignored. No `properties.visible`
 * means none.
 */
export function readListedSystemProperties(lines: readonly string[]): PageSystemPropertyKey[] {
  const listed = new Set(readVisibleEntries(lines).map(systemKeyOf));

  return PAGE_SYSTEM_PROPERTY_KEYS.filter((key) => listed.has(key));
}

/**
 * The raw lines with system property `key` listed in `properties.visible`.
 * Already listed changes nothing. The existing entries keep their order and
 * spelling; the new key goes last. If there is no `properties:` block (or no
 * `visible:` in it) one is created; every other line, including other keys
 * under `properties:`, stays byte-identical. Throws when `properties` or
 * `visible` is something other than a mapping or list this can extend (e.g.
 * a scalar), rather than overwrite it.
 */
export function addVisibleProperty(lines: readonly string[], key: PageSystemPropertyKey): string[] {
  if (readListedSystemProperties(lines).includes(key)) {
    return [...lines];
  }

  const visible = findVisible(lines);
  const item = (indent: string): string => `${indent}- ${quoteFrontmatterString(key)}`;

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
    result[visible.line] = `${prefix}: [${[...existing, flowListItem(key)].join(', ')}]`;
    return result;
  }

  // A block list (possibly empty): the new item follows the last one, in
  // the same indentation.
  const last = visible.items.length > 0 ? visible.items[visible.items.length - 1]! : visible.line;
  const indent = visible.items.length > 0 ? indentOf(lines[visible.items[0]!]!) : `${indentOf(visibleLine)}  `;

  return [...lines.slice(0, last + 1), item(indent), ...lines.slice(last + 1)];
}

/**
 * The raw lines with system property `key` taken out of `properties.visible`
 * (every spelling of it). Only that entry goes: the rest of the list keeps
 * its order and spelling, the `visible:` line stays (empty if that was the
 * last entry), and every other line, including other keys under
 * `properties:`, stays byte-identical. Nothing changes when `key` isn't
 * listed. The property's own value is never touched.
 */
export function removeVisibleProperty(lines: readonly string[], key: PageSystemPropertyKey): string[] {
  const visible = findVisible(lines);

  if (!visible || visible.line === -1 || !readListedSystemProperties(lines).includes(key)) {
    return [...lines];
  }

  if (visible.inline !== '') {
    const raw = splitFlowSequence(visible.inline);

    if (!raw) {
      return [...lines];
    }

    const visibleLine = lines[visible.line]!;
    const prefix = visibleLine.slice(0, visibleLine.indexOf(':'));
    const kept = raw.filter((entry) => entry !== '' && systemKeyOf(unquoteFrontmatterString(entry)) !== key);
    const result = [...lines];

    result[visible.line] = `${prefix}: [${kept.join(', ')}]`;
    return result;
  }

  const drop = new Set(visible.items.filter((index) => systemKeyOf(itemText(lines[index]!)) === key));

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

/** The value text of a `show:` line, without a trailing comment or quotes. */
function showValue(line: string): string {
  return unquoteFrontmatterString(
    line
      .slice(line.indexOf(':') + 1)
      .split(/\s#/)[0]!
      .trim()
  );
}

/**
 * Whether the note's Properties section is explicitly hidden: only
 * `properties.show: false`. A missing block or `show`, `show: true` (legacy),
 * or any other value all mean the normal state — the section follows
 * whether there is anything to show.
 */
export function isPropertiesSectionHidden(lines: readonly string[]): boolean {
  const found = findShow(lines);

  return Boolean(found && found.line !== -1 && /^(?:false|False|FALSE)$/.test(showValue(lines[found.line]!)));
}

/**
 * The raw lines with the Properties section explicitly hidden or not.
 *
 * - **Hidden:** `show: false` — an existing `show:` line is rewritten in
 *   place (spelling, indentation and trailing comment kept); with none it is
 *   added as the block's first entry, creating the block if needed. Only
 *   `show` changes: `visible` and everything else stay byte-identical.
 * - **Not hidden:** the `show:` line is removed (`show: true` is never
 *   written), and the block with it when nothing else is left in it.
 *
 * Throws when hiding and `properties` is something other than a mapping this
 * can extend (e.g. a scalar), rather than overwrite it.
 */
export function setPropertiesSectionHidden(lines: readonly string[], hidden: boolean): string[] {
  const found = findShow(lines);

  if (!hidden) {
    if (!found || found.line === -1) {
      return [...lines];
    }

    const without = lines.filter((_, index) => index !== found.line);
    const stillHasContent = findProperties(without)?.continuation.some((line) => !isBlank(line));

    return stillHasContent ? without : removePropertiesBlock(without);
  }

  if (!found) {
    return [...lines, `${PROPERTIES_KEY}:`, `  ${SHOW_KEY}: false`];
  }

  const { block, line } = found;

  if (line !== -1) {
    const result = [...lines];
    result[line] = lines[line]!.replace(/^(\s*show\s*:)\s*[^\s#]*(.*)$/, '$1 false$2');
    return result;
  }

  if (block.inlineValue !== '') {
    throw new Error(`"${PROPERTIES_KEY}" is not a mapping, so "${SHOW_KEY}" can't be added to it.`);
  }

  const first = block.continuation.find((candidate) => !isBlank(candidate));
  const indent = first ? indentOf(first) : '  ';

  return [...lines.slice(0, block.start + 1), `${indent}${SHOW_KEY}: false`, ...lines.slice(block.start + 1)];
}

/**
 * The raw lines with the whole `properties:` block removed — `show`,
 * `visible` and anything else under it — back to the never-configured state
 * (nothing listed, nothing hidden). The block's key line and its content
 * lines go; blank lines after its last content line and every other line
 * stay byte-identical. No block: nothing changes.
 */
export function removePropertiesBlock(lines: readonly string[]): string[] {
  const block = findProperties(lines);

  if (!block) {
    return [...lines];
  }

  return [...lines.slice(0, block.start), ...lines.slice(lastContentLine(block) + 1)];
}

/**
 * The raw lines with the Properties section's listing configuration — its
 * `show` and `visible` entries — removed. Anything else under `properties:`
 * stays byte-identical and keeps the block alive; when nothing else is left
 * the whole `properties:` block goes too (removePropertiesBlock). No block:
 * nothing changes.
 */
export function removePropertiesListing(lines: readonly string[]): string[] {
  const block = findProperties(lines);

  if (!block) {
    return [...lines];
  }

  const drop = new Set<number>();
  const show = findShow(lines);
  const visible = findVisible(lines);

  if (show && show.line !== -1) {
    drop.add(show.line);
  }

  if (visible && visible.line !== -1) {
    drop.add(visible.line);
    visible.items.forEach((index) => drop.add(index));
  }

  return finishBlock(lines, drop);
}

/** `lines` without `drop`, and without the `properties:` block when nothing but those lines was in it. */
function finishBlock(lines: readonly string[], drop: ReadonlySet<number>): string[] {
  const block = findProperties(lines)!;
  const hasOtherConfig = block.continuation.some(
    (line, offset) => !isBlank(line) && !drop.has(block.start + 1 + offset)
  );

  return hasOtherConfig ? lines.filter((_, index) => !drop.has(index)) : removePropertiesBlock(lines);
}

/**
 * The raw lines with the `properties:` block brought to the current model —
 * what every write that touches it ends with, so an older note is migrated
 * the first time it is edited:
 *
 * - a `show` that isn't `false` (the legacy `show: true`) is dropped;
 * - `visible` keeps only the system keys (once each); a legacy custom key is
 *   dropped, and an empty `visible` (`visible: []`) goes entirely;
 * - the block goes when nothing is left in it. Other entries under it are
 *   untouched.
 *
 * Lines without a block, or with a non-mapping `properties`, are returned
 * unchanged.
 */
export function normalizePropertiesConfig(lines: readonly string[]): string[] {
  const block = findProperties(lines);

  if (!block || block.inlineValue !== '') {
    return [...lines];
  }

  const drop = new Set<number>();
  const show = findShow(lines);
  const visible = findVisible(lines);

  if (show && show.line !== -1 && !isPropertiesSectionHidden(lines)) {
    drop.add(show.line);
  }

  const result = [...lines];

  if (visible && visible.line !== -1) {
    const seen = new Set<PageSystemPropertyKey>();
    const isKept = (entry: string): boolean => {
      const key = systemKeyOf(entry);

      if (key === null || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    };

    if (visible.inline !== '') {
      const raw = splitFlowSequence(visible.inline);
      const kept = raw?.filter((entry) => entry !== '' && isKept(unquoteFrontmatterString(entry))) ?? [];

      if (kept.length === 0) {
        drop.add(visible.line);
      } else {
        const visibleLine = lines[visible.line]!;
        result[visible.line] = `${visibleLine.slice(0, visibleLine.indexOf(':'))}: [${kept.join(', ')}]`;
      }
    } else {
      const keptItems = visible.items.filter((index) => isKept(itemText(lines[index]!)));

      if (keptItems.length === 0) {
        drop.add(visible.line);
        visible.items.forEach((index) => drop.add(index));
      } else {
        visible.items.filter((index) => !keptItems.includes(index)).forEach((index) => drop.add(index));
      }
    }
  }

  if (drop.size === 0 && result.every((line, index) => line === lines[index])) {
    return result;
  }

  const rewritten = finishBlock(result, drop);

  return rewritten;
}
