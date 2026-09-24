import type { SystemIcon } from '@shared/icon';

export interface CollectionEntryModel {
  readonly id: string;
  readonly type: 'folder' | 'note';
  readonly title: string;
  readonly icon: SystemIcon;
  readonly emoji: string | null;
  readonly selected: boolean;
  readonly onClick: () => void;
  /**
   * Table/List-view display fields (collection-view wiring). `created`/
   * `updated` are only ever set for a `note` entry — `Folder` has no
   * equivalent timestamp in `FolderMetadata`, so a folder entry leaves both
   * undefined rather than fabricating a value. A formatted string (via
   * `formatDateDisplay`), not a raw ISO timestamp — display-only, never
   * round-tripped into a write. `subfolderCount`/`noteCount` are the
   * reverse: only ever set for a `folder` entry, consumed by FolderCard's
   * metadata line.
   */
  readonly created?: string;
  readonly updated?: string;
  readonly subfolderCount?: number;
  readonly noteCount?: number;
}
