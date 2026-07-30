import type { ReactNode } from 'react';

import type { PageType } from '@core/vault/models/Page';
import { DailyNoteTopBarActions } from '@features/daily-notes/topbar/DailyNoteTopBarActions';
import { FolderTopBarActions } from '@features/notes/topbar/FolderTopBarActions';
import { NoteTopBarActions } from '@features/notes/topbar/NoteTopBarActions';

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
  folder: () => <FolderTopBarActions />,
  'reserved-folder': () => <ReservedFolderTopBarActions />,
  note: (options) => <NoteTopBarActions onArchive={options?.onArchive} />,
  'daily-note': (options) => (
    <DailyNoteTopBarActions onArchive={options?.onArchive} />
  ),
};

export function renderTopBarActions(
  resourceType: TopBarResourceType,
  options?: TopBarActionsOptions
): ReactNode {
  return topBarActionsRegistry[resourceType](options);
}
