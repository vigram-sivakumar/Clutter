import type { ReactNode } from 'react';

import type { PageType } from '@core/vault/models/Page';
import { folderTopBarMenu } from '@features/notes/topbar/folderTopBarMenu.config';

import { ResourceTopBarActions } from './ResourceTopBarActions';
import type { TopBarMenuItemConfig } from './ResourceTopBarActions';
import { ReservedFolderTopBarActions } from './ReservedFolderTopBarActions';

export interface TopBarActionsOptions {
  menu?: readonly TopBarMenuItemConfig[];
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
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
// have (Page's titleEditable/onTitleCommit), wired in PageHost.tsx.
// ADR-028 adds duplicate the same way.
const renderFolderActions: TopBarActionsRenderer = (options) => (
  <ResourceTopBarActions
    menu={folderTopBarMenu}
    handlers={{
      delete: options?.onDelete,
      duplicate: options?.onDuplicate,
    }}
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
