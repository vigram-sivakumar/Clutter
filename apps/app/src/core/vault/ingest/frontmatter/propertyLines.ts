import { isPageSystemPropertyKey, type PageSystemPropertyKey } from '../../../properties/systemProperties';
import {
  addCustomProperty,
  readCustomProperties,
  removeCustomProperty,
  renameCustomProperty,
  splitEntryBlocks,
  type NewCustomProperty,
} from './customFrontmatter';
import { readVisibleCustomProperties } from './templateMarker';
import {
  SHOW_PROPERTIES_KEY,
  isPropertiesSectionHidden,
  readListedSystemProperties,
  setPropertiesSectionHidden,
} from './propertyVisibility';

/**
 * The Properties model as pure frontmatter operations — one function per
 * user-visible change, each taking the page's preserved frontmatter and
 * returning the new one, or `null` when nothing would change. The page
 * operations (PageOperations) write the result through the one Gate save, and
 * the UI integration tests drive the very same functions, so there is a single
 * implementation of what each change does to the file.
 *
 * The state is `lines` — the preserved raw lines of every key Clutter doesn't
 * own (custom properties, the `properties` configuration), as whole entries —
 * and `order`, the physical order of ALL the file's top-level entries (system
 * keys by canonical name, the rest as written). The order is the Properties
 * list's order and the order the file is written in; nothing else orders it.
 *
 * The model, in short (ADR-058):
 * - a property is declared by its frontmatter key: a system property (`tags`, `aliases`, `created`, `modified`)
 *   is displayed when its key is one of the file's entries (`order`), a custom property when its key exists.
 *   Adding one declares its key; removing one removes its key and value;
 * - `showProperties: false` hides the whole section and nothing else;
 * - reordering moves a property's whole entry (a nested mapping or block list goes with its key line); every other
 *   entry keeps its place. The physical order is the Properties list's order; nothing else stores it;
 */
export interface PropertyFrontmatter {
  /** The preserved raw lines (custom properties and the `properties` block), in file order. */
  readonly lines: readonly string[];
  /** Every top-level entry once, in file order (PageMetadata.frontmatterEntryOrder); absent for a page not read from a file. */
  readonly order?: readonly string[];
  /** System keys whose entry and value this change deletes (PageOperations patches a list's value away). */
  readonly retract?: readonly PageSystemPropertyKey[];
}

/** One displayed property: a system key (canonical) or a custom property (its actual key). */
export type PropertyRef =
  | { readonly kind: 'system'; readonly key: PageSystemPropertyKey }
  | { readonly kind: 'custom'; readonly key: string };

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

const sameOrder = (a: readonly string[] | undefined, b: readonly string[] | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && sameLines(a, b));

const sameState = (a: PropertyFrontmatter, b: PropertyFrontmatter): boolean =>
  sameLines(a.lines, b.lines) && sameOrder(a.order, b.order);

/**
 * What the Properties list shows, top to bottom: the entries in their physical order, keeping the listed system
 * properties and the custom properties, dropping everything else (hidden system properties, `id`, `favorite`,
 * `icon`, `status`, … and the `properties` configuration, which is not a property). A listed system property whose
 * entry doesn't exist yet, or a state with no recorded order (a page not read from a file), shows the listed system
 * properties first and the custom properties after, as before ordering existed. `kind: template` is never a row.
 */
export function readPropertySequence(state: PropertyFrontmatter): PropertyRef[] {
  const customs = readVisibleCustomProperties(state.lines).map((property) => property.key);
  const listed = readListedSystemProperties(state.order);
  const refs: PropertyRef[] = [];
  const seen = new Set<string>();
  const push = (ref: PropertyRef) => {
    const id = `${ref.kind}:${ref.key}`;

    if (!seen.has(id)) {
      seen.add(id);
      refs.push(ref);
    }
  };

  for (const token of state.order ?? []) {
    if (isPageSystemPropertyKey(token)) {
      if (listed.includes(token)) {
        push({ kind: 'system', key: token });
      }
    } else if (customs.includes(token)) {
      push({ kind: 'custom', key: token });
    }
  }

  listed.forEach((key) => push({ kind: 'system', key }));
  customs.forEach((key) => push({ kind: 'custom', key }));

  return refs;
}

/** The displayed keys, as the Properties list's rows carry them (`orderKey`). */
const displayedKeys = (state: PropertyFrontmatter): string[] => readPropertySequence(state).map((ref) => ref.key);

