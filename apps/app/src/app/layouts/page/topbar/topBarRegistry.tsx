import type { ReactNode } from 'react';

import type { PageType } from '@core/vault/models/Page';
import type { PickerListItem } from '@components/picker-list/PickerList.types';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

import { ResourceTopBarActions } from './ResourceTopBarActions';
import type { ResourceTopBarActionsProps, TopBarMenuItemConfig } from './ResourceTopBarActions';

export interface TopBarActionsOptions {
  menu?: readonly TopBarMenuItemConfig[];
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  /** The Archive page's 'Delete all' — present only for the Archive (see renderReservedFolderActions). */
  onDeleteAll?: () => void;
  deleteAllConfirmation?: ResourceTopBarActionsProps['deleteAllConfirmation'];
  onDuplicate?: () => void;
  /** Opens the Save as template dialog for the page — a copy as a new Template. */
  onCreateTemplate?: () => void;
  /** Present only when `menu` includes a `move-to` item — see ResourceTopBarActions' matching props. */
  moveDestinations?: PickerListItem[];
  onMove?: (destinationFolderId: string | null) => void;
  /** Present alongside moveDestinations — see ResourceTopBarActions' matching prop. */
  onCreateFolder?: (name: string) => Promise<string>;
  /** Forwarded straight to ResourceTopBarActions — see its matching prop. */
  isFavorite?: boolean;
  /** Forwarded straight to ResourceTopBarActions — see its matching prop. */
  onToggleFavorite?: () => void;
  /**
   * ADR-026: set only for a folder with descendants — gates 'archive'
   * behind ResourceTopBarActions' Confirmation surface instead of firing
   * onArchive immediately (mirrors 'delete's confirmation-gated dispatch
   * below). Absent for every other resource type/empty-folder case, where
   * 'archive' fires directly, unchanged.
   */
  archiveConfirmationMessage?: string;
  /**
   * Same shape as archiveConfirmationMessage, for 'delete'. Unlike
   * archiveConfirmationMessage, this now applies to every resource type —
   * the deletion-UX product decision (superseding ADR-024's resolved
   * product decision #1) requires confirmation for every delete, since
   * Delete is only ever reachable at all for a resource that is archived
   * or a descendant of the reserved Archive folder (buildTopBarActions.tsx's
   * isDeletable).
   */
  deleteConfirmationMessage?: string;
  /** Location-actions pipeline — forwarded straight to ResourceTopBarActions' handlers map, see the renderers below. */
  onRevealInFinder?: () => void;
  /** Same pipeline as onRevealInFinder — a single callback, fanned out to the three `copy-path-*` handler ids below. */
  onCopyPath?: (format: LocationPathFormat) => void;
  /** A page's Hide/Show references (ADR-052). */
  onToggleReferences?: () => void;
}

type TopBarActionsRenderer = (options?: TopBarActionsOptions) => ReactNode;

type TopBarResourceType = PageType | 'folder' | 'reserved-folder';

/**
 * What a resource's More actions menu is made of — the menu, the id-keyed handler map and the
 * confirmation/Move inputs — as `ResourceTopBarActions` props. The one place that binds a resource
 * type's options to its handlers: the topbar renders it, and the Collection View's right-click menu
 * (`buildResourceContextMenu`) reuses it, so an action can never be wired for one and not the other.
 * `null` when there is no menu to show.
 */
type TopBarPropsBuilder = (options?: TopBarActionsOptions) => ResourceTopBarActionsProps | null;

// Note and daily-note both resolve their status-aware menu upstream, in
// buildTopBarActions.tsx (the one place that already narrows the resource
// to a Page and knows its type) — this builder only ever forwards
// whatever menu/handlers it's given, identically for both resource types.
// deleteConfirmationMessage is forwarded (unlike archiveConfirmationMessage,
// which stays folder-only) — the deletion-UX product decision requires
// confirmation for a page delete too, now that Delete is only ever
// reachable for an archived/Archive-descendant page.
const pageActionProps: TopBarPropsBuilder = (options) => ({
  menu: options?.menu ?? [],
  handlers: {
    archive: options?.onArchive,
    restore: options?.onRestore,
    delete: options?.onDelete,
    duplicate: options?.onDuplicate,
    'create-template': options?.onCreateTemplate,
    'toggle-favorite': options?.onToggleFavorite,
    'toggle-references': options?.onToggleReferences,
    'reveal-in-finder': options?.onRevealInFinder,
    'copy-path-at-vault': () => options?.onCopyPath?.('at-vault'),
    'copy-path-full-path': () => options?.onCopyPath?.('full-path'),
    'copy-path-as-markdown': () => options?.onCopyPath?.('as-markdown'),
  },
  deleteConfirmationMessage: options?.deleteConfirmationMessage,
  moveDestinations: options?.moveDestinations,
  onMove: options?.onMove,
  onCreateFolder: options?.onCreateFolder,
  isFavorite: options?.isFavorite,
  onToggleFavorite: options?.onToggleFavorite,
});

