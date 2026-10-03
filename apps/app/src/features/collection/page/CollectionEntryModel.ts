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
  /**
   * The Archive collection's "Archived" field — `archived` is the display
   * string (`formatRelativeTimestamp`), `archivedAt` the raw ISO instant it
   * sorts by, same split as `created`/`createdAt`. Only ever set for a
   * `note` entry that is actually archived (`PageMetadata.archivedAt`);
   * folder rows render as FolderCards with no date columns, so a folder
   * entry leaves both undefined.
   */
  readonly archived?: string;
  readonly archivedAt?: string;
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
  /**
   * The note's Markdown body (EffectivePage.markdown — body-only, no
   * frontmatter, and the live editing-session text when the note is open)
   * for the Card view's read-only DocumentPreview. Only ever set for a
   * `note` entry. Consumers other than Card mode never read it.
   */
  readonly markdown?: string;
  /**
   * The note's cover reference exactly as persisted (`PageMetadata.cover`:
   * an `Assets/…` path or an external URL) — resolved to a loadable URL by
   * the Card view's injected resolver, never here. `coverHidden` and
   * `coverPositionAbove` mirror the metadata fields of the same name; the
   * Card preview always renders a cover at the top, so only the *above*
   * focal position is ever carried (see DocumentPreview).
   */
  readonly cover?: string;
  readonly coverHidden?: boolean;
  readonly coverPositionAbove?: number;
}