/** Whether `key` is the `showProperties` setting entry (any letter case). */
const isConfigToken = (key: string): boolean => key.trim().toLowerCase() === SHOW_PROPERTIES_KEY.toLowerCase();

/** The preserved entries in the order of `order` (an entry it doesn't name keeps its place after the named ones). */
function linesInOrder(lines: readonly string[], order: readonly string[]): string[] {
  const { preamble, blocks } = splitEntryBlocks(lines);
  const rank = (key: string): number => {
    const at = order.indexOf(key);

    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };

  return [
    ...preamble,
    ...blocks
      .map((block, index) => ({ block, index }))
      .sort((a, b) => rank(a.block.key) - rank(b.block.key) || a.index - b.index)
      .flatMap(({ block }) => block.lines),
  ];
}

/** `order` with `key` added last, unless it is already there (or the state has no order). */
const withToken = (order: readonly string[] | undefined, key: string): readonly string[] | undefined =>
  order === undefined || order.includes(key) ? order : [...order, key];

/** The lines with an explicit hide lifted — and untouched when the section is not hidden (`showProperties: true` stays as written). */
const unhidden = (lines: readonly string[]): string[] =>
  isPropertiesSectionHidden(lines) ? setPropertiesSectionHidden(lines, false) : [...lines];

/** `null` when a change leaves the state as it was. */
function settle(before: PropertyFrontmatter, after: PropertyFrontmatter): PropertyFrontmatter | null {
  return sameState(before, after) && !after.retract ? null : after;
}

/**
 * System property `key` listed, and an explicit hide lifted. Listing declares its key: it joins the entry order
 * (a key the file has is where it is, never duplicated or moved; a new one goes at the end of the entries).
 * Already listed in a shown section changes nothing.
 */
export function addSystemPropertyLines(state: PropertyFrontmatter, key: PageSystemPropertyKey): PropertyFrontmatter | null {
  if (readListedSystemProperties(state.order).includes(key) && !isPropertiesSectionHidden(state.lines)) {
    return null;
  }

  const lines = unhidden(state.lines);

  return settle(state, { lines, order: withToken(state.order, key) });
}

/**
 * System property `key` removed — its key leaves the entry order and PageOperations deletes its value (`retract`);
 * the note's body `#tags` are independent of all of this.
 */
export function removeSystemPropertyLines(state: PropertyFrontmatter, key: PageSystemPropertyKey): PropertyFrontmatter | null {
  if (!readListedSystemProperties(state.order).includes(key)) {
    return null;
  }

  return settle(state, { lines: state.lines, order: state.order?.filter((token) => token !== key), retract: [key] });
}

/** Custom property `name` added after every existing entry (throws as addCustomProperty does), and an explicit hide lifted. */
export function addCustomPropertyLines(
  state: PropertyFrontmatter,
  name: string,
  property: NewCustomProperty
): PropertyFrontmatter | null {
  const lines = unhidden(addCustomProperty(state.lines, name, property));

  return settle(state, { lines, order: withToken(state.order, name.trim()) });
}

/** Custom property `key` deleted — its whole entry (throws when it isn't one). */
export function deleteCustomPropertyLines(state: PropertyFrontmatter, key: string): PropertyFrontmatter | null {
  return settle(state, {
    lines: removeCustomProperty(state.lines, key),
    order: state.order?.filter((token) => token !== key),
  });
}

/** Custom property `key` renamed to `name` (renameCustomProperty's rule); its entry keeps its place. */
export function renameCustomPropertyLines(state: PropertyFrontmatter, key: string, name: string): PropertyFrontmatter {
  return {
    lines: renameCustomProperty(state.lines, key, name),
    order: state.order?.map((token) => (token === key ? name.trim() : token)),
  };
}

/**
 * Every property removed: each custom property deleted (keys and values), each listed system property retracted
 * (key and value), and `showProperties` gone — the note's frontmatter is back to its other entries.
 */
export function deleteAllPropertiesLines(state: PropertyFrontmatter): PropertyFrontmatter | null {
  const customs = readCustomProperties(state.lines).map((property) => property.key);
  const listed = readListedSystemProperties(state.order);
  const withoutCustom = customs.reduce((current, key) => removeCustomProperty(current, key), [...state.lines]);
  const lines = setPropertiesSectionHidden(withoutCustom, false);
  const order = state.order?.filter(
    (token) => !customs.includes(token) && !isConfigToken(token) && !listed.some((key) => key === token)
  );
  const next = { lines, order, ...(listed.length > 0 && { retract: listed }) };

  return sameState(state, next) && !next.retract ? null : next;
}

