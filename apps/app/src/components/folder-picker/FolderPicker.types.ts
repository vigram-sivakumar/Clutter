import type { SystemIcon } from '@shared/icon';

/** One ancestor's own identity, display name, and icon — the breadcrumb-segment shape a search result's path is built from, so each segment can render with the folder it actually represents, not a flattened string. */
export interface FolderPickerAncestor {
  id: string;
  title: string;
  emoji?: string | null;
}

export interface FolderPickerItem {
  id: string;
  title: string;
  emoji?: string | null;
  level: number;
  /** This item's ancestor chain, root-first — each entry carries its own folder's title/emoji, so a search-result breadcrumb can show every segment's own icon instead of only the leaf's. */
  ancestors?: FolderPickerAncestor[];
  /**
   * The item's parent folder id, or `null` for a top-level item — the one
   * piece of tree structure FolderPicker needs to know which rows are
   * currently visible under its own collapsed/expanded state.
   */
  parentId: string | null;
  /** This row's own leading icon, over the picker's `leadingIcon` (a flat list of mixed kinds, e.g. notes and daily notes). */
  icon?: SystemIcon;
  /**
   * A muted, small-text label rendered inline next to `title`, on the same
   * line (same styling tokens as a search result's breadcrumb `path`) —
   * e.g. "Home" beside the root item's own vault/folder name. Unlike
   * `title`, `secondaryLabel` is the one part of the row allowed to shrink
   * under width pressure — `title` never truncates.
   */
  secondaryLabel?: string;
  /**
   * The section this item belongs to. Where it changes from one item to the next, the
   * picker draws a divider (not before the first section) and the section's title —
   * a `MenuGroupTitle`. Items of one section must be adjacent; an item without a
   * section never starts one.
   */
  section?: string;
}

/**
 * The sentinel id a Move destination list (buildMoveDestinationItems.ts)
 * uses to represent the vault root as an ordinary top-level
 * FolderPickerItem (title = the vault's own physical folder name,
 * secondaryLabel = "Home") — FolderPicker itself renders it exactly like
 * any other row, with no special-casing. MoveDestinationPicker is the one
 * place that recognizes this id and translates it back to the `null`
 * destination every Move facade method (PageOperations.move/
 * FolderOperations.move) already accepts.
 */
export const ROOT_DESTINATION_ID = '__vault-root__';

export interface FolderPickerProps {
  items: FolderPickerItem[];
  /** The search box's placeholder. Default: "Search folders". */
  placeholder?: string;
  /**
   * Renders every row as a flat, non-expandable item led by this icon (or the
   * item's own emoji) instead of the folder tree's caret/folder leading — for a
   * list of something other than folders, such as notes.
   */
  leadingIcon?: SystemIcon;
  /**
   * Shows each item's `ancestors` path under its title even when the search box is
   * empty. By default the path appears only while searching — right for a folder tree,
   * where indentation already shows the hierarchy, but a flat list (notes) has no other
   * way to say where an item lives.
   */
  showPath?: boolean;
  onSelect: (item: FolderPickerItem) => void;
  onCreate?: (name: string) => void;
}
