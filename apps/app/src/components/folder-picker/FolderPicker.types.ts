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
   * currently visible under its own collapsed/expanded state. Never the
   * vault root itself: FolderPicker renders no root row (its caller
   * represents "move to root" separately, outside this list, via the
   * existing `null` destination contract).
   */
  parentId: string | null;
}

export interface FolderPickerProps {
  items: FolderPickerItem[];
  onSelect: (item: FolderPickerItem) => void;
  onCreate?: (name: string) => void;
}
