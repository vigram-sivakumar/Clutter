import type { AddPropertyMenuProps } from './AddPropertyMenu';

/**
 * The page title's Properties control — one item in the header's More
 * actions menu whose role depends on whether the note has any properties
 * yet:
 *
 * - `add`: nothing has been added, so the item is "Add a property" and
 *   opens the Add properties menu (AddPropertyMenu, with these props).
 *   Choosing there adds the property and shows the section.
 * - `toggle`: from then on it is only the section toggle — "Hide
 *   properties" while the section is shown, "Show properties" while it is
 *   hidden — and never touches which properties are listed. Adding more
 *   properties is the "+ Add a property" row inside the section.
 */
export type PropertiesControl =
  | { readonly mode: 'add'; readonly menu: AddPropertyMenuProps }
  | { readonly mode: 'toggle'; readonly shown: boolean; onToggle(): void };
