/**
 * Where resource-action menus appear, and what each surface deliberately leaves out. These are
 * presentation decisions, not second implementations: an omitted action is still one definition
 * and one handler elsewhere (ADR-048). Every omission here states why.
 */
export type ResourceActionSurface = 'sidebar' | 'favorites' | 'topbar';

export interface ResourceActionSurfaceProfile {
  /** Action ids this surface never shows. */
  readonly omit: readonly string[];
  /** How an `unavailable` action renders: disabled in place, or left out. */
  readonly unavailable: 'disable' | 'hide';
}

/** An archived resource is never rendered in the sidebar tree, so it has no Restore/Delete there. */
const ARCHIVED_ONLY_ACTIONS = ['restore', 'delete'] as const;

export const RESOURCE_ACTION_SURFACES: Readonly<
  Record<ResourceActionSurface, ResourceActionSurfaceProfile>
> = {
  sidebar: {
    // Use as template is a topbar action today; the sidebar row is deliberately narrower.
    omit: [...ARCHIVED_ONLY_ACTIONS, 'use-as-template'],
    unavailable: 'hide',
  },
  favorites: {
    // As the sidebar, plus Rename: a Favorites row has no inline title editor.
    omit: [...ARCHIVED_ONLY_ACTIONS, 'use-as-template', 'rename'],
    unavailable: 'hide',
  },
  topbar: {
    // The title is editable inline and the header already exposes the icon control, so Rename and
    // Change icon are not repeated here. Sort by is a sidebar view preference.
    omit: ['rename', 'change-icon', 'sort-by'],
    // ADR-017 item 9: disabled, not omitted.
    unavailable: 'disable',
  },
};
