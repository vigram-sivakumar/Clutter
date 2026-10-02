import {
  readPropertiesSectionVisibility,
  readVisibleProperties,
} from '@core/vault/ingest/frontmatter/propertyVisibility';

/** What the title's Properties control currently is — see PropertiesControl. */
export type PropertiesControlMode = 'add' | 'show';

export interface PropertiesSectionState {
  /** Whether the Properties section is on screen. */
  readonly isDisplayed: boolean;
  /** Whether the section ends with its "+ Add a property" row. */
  readonly showsAddRow: boolean;
  /**
   * The title control: `add` (the item that starts the first property —
   * nothing is listed and the section isn't shown), `show` ("Show
   * properties" — the section was hidden with properties still listed), or
   * null: nothing at all — while the section is displayed (Hide properties
   * belongs to the section itself, not the title) and for an archived page,
   * which is view-only.
   */
  readonly control: PropertiesControlMode | null;
}

/**
 * The Properties section's lifecycle, from the two independent per-note
 * settings and the one piece of transient UI state:
 *
 * - `properties.show` — whether the section is displayed at all;
 * - `properties.visible` — which properties it lists (only its length
 *   matters here: whether any property has been added);
 * - `hasDraft` — a new property is being named (never persisted).
 *
 * ```text
 * nothing added     title: Add a property        (no section)
 *   ↓ choose one       — shows the section and the property
 * property exists  title: (no Show/Hide item)   section + "+ Add a property"
 *   ↓ Hide properties   — in the section's own menu; only `show` changes,
 *                         `visible` is untouched
 * hidden           title: Show properties
 *   ↓ show
 * property exists  title: (no Show/Hide item)   …as before
 *
 * last property removed / Delete all
 *   → the listing is reset: no section, and the title is Add a property again
 * ```
 *
 * While the first property's draft is being named the section is displayed
 * (the draft row lives in it) without anything written, but without its
 * "+ Add a property" row: the title's "Add a property" item is not offered while the section is
 * displayed, so the section's own add row is the way in.
 * An archived page is view-only: it displays what its file says and offers
 * no control and no add row.
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
  /** The title's "Properties" was just chosen and its type menu is open (never persisted). */
  isStarting?: boolean;
}): PropertiesSectionState {
  const isFlagged = readPropertiesSectionVisibility(lines);
  const hasListedProperty = readVisibleProperties(lines).length > 0;

  if (isArchived) {
    return { isDisplayed: isFlagged, showsAddRow: false, control: null };
  }

  const isDisplayed = isFlagged || hasDraft || isStarting;

  return {
    isDisplayed,
    // Once the section holds, or may hold, a property.
    showsAddRow: isDisplayed && (isFlagged || hasListedProperty || isStarting),
    control: isDisplayed ? null : hasListedProperty ? 'show' : 'add',
  };
}
