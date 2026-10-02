import type { PageSystemPropertyKey } from '../../../properties/systemProperties';
import {
  addCustomProperty,
  readCustomProperties,
  removeCustomProperty,
  type NewCustomProperty,
} from './customFrontmatter';
import {
  addVisibleProperty,
  normalizePropertiesConfig,
  readListedSystemProperties,
  removePropertiesBlock,
  removePropertiesListing,
  removeVisibleProperty,
  setPropertiesSectionHidden,
} from './propertyVisibility';

/**
 * The Properties model as pure frontmatter operations — one function per
 * user-visible change, each taking the page's preserved raw lines and
 * returning the new lines, or `null` when nothing would change. The page
 * operations (PageOperations) write the result through the one Gate save,
 * and the UI integration tests drive the very same functions, so there is
 * a single implementation of what each change does to the file.
 *
 * The model, in short:
 * - a system property (`tags`, `aliases`, `created`, `modified`) is
 *   displayed when its key is in `properties.visible`; listing or unlisting
 *   it never touches its value;
 * - a custom property is displayed because its frontmatter key exists;
 * - the section is hidden only by an explicit `properties.show: false`;
 * - with nothing to show (no listed system property, no custom property) the
 *   note is back in the never-configured state: no `properties:` block.
 */

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

/**
 * Ends every change to the Properties configuration. When nothing is left
 * to show the listing is reset (removePropertiesListing: no `visible`, no
 * `show`, no `properties:` block unless something else is configured under
 * it); otherwise the block is brought to the current model
 * (normalizePropertiesConfig), which also migrates an older note's block.
 * `null` when that leaves the lines as they were.
 */
function settle(before: readonly string[], after: readonly string[]): string[] | null {
  const hasContent = readListedSystemProperties(after).length > 0 || readCustomProperties(after).length > 0;
  const settled = hasContent ? normalizePropertiesConfig(after) : removePropertiesListing(after);

  return sameLines(before, settled) ? null : settled;
}

/** System property `key` listed, and an explicit hide lifted so the section appears. */
export function addSystemPropertyLines(lines: readonly string[], key: PageSystemPropertyKey): string[] | null {
  return settle(lines, setPropertiesSectionHidden(addVisibleProperty(lines, key), false));
}

/** System property `key` unlisted — its value is never touched. */
export function removeSystemPropertyLines(lines: readonly string[], key: PageSystemPropertyKey): string[] | null {
  return settle(lines, removeVisibleProperty(lines, key));
}

/** Custom property `name` added (throws as addCustomProperty does), and an explicit hide lifted. */
export function addCustomPropertyLines(
  lines: readonly string[],
  name: string,
  property: NewCustomProperty
): string[] | null {
  return settle(lines, setPropertiesSectionHidden(addCustomProperty(lines, name, property), false));
}

/** Custom property `key` deleted from the frontmatter (throws when it isn't one). */
export function deleteCustomPropertyLines(lines: readonly string[], key: string): string[] | null {
  return settle(lines, removeCustomProperty(lines, key));
}

/** Every custom property deleted and the whole `properties:` block removed. */
export function deleteAllPropertiesLines(lines: readonly string[]): string[] | null {
  const withoutCustom = readCustomProperties(lines).reduce(
    (current, property) => removeCustomProperty(current, property.key),
    [...lines]
  );
  const reset = removePropertiesBlock(withoutCustom);

  return sameLines(lines, reset) ? null : reset;
}

/** The section explicitly hidden (`show: false`, nothing else written) or shown (the override removed). */
export function setSectionHiddenLines(lines: readonly string[], hidden: boolean): string[] | null {
  const next = setPropertiesSectionHidden(lines, hidden);

  return sameLines(lines, next) ? null : next;
}
