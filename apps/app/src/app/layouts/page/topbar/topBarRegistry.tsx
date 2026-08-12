import type { ReactNode } from 'react';

import type { PageType } from '@core/vault/models/Page';

import { ResourceTopBarActions } from './ResourceTopBarActions';
import type { TopBarMenuItemConfig } from './ResourceTopBarActions';
import { ReservedFolderTopBarActions } from './ReservedFolderTopBarActions';

export interface TopBarActionsOptions {
  menu?: readonly TopBarMenuItemConfig[];
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
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
    }}
  />
);

// ADR-024: folder gains a real handler map (delete) — previously ignored
// `options` entirely since there was nothing to wire yet. Rename isn't a
// menu item; it reuses the same inline title-edit mechanism pages already
// have (Page's titleEditable/onTitleCommit), wired in PageHost.tsx. No
// 'duplicate' handler: folders are never duplicable — Duplicate is a
// Note-only capability (renderPageActions below). ADR-026 adds archive —
// the menu is forwarded from options (computed upstream in
// buildTopBarActions.tsx via buildFolderTopBarMenu, mirroring how
// renderPageActions already forwards its own status-aware menu) instead
// of a single hardcoded constant, since the menu's 'archive' item is
// status-dependent.
const renderFolderActions: TopBarActionsRenderer = (options) => (
  <ResourceTopBarActions
    menu={options?.menu ?? []}
    handlers={{
      archive: options?.onArchive,
      delete: options?.onDelete,
    }}
    archiveConfirmationMessage={options?.archiveConfirmationMessage}
    deleteConfirmationMessage={options?.deleteConfirmationMessage}
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
