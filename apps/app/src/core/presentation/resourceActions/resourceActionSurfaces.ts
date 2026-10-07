import type { ResourceActionContext, ResourceKind } from './resourceActionTypes';

/**
 * Where resource-action menus appear, and what each surface deliberately leaves out. These are
 * presentation decisions, not second implementations: an omitted action is still one definition
 * and one handler elsewhere (ADR-048). Every omission here states why.
 */
export type ResourceActionSurface = 'sidebar' | 'favorites' | 'topbar' | 'overlay';

export interface ResourceActionSurfaceProfile {
  /** Action ids this surface never shows. */
  readonly omit: readonly string[];
  /** Action ids this surface hides for a particular resource kind or state (an explicit, tested rule). */
  readonly omitWhen?: (kind: ResourceKind, context: ResourceActionContext) => readonly string[];
  /** How an `unavailable` action renders: disabled in place, or left out. */
  readonly unavailable: 'disable' | 'hide';
}

/**
 * An archived resource is never rendered in the sidebar tree, so it has no Restore/Delete there.
 * A Tag or Task has no Trash — its Delete is its removal action, so it keeps it everywhere.
 */
const archivedOnlyActionsExceptTag = (kind: ResourceKind): readonly string[] =>
  kind === 'tag' || kind === 'task' ? [] : ['restore', 'delete'];

export const RESOURCE_ACTION_SURFACES: Readonly<
  Record<ResourceActionSurface, ResourceActionSurfaceProfile>
> = {
  sidebar: {
    // Use as template is a topbar action today; the sidebar row is deliberately narrower.
    omit: ['use-as-template'],
    omitWhen: archivedOnlyActionsExceptTag,
    unavailable: 'hide',
  },
  favorites: {
    // As the sidebar, plus Rename: a Favorites row has no inline title editor.
    omit: ['use-as-template', 'rename'],
    omitWhen: archivedOnlyActionsExceptTag,
    unavailable: 'hide',
  },
  overlay: {
    // The image overlay, PDF embed and PDF viewer: an asset's More actions with no place to rename
    // it in. An archived asset is never opened from here.
    omit: ['rename'],
    omitWhen: archivedOnlyActionsExceptTag,
    // A listed-but-unavailable action stays visible and disabled (Set as cover image on a remote
    // image does nothing yet; a live control must never be a silent no-op).
    unavailable: 'disable',
  },
  topbar: {
    // The title is editable inline and the header already exposes the icon control, so Rename and
    // Change icon are not repeated here. Sort by is a sidebar view preference. A tag's page
    // exposes no Pin today (adding it is a product decision, not an accident of the menu).
    omit: ['rename', 'change-icon', 'sort-by', 'toggle-pin'],
    // Reveal in Finder is a topbar action for an ordinary, active Note only — not a Daily Note,
    // Template, Folder or archived note. (Assets and Tags have no resource-action topbar.) The
    // sidebar rows keep it for every resource.
    omitWhen: (kind, context) =>
      kind === 'note' && !context.isTemplate && context.status !== 'archived' ? [] : ['reveal-in-finder'],
    // ADR-017 item 9: disabled, not omitted.
    unavailable: 'disable',
  },
};
