import type { ReactNode } from 'react';

import type { PageType } from '@core/vault/models/Page';
import { dailyNoteTopBarMenu } from '@features/daily-notes/topbar/dailyNoteTopBarMenu.config';
import { folderTopBarMenu } from '@features/notes/topbar/folderTopBarMenu.config';
import { noteTopBarMenu } from '@features/notes/topbar/noteTopBarMenu.config';

import { ResourceTopBarActions } from './ResourceTopBarActions';
import { ReservedFolderTopBarActions } from './ReservedFolderTopBarActions';

export interface TopBarActionsOptions {
  onArchive?: () => void;
}

type TopBarActionsRenderer = (options?: TopBarActionsOptions) => ReactNode;

type TopBarResourceType = PageType | 'folder' | 'reserved-folder';

export const topBarActionsRegistry: Record<
  TopBarResourceType,
  TopBarActionsRenderer
> = {
  folder: () => <ResourceTopBarActions menu={folderTopBarMenu} />,
  'reserved-folder': () => <ReservedFolderTopBarActions />,
  note: (options) => (
    <ResourceTopBarActions
      menu={noteTopBarMenu}
      handlers={{ archive: options?.onArchive }}
    />
  ),
  'daily-note': (options) => (
    <ResourceTopBarActions
      menu={dailyNoteTopBarMenu}
      handlers={{ archive: options?.onArchive }}
    />
  ),
};

export function renderTopBarActions(
  resourceType: TopBarResourceType,
  options?: TopBarActionsOptions
): ReactNode {
  return topBarActionsRegistry[resourceType](options);
}
