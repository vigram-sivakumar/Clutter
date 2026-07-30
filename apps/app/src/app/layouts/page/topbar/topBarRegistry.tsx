import type { ReactNode } from 'react';

import type { PageType } from '@core/vault/models/Page';
import { DailyNoteTopBarActions } from '@features/daily-notes/topbar/DailyNoteTopBarActions';
import { FolderTopBarActions } from '@features/folder/topbar/FolderTopBarActions';
import { NoteTopBarActions } from '@features/notes/topbar/NoteTopBarActions';

export interface TopBarActionsOptions {
  onArchive?: () => void;
}

type TopBarActionsRenderer = (options?: TopBarActionsOptions) => ReactNode;

export const topBarActionsRegistry: Record<
  PageType | 'folder',
  TopBarActionsRenderer
> = {
  folder: () => <FolderTopBarActions />,
  note: (options) => <NoteTopBarActions onArchive={options?.onArchive} />,
  'daily-note': (options) => (
    <DailyNoteTopBarActions onArchive={options?.onArchive} />
  ),
};

export function renderTopBarActions(
  resourceType: PageType | 'folder',
  options?: TopBarActionsOptions
): ReactNode {
  return topBarActionsRegistry[resourceType](options);
}
