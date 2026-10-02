import {
  readPropertiesSectionVisibility,
  readVisibleProperties,
} from '@core/vault/ingest/frontmatter/propertyVisibility';

/** What the title's Properties control currently is — see PropertiesControl. */
export type PropertiesControlMode = 'add' | 'hide' | 'show';

export interface PropertiesSectionState {
  /** Whether the Properties section is on screen. */
  readonly isDisplayed: boolean;
  /** Whether the section ends with its "+ Add a property" row. */
  readonly showsAddRow: boolean;
  /**
   * The title control: `add` ("Add a property" — before the first property
   * exists), `hide` ("Hide properties" — the section is displayed), `show`
   * ("Show properties" — it is hidden), or null for an archived page, which
   * is view-only.
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
 * property exists  title: Hide properties       section + "+ Add a property"
 *   ↓ hide             — only `show` changes; `visible` is untouched
 * hidden           title: Show properties
 *   ↓ show
 * property exists  title: Hide properties       …as before
 * ```
 *
 * While the first property's draft is being named the section is displayed
 * (the draft row lives in it) without anything written, but without its
 * "+ Add a property" row: the title's "Add a property" is still the way in.
 * An archived page is view-only: it displays what its file says and offers
 * no control and no add row.
 */
export function derivePropertiesSectionState({
  lines,
  isArchived,
  hasDraft,
}: {
  lines: readonly string[];
  isArchived: boolean;
  hasDraft: boolean;
}): PropertiesSectionState {
  const isFlagged = readPropertiesSectionVisibility(lines);
  const hasListedProperty = readVisibleProperties(lines).length > 0;

  if (isArchived) {
    return { isDisplayed: isFlagged, showsAddRow: false, control: null };
  }

  const isDisplayed = isFlagged || hasDraft;

  return {
    isDisplayed,
    // Once the section holds, or may hold, a property.
    showsAddRow: isDisplayed && (isFlagged || hasListedProperty),
    control: isDisplayed ? 'hide' : hasListedProperty ? 'show' : 'add',
  };
}
