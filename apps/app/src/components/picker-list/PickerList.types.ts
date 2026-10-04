import type { SystemIcon } from '@shared/icon';

/** One ancestor's own identity, display name, and icon — the breadcrumb-segment shape a search result's path is built from, so each segment can render with the folder it actually represents, not a flattened string. */
export interface PickerListAncestor {
  id: string;
  title: string;
  emoji?: string | null;
}

export interface PickerListItem {
  id: string;
  title: string;
  emoji?: string | null;
  level: number;
  /** This item's ancestor chain, root-first — each entry carries its own folder's title/emoji, so a search-result breadcrumb can show every segment's own icon instead of only the leaf's. */
  ancestors?: PickerListAncestor[];
  /**
   * The item's parent folder id, or `null` for a top-level item — the one
   * piece of tree structure PickerList needs to know which rows are
   * currently visible under its own collapsed/expanded state.
   */
  parentId: string | null;
  /** This row's own leading icon, over the picker's `leadingIcon` (a flat list of mixed kinds, e.g. notes and daily notes). */
  icon?: SystemIcon;
  /**
   * An asset's own image (a URL). When set, the row's leading shows this image instead of an
   * icon or emoji, filling the row's height (square, cropped to cover) — for an asset entry.
   */
  thumbnail?: string;
  /**
   * A muted, small-text label in the row's trailing slot, right-aligned (same styling tokens
   * as a search result's breadcrumb `path`) — e.g. "Home" on the root item, which is named
   * after the vault/folder itself. The trailing slot never shrinks, so `title` is what
   * ellipsizes under width pressure.
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
 * PickerListItem (title = the vault's own physical folder name,
 * secondaryLabel = "Home") — PickerList itself renders it exactly like
 * any other row, with no special-casing. MoveDestinationPicker is the one
 * place that recognizes this id and translates it back to the `null`
 * destination every Move facade method (PageOperations.move/
 * FolderOperations.move) already accepts.
 */
export const ROOT_DESTINATION_ID = '__vault-root__';

export interface PickerListProps {
  items: PickerListItem[];
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
  /**
   * Caps how many items each section shows. A section with more gets a "Show more" row after
   * its last visible item that expands just that section, and becomes "Show less". Items without
   * a `section` are never capped. Default: no cap.
   */
  sectionLimit?: number;
  /**
   * Draws each section's title (default). Turn off for a list that is one section only to give
   * its rows a Show more cap, with no heading above them. Dividers between sections are unaffected.
   */
  showSectionTitles?: boolean;
  onSelect: (item: PickerListItem) => void;
  onCreate?: (name: string) => void;
}
