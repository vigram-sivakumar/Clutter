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
  addVisibleProperty,
  adoptLegacyOrder,
  isPropertiesSectionHidden,
  normalizePropertiesConfig,
  readListedSystemProperties,
  removePropertiesBlock,
  removePropertiesListing,
  removeVisibleProperty,
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
 * The model, in short:
 * - a system property (`tags`, `aliases`, `created`, `modified`) is displayed
 *   when its key is in `properties.visible`; listing or unlisting it never
 *   touches its value or moves its entry. `visible` is a set — it says nothing
 *   about order;
 * - a custom property is displayed because its frontmatter key exists, where
 *   its entry is in the file;
 * - reordering moves a property's whole entry (a nested mapping or block list
 *   goes with its key line); every other entry keeps its place;
 * - a write that changes the configuration or adds/removes an entry also
 *   writes the `properties` block last, as one complete entry (a note is never
 *   rewritten just by being read);
 * - the section is hidden only by an explicit `properties.show: false`;
 * - with nothing to show (no listed system property, no custom property) the
 *   note is back in the never-configured state: no `properties:` block.
 */
export interface PropertyFrontmatter {
  /** The preserved raw lines (custom properties and the `properties` block), in file order. */
  readonly lines: readonly string[];
  /** Every top-level entry once, in file order (PageMetadata.frontmatterEntryOrder); absent for a page not read from a file. */
  readonly order?: readonly string[];
}

/** One displayed property: a system key (canonical) or a custom property (its actual key). */
export type PropertyRef =
  | { readonly kind: 'system'; readonly key: PageSystemPropertyKey }
  | { readonly kind: 'custom'; readonly key: string };

const CONFIG_KEY = 'properties';

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
  const listed = readListedSystemProperties(state.lines);
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

/** Whether `key` is the reserved `properties` configuration entry (any letter case). */
const isConfigToken = (key: string): boolean => key.trim().toLowerCase() === CONFIG_KEY;

/**
 * The `properties` configuration entry moved last — as one complete entry, in both the preserved lines and the
 * entry order. The write convention: the configuration sits at the end of the frontmatter, after the actual
 * property entries. No entry, or already last: nothing moves.
 */
function configBlockLast(state: PropertyFrontmatter): PropertyFrontmatter {
  const { preamble, blocks } = splitEntryBlocks(state.lines);
  const index = blocks.findIndex((block) => isConfigToken(block.key));
  const lines =
    index === -1 || index === blocks.length - 1
      ? state.lines
      : [...preamble, ...blocks.filter((_, i) => i !== index).flatMap((block) => block.lines), ...blocks[index]!.lines];
  const token = state.order?.find(isConfigToken);
  const order =
    token === undefined || state.order![state.order!.length - 1] === token
      ? state.order
      : [...state.order!.filter((entry) => entry !== token), token];

  return { lines, order };
}

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

/**
 * Ends every change to the Properties configuration. A leftover `properties.order` from an earlier build is
 * adopted first (adoptLegacyOrder). When nothing is left to show the listing is reset (removePropertiesListing:
 * no `visible`, no `show`, no `properties:` block unless something else is configured under it); otherwise the
 * block is brought to the current model (normalizePropertiesConfig). The block then goes last. `null` when that
 * leaves the state as it was.
 */
function settle(before: PropertyFrontmatter, after: PropertyFrontmatter): PropertyFrontmatter | null {
  // A change that changed nothing writes nothing — and relocates nothing.
  if (sameState(before, after)) {
    return null;
  }

  const adopted = adoptLegacyOrder(after.lines);
  const hasContent = readListedSystemProperties(adopted).length > 0 || readCustomProperties(adopted).length > 0;
  const lines = hasContent ? normalizePropertiesConfig(adopted) : removePropertiesListing(adopted);
  const settled = configBlockLast({ lines, order: after.order });

  return sameState(before, settled) ? null : settled;
}

/** `order` with `key` added last, unless it is already there (or the state has no order). */
const withToken = (order: readonly string[] | undefined, key: string): readonly string[] | undefined =>
  order === undefined || order.includes(key) ? order : [...order, key];

/**
 * System property `key` listed, and an explicit hide lifted. Its entry is where it already is — never duplicated or
 * moved; a property with no entry yet (`tags` before any tag) gets one at the end of the entries, written as an empty
 * list. Already listed changes nothing but the hide.
 */
export function addSystemPropertyLines(state: PropertyFrontmatter, key: PageSystemPropertyKey): PropertyFrontmatter | null {
  // Already listed in a shown section: nothing to do — and so nothing to adopt or relocate.
  if (readListedSystemProperties(state.lines).includes(key) && !isPropertiesSectionHidden(state.lines)) {
    return null;
  }

  const lines = setPropertiesSectionHidden(addVisibleProperty(adoptLegacyOrder(state.lines), key), false);

  return settle(state, { lines, order: withToken(state.order, key) });
}

/** System property `key` unlisted — its value and its entry are never touched. */
export function removeSystemPropertyLines(state: PropertyFrontmatter, key: PageSystemPropertyKey): PropertyFrontmatter | null {
  if (!readListedSystemProperties(state.lines).includes(key)) {
    return null;
  }

  return settle(state, { lines: removeVisibleProperty(adoptLegacyOrder(state.lines), key), order: state.order });
}

/** Custom property `name` added after every existing entry (throws as addCustomProperty does), and an explicit hide lifted. */
export function addCustomPropertyLines(
  state: PropertyFrontmatter,
  name: string,
  property: NewCustomProperty
): PropertyFrontmatter | null {
  const lines = setPropertiesSectionHidden(addCustomProperty(state.lines, name, property), false);

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

/** Every custom property deleted and the whole `properties:` block removed. */
export function deleteAllPropertiesLines(state: PropertyFrontmatter): PropertyFrontmatter | null {
  const customs = readCustomProperties(state.lines).map((property) => property.key);
  const withoutCustom = customs.reduce((current, key) => removeCustomProperty(current, key), [...state.lines]);
  const reset = removePropertiesBlock(withoutCustom);
  const order = state.order?.filter((token) => !customs.includes(token) && !isConfigToken(token));
  const next = { lines: reset, order };

  return sameState(state, next) ? null : next;
}

/** The section explicitly hidden (`show: false`, nothing else written) or shown (the override removed). */
export function setSectionHiddenLines(state: PropertyFrontmatter, hidden: boolean): PropertyFrontmatter | null {
  const lines = setPropertiesSectionHidden(state.lines, hidden);

  if (sameLines(state.lines, lines)) {
    return null;
  }

  const next = configBlockLast({ lines, order: state.order });

  return sameState(state, next) ? null : next;
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
