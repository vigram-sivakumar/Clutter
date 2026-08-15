import type { ReactNode } from 'react';

import type { PageType } from '@core/vault/models/Page';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';

import { ResourceTopBarActions } from './ResourceTopBarActions';
import type { TopBarMenuItemConfig } from './ResourceTopBarActions';
import { ReservedFolderTopBarActions } from './ReservedFolderTopBarActions';

export interface TopBarActionsOptions {
  menu?: readonly TopBarMenuItemConfig[];
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  /** Present only when `menu` includes a `move-to` item — see ResourceTopBarActions' matching props. */
  moveDestinations?: FolderPickerItem[];
  onMove?: (destinationFolderId: string | null) => void;
  /** Present alongside moveDestinations — see ResourceTopBarActions' matching prop. */
  onCreateFolder?: (name: string) => Promise<string>;
  /** Forwarded straight to ResourceTopBarActions — see its matching prop. */
  isFavorite?: boolean;
  /** Forwarded straight to ResourceTopBarActions — see its matching prop. */
  onToggleFavorite?: () => void;
  /** Forwarded straight to ResourceTopBarActions — see its matching prop. */
  onSetCoverImage?: (url: string) => void;
  /** Forwarded straight to ResourceTopBarActions — see its matching prop. */
  onSetCoverImageFromUpload?: (sourcePath: string) => void;
  /** Forwarded straight to ResourceTopBarActions — see its matching prop. */
  onRemoveCoverImage?: () => void;
  /** Forwarded straight to ResourceTopBarActions — see its matching prop. */
  hasCoverImage?: boolean;
  /**
   * ADR-026: set only for a folder with descendants — gates 'archive'
   * behind ResourceTopBarActions' Confirmation surface instead of firing
   * onArchive immediately (mirrors 'delete's confirmation-gated dispatch
   * below). Absent for every other resource type/empty-folder case, where
   * 'archive' fires directly, unchanged.
   */
  archiveConfirmationMessage?: string;
  /**
   * Same shape as archiveConfirmationMessage, for 'delete' — set only for
   * a non-empty folder (ADR-024's resolved product decision #1). Never
   * set for notes: Page.delete() is deliberately confirmation-free per
   * that same decision.
   */
  deleteConfirmationMessage?: string;
}

type TopBarActionsRenderer = (options?: TopBarActionsOptions) => ReactNode;

type TopBarResourceType = PageType | 'folder' | 'reserved-folder';

// Note and daily-note both resolve their status-aware menu upstream, in
// buildTopBarActions.tsx (the one place that already narrows the resource
// to a Page and knows its type) — this renderer only ever forwards
// whatever menu/handlers it's given, identically for both resource types.
const renderPageActions: TopBarActionsRenderer = (options) => (
  <ResourceTopBarActions
    menu={options?.menu ?? []}
    handlers={{
      archive: options?.onArchive,
      restore: options?.onRestore,
      delete: options?.onDelete,
      duplicate: options?.onDuplicate,
      'toggle-favorite': options?.onToggleFavorite,
    }}
    moveDestinations={options?.moveDestinations}
    onMove={options?.onMove}
    onCreateFolder={options?.onCreateFolder}
    isFavorite={options?.isFavorite}
    onToggleFavorite={options?.onToggleFavorite}
    onSetCoverImage={options?.onSetCoverImage}
    onSetCoverImageFromUpload={options?.onSetCoverImageFromUpload}
    onRemoveCoverImage={options?.onRemoveCoverImage}
    hasCoverImage={options?.hasCoverImage}
  />
);

// ADR-024: folder gains a real handler map (delete) — previously ignored
// `options` entirely since there was nothing to wire yet. Rename isn't a
// menu item; it reuses the same inline title-edit mechanism pages already
// have (Page's titleEditable/onTitleCommit), wired in PageHost.tsx. No
// 'duplicate' handler: folders are never duplicable — Duplicate is a
// Note-only capability (renderPageActions below). ADR-026 adds
// archive/restore — the menu is forwarded from options (computed upstream
// in buildTopBarActions.tsx via buildFolderTopBarMenu, mirroring how
// renderPageActions already forwards its own status-aware menu) instead
// of a single hardcoded constant, since the menu's archive/restore item is
// status-dependent.
const renderFolderActions: TopBarActionsRenderer = (options) => (
  <ResourceTopBarActions
    menu={options?.menu ?? []}
    handlers={{
      archive: options?.onArchive,
      restore: options?.onRestore,
      delete: options?.onDelete,
      'toggle-favorite': options?.onToggleFavorite,
    }}
    archiveConfirmationMessage={options?.archiveConfirmationMessage}
    deleteConfirmationMessage={options?.deleteConfirmationMessage}
    moveDestinations={options?.moveDestinations}
    onMove={options?.onMove}
    onCreateFolder={options?.onCreateFolder}
    isFavorite={options?.isFavorite}
    onToggleFavorite={options?.onToggleFavorite}
    onSetCoverImage={options?.onSetCoverImage}
    onSetCoverImageFromUpload={options?.onSetCoverImageFromUpload}
    onRemoveCoverImage={options?.onRemoveCoverImage}
    hasCoverImage={options?.hasCoverImage}
  />
);

export const topBarActionsRegistry: Record<
  TopBarResourceType,
  TopBarActionsRenderer
> = {
  folder: renderFolderActions,
  'reserved-folder': () => <ReservedFolderTopBarActions />,
  note: renderPageActions,
  'daily-note': renderPageActions,
};

export function renderTopBarActions(
  resourceType: TopBarResourceType,
  options?: TopBarActionsOptions
): ReactNode {
  return topBarActionsRegistry[resourceType](options);
}
