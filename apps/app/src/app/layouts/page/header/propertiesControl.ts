/**
 * The page title's Properties control — one item in the header's More
 * actions menu, offered only in the two states where it is the way back
 * into the Properties section:
 *
 * - `add`: nothing is listed and the section isn't shown, so the item
 *   starts the first property: the section appears and its "+ Add a
 *   property" menu opens in it (`onStart`). Choosing there adds the
 *   property and shows the section; dismissing it leaves nothing behind.
 * - `show`: the section was hidden (from the section's own menu, with
 *   properties still listed): "Show properties" displays it again
 *   (`onShow`), never touching which properties are listed.
 *
 * While the section is displayed the title offers no item at all — Hide
 * properties lives in the section's own menu.
 */
export type PropertiesControl =
  | { readonly mode: 'add'; onStart(): void }
  | { readonly mode: 'show'; onShow(): void };