// ADR-024: folder gains a real handler map (delete) — previously ignored
// `options` entirely since there was nothing to wire yet. Rename isn't a
// menu item; it reuses the same inline title-edit mechanism pages already
// have (Page's titleEditable/onTitleCommit), wired in PageHost.tsx. No
// 'duplicate' handler: folders are never duplicable — Duplicate is a
// Note-only capability (pageActionProps above). ADR-026 adds
// archive/restore — the menu is forwarded from options (computed upstream
// in buildTopBarActions.tsx via buildFolderTopBarMenu, mirroring how
// pageActionProps already forwards its own status-aware menu) instead
// of a single hardcoded constant, since the menu's archive/restore item is
// status-dependent.
const folderActionProps: TopBarPropsBuilder = (options) => ({
  menu: options?.menu ?? [],
  handlers: {
    archive: options?.onArchive,
    restore: options?.onRestore,
    delete: options?.onDelete,
    'toggle-favorite': options?.onToggleFavorite,
    'reveal-in-finder': options?.onRevealInFinder,
    'copy-path-at-vault': () => options?.onCopyPath?.('at-vault'),
    'copy-path-full-path': () => options?.onCopyPath?.('full-path'),
    // No 'copy-path-as-markdown' — the folder canonical actions never
    // offers the item (no folder-linking syntax exists), so this id
    // never reaches handleMenuSelect for a folder.
  },
  archiveConfirmationMessage: options?.archiveConfirmationMessage,
  deleteConfirmationMessage: options?.deleteConfirmationMessage,
  moveDestinations: options?.moveDestinations,
  onMove: options?.onMove,
  onCreateFolder: options?.onCreateFolder,
  isFavorite: options?.isFavorite,
  onToggleFavorite: options?.onToggleFavorite,
});

// A reserved folder (Inbox, Assets, Archive, Templates, Daily Notes root,
// etc.) currently has no meaningful topbar actions at all, so it renders no
// trigger rather than an overflow button that opens onto nothing. This stays
// its own registry entry (rather than collapsing into 'folder' or omitting
// the key) precisely so a future system-folder action can be introduced by
// giving this entry a real builder, without touching the dispatch in
// buildTopBarActions.tsx or the registry's shape.
//
// The Archive is the first to get one: it passes a menu (just 'Delete all') and its handler; every
// other reserved folder passes none and still renders nothing.
const reservedFolderActionProps: TopBarPropsBuilder = (options) =>
  options?.menu && options.menu.length > 0
    ? {
        menu: options.menu,
        handlers: { 'delete-all': options.onDeleteAll },
        deleteAllConfirmation: options.deleteAllConfirmation,
      }
    : null;

const topBarPropsRegistry: Record<TopBarResourceType, TopBarPropsBuilder> = {
  folder: folderActionProps,
  'reserved-folder': reservedFolderActionProps,
  note: pageActionProps,
  'daily-note': pageActionProps,
};

export function topBarActionProps(
  resourceType: TopBarResourceType,
  options?: TopBarActionsOptions
): ResourceTopBarActionsProps | null {
  return topBarPropsRegistry[resourceType](options);
}

export const topBarActionsRegistry: Record<
  TopBarResourceType,
  TopBarActionsRenderer
> = Object.fromEntries(
  (Object.keys(topBarPropsRegistry) as TopBarResourceType[]).map((type) => [
    type,
    (options?: TopBarActionsOptions) => {
      const props = topBarPropsRegistry[type](options);
      return props ? <ResourceTopBarActions {...props} /> : null;
    },
  ])
) as Record<TopBarResourceType, TopBarActionsRenderer>;

export function renderTopBarActions(
  resourceType: TopBarResourceType,
  options?: TopBarActionsOptions
): ReactNode {
  return topBarActionsRegistry[resourceType](options);
}