/** The section hidden (`showProperties: false`, nothing else written) or shown (the entry removed). */
export function setSectionHiddenLines(state: PropertyFrontmatter, hidden: boolean): PropertyFrontmatter | null {
  if (hidden === isPropertiesSectionHidden(state.lines)) {
    return null;
  }

  const lines = setPropertiesSectionHidden(state.lines, hidden);
  const order = hidden
    ? withToken(state.order, SHOW_PROPERTIES_KEY)
    : state.order?.filter((token) => token.trim().toLowerCase() !== SHOW_PROPERTIES_KEY.toLowerCase());

  return settle(state, { lines, order });
}

/** `order` with `key` moved to sit immediately before (or after) `target`. */
function moveToken(order: readonly string[], key: string, target: string, placement: 'before' | 'after'): string[] {
  const without = order.filter((token) => token !== key);
  const at = without.indexOf(target);

  if (at === -1) {
    return [...order];
  }

  without.splice(placement === 'before' ? at : at + 1, 0, key);

  return without;
}

/** The one key whose removal from both sequences leaves them equal — the property that was moved — or undefined. */
function singleMovedKey(current: readonly string[], next: readonly string[]): string | undefined {
  return current.find((key) => {
    const a = current.filter((k) => k !== key);
    const b = next.filter((k) => k !== key);

    return sameLines(a, b);
  });
}

/**
 * The displayed properties reordered to `keys` (system canonical keys and custom names, as readPropertySequence
 * names them): the ones named come first in that order, anything not named keeps its relative place after them, and
 * names that aren't displayed are ignored. The result is a change of PHYSICAL order: the moved property's whole entry
 * — its key line and its nested mapping or list — is placed immediately before the property that now follows it (or
 * after the one that now precedes it, at the end), and every other entry stays where it was, hidden ones
 * (`id`, `status`, a hidden system key, the `properties` block…) included. `movedKey` names the property that moved
 * when the caller knows (otherwise it is found). The same order writes nothing.
 */
export function reorderPropertiesLines(
  state: PropertyFrontmatter,
  keys: readonly string[],
  movedKey?: string
): PropertyFrontmatter | null {
  const current = displayedKeys(state);
  const byLower = new Map(current.map((key) => [key.toLowerCase(), key]));
  const wanted: string[] = [];

  for (const key of keys) {
    const actual = byLower.get(key.trim().toLowerCase());

    if (actual !== undefined && !wanted.includes(actual)) {
      wanted.push(actual);
    }
  }

  const next = [...wanted, ...current.filter((key) => !wanted.includes(key))];

  if (sameLines(next, current)) {
    return null;
  }

  // A state not read from a file has no recorded order: the displayed order is the order.
  let order: readonly string[] = state.order ?? [
    ...current.filter((key) => isPageSystemPropertyKey(key)),
    ...splitEntryBlocks(state.lines).blocks.map((block) => block.key),
  ];
  // The property the user moved, when the caller says (a drag, Move up/down); else the one whose removal leaves both equal.
  const named = movedKey === undefined ? undefined : byLower.get(movedKey.trim().toLowerCase());
  const moved =
    named !== undefined && sameLines(current.filter((key) => key !== named), next.filter((key) => key !== named))
      ? named
      : singleMovedKey(current, next);

  if (moved !== undefined) {
    const at = next.indexOf(moved);

    order =
      at < next.length - 1
        ? moveToken(order, moved, next[at + 1]!, 'before')
        : moveToken(order, moved, next[at - 1]!, 'after');
  } else {
    // Not one move (never produced by dragging): settle the displayed positions one by one.
    const shown = [...current];

    next.forEach((key, index) => {
      if (shown[index] !== key) {
        order = moveToken(order, key, shown[index]!, 'before');
        shown.splice(shown.indexOf(key), 1);
        shown.splice(index, 0, key);
      }
    });
  }

  return settle(state, { lines: linesInOrder(state.lines, order), order });
}

/**
 * The page values behind a change's retracted system keys (ADR-058), as a metadata patch for the same save: tags and
 * aliases are emptied (the serializer then omits them, their keys having left the entry order). Created and Last
 * edited hold no value in the page — their key alone declares them — so removing them needs no patch.
 */
export function systemValuePatch(change: PropertyFrontmatter): { tags?: string[]; aliases?: string[] } {
  const patch: { tags?: string[]; aliases?: string[] } = {};

  for (const key of change.retract ?? []) {
    if (key === 'tags') patch.tags = [];
    if (key === 'aliases') patch.aliases = [];
  }

  return patch;
}
