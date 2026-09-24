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
   * Table/Cards-view display fields (Phase 1 collection-view wiring).
   * `created`/`updated` are only ever set for a `note` entry — `Folder` has
   * no equivalent timestamp in `FolderMetadata`, so a folder entry leaves
   * both undefined rather than fabricating a value. `subfolderCount`/
   * `noteCount` are the reverse: only ever set for a `folder` entry.
   * Formatted strings (via `formatDateDisplay`), not raw ISO timestamps —
   * these are display-only, never round-tripped back into a write.
   */
  readonly created?: string;
  readonly updated?: string;
  readonly subfolderCount?: number;
  readonly noteCount?: number;
}
