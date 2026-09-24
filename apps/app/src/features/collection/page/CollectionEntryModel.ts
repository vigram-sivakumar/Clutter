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
  /**
   * Raw ISO instants backing `created`/`updated` — sort-only, never
   * rendered. `created`/`updated` are display-formatted
   * (`formatDateDisplay`), which sorts incorrectly as plain strings (e.g.
   * "Today" vs "12 Aug 2026" aren't chronologically comparable); these are
   * the same underlying `EffectivePage.createdAt`/`updatedAt` values the
   * display strings were formatted from, kept alongside for the
   * Configure menu's "Sort by" section to compare correctly. Same
   * note-only, real-data-only rule as `created`/`updated`.
   */
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly subfolderCount?: number;
  readonly noteCount?: number;
  /**
   * A note's own description (EffectivePage.description) — only ever set
   * for a `note` entry, the same real-data-only rule `created`/`updated`
   * follow. Folders have a description too (FolderMetadata.description),
   * but nothing in the collection UI currently displays a folder's
   * description, so it's left unpopulated here rather than threading data
   * no consumer reads yet.
   */
  readonly description?: string;
}
