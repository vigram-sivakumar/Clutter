/**
 * The page title's Properties control — one item in the header's More
 * actions menu whose role depends on whether the note has any properties
 * yet:
 *
 * - `add`: nothing has been added, so the item starts the first property:
 *   the section appears and its "+ Add a property" menu opens in it
 *   (`onStart`). Choosing there adds the property and shows the section;
 *   dismissing it leaves nothing behind.
 * - `toggle`: from then on it is only the section toggle — "Hide
 *   properties" while the section is shown, "Show properties" while it is
 *   hidden — and never touches which properties are listed. Adding more
 *   properties is the "+ Add a property" row inside the section.
 */
export type PropertiesControl =
  | { readonly mode: 'add'; onStart(): void }
  | { readonly mode: 'toggle'; readonly shown: boolean; onToggle(): void };
