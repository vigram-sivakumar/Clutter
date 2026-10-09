import { AppIcon } from '@shared/icon';
import type { CollectionEntryProps } from '@features/collection/components/entry/CollectionEntry';
import type { CollectionGridColumns } from '@features/collection/components/grid/CollectionGrid';
import type { CollectionEntryModel } from '../../page/CollectionEntryModel';

/**
 * The folders grid: tiles between 200px and 1/5 of the row wide, every row one
 * tile tall — the entry's 6px block padding around its title line and counts line.
 */
export const FOLDER_GRID: { readonly columns: CollectionGridColumns; readonly rowHeight: number } = {
  columns: { min: 200, max: 5 },
  rowHeight: 56,
};

/**
 * A folder as a `CollectionEntry` cell: its icon or emoji, its name, and its subfolder / note counts (when it
 * has them) as the description. The folder-specific part is this mapping; drawing it is `CollectionEntry`'s job.
 */
export function toFolderEntryProps(entry: CollectionEntryModel): CollectionEntryProps {
  // A folder entry that carries no counts (e.g. a Daily Notes year) shows just its name.
  const hasCounts = entry.subfolderCount !== undefined || entry.noteCount !== undefined;

  return {
    layout: 'cell',
    className: 'collection-entry--folder-card',
    leading: <AppIcon icon="folder" emoji={entry.emoji ?? undefined} />,
    title: entry.values.name,
    description: hasCounts ? `${entry.subfolderCount ?? 0} Subfolders · ${entry.noteCount ?? 0} Notes` : undefined,
    isSelected: entry.selected,
    onClick: entry.onClick,
  };
}
