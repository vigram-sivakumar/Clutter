import { readCustomProperties } from '@core/vault/ingest/frontmatter/customFrontmatter';
import {
  isPropertiesSectionHidden,
  readListedSystemProperties,
} from '@core/vault/ingest/frontmatter/propertyVisibility';

/** What the title's Properties control currently is — see PropertiesControl. */
export type PropertiesControlMode = 'add' | 'show';

export interface PropertiesSectionState {
  /** Whether the Properties section is on screen. */
  readonly isDisplayed: boolean;
  /** Whether the section ends with its "+ Add a property" button. */
  readonly showsAddRow: boolean;
  /**
   * Whether the note has anything to show: a listed system property or a
   * custom property. The section's own Hide properties and Delete all
   * actions are offered only then.
   */
  readonly hasProperties: boolean;
  /**
   * The title control — the one derivation every consumer reads: `add` (the
   * item that starts the first property — nothing to show and the section
   * isn't on screen), `show` ("Show properties" — the section was
   * explicitly hidden while properties still exist), or null: nothing at
   * all — while the section is displayed (Hide properties belongs to the
   * section itself, not the title) and for an archived page, which is
   * view-only.
   */
  readonly control: PropertiesControlMode | null;
}

/**
 * The Properties section's state, from what is in the note's frontmatter
 * and the two pieces of transient UI state:
 *
 * - *what there is to show* — a listed system property (`properties.visible`,
 *   system keys only) or a custom property (its key exists). There is no
 *   hidden state of an individual property;
 * - `properties.show: false` — the one explicit section-level override
 *   (a missing `show` is the normal state);
 * - `hasDraft` — a new property is being named (never persisted);
 * - `isStarting` — the title's "Add a property" was chosen and the picker is
 *   open on the empty property row (never persisted).
 *
 * ```text
 * nothing to show           title: Add a property        (no section, no add button)
 *   ↓ add a property          — the section appears with it
 * something to show         title: (no item)             section + "+ Add a property"
 *   ↓ Hide properties         — in the section's menu; only `show: false` is written
 * hidden                    title: Show properties
 *   ↓ Show properties         — the override is removed
 * something to show         …as before
 *
 * last property removed / Delete all
 *   → back to "nothing to show": no section, and the title is Add a property
 * ```
 *
 * While the first property's draft is being named the section is displayed
 * (the draft row lives in it) without anything written and without its add
 * button. An archived page is view-only: it displays what its file says and
 * offers no control and no add button.
 */
export function derivePropertiesSectionState({
  lines,
  isArchived,
  hasDraft,
  isStarting = false,
}: {
  lines: readonly string[];
  isArchived: boolean;
  hasDraft: boolean;
  /** The title's "Add a property" was chosen and the picker is open on the empty row (never persisted). */
  isStarting?: boolean;
}): PropertiesSectionState {
  const hasProperties = readListedSystemProperties(lines).length > 0 || readCustomProperties(lines).length > 0;
  const showsProperties = hasProperties && !isPropertiesSectionHidden(lines);

  if (isArchived) {
    return { isDisplayed: showsProperties, showsAddRow: false, hasProperties, control: null };
  }

  const isDisplayed = showsProperties || hasDraft || isStarting;

  return {
    isDisplayed,
    showsAddRow: isDisplayed && (hasProperties || isStarting),
    hasProperties,
    control: isDisplayed ? null : hasProperties ? 'show' : 'add',
  };
}
