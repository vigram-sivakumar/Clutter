import { CardTitleSection } from '@features/collection/components/card/CardTitleSection';
import type { CollectionCardProps } from '@features/collection/components/card/CollectionCard';
import type { CollectionGridColumns } from '@features/collection/components/grid/CollectionGrid';
import type { CollectionEntryModel } from '../../page/CollectionEntryModel';

/**
 * The folders grid: tiles between 200px and 1/5 of the row wide, every row one
 * tile tall — the title row, the counts line, and the card's 6px padding and
 * 1px border (24 + 2 + 16 + 12 + 2).
 */
export const FOLDER_GRID: { readonly columns: CollectionGridColumns; readonly rowHeight: number } = {
  columns: { min: 200, max: 5 },
  rowHeight: 56,
};

/**
 * A folder as a card: just a header — icon or emoji, name and its subfolder /
 * note counts (when it has them) — with nothing under it (no media, no content). The folder-specific
 * part is this mapping; drawing it is `CollectionCard`'s job.
 */
export function toFolderCardProps(entry: CollectionEntryModel): CollectionCardProps {
  // A folder entry that carries no counts (e.g. a Daily Notes year) shows just its name.
  const hasCounts = entry.subfolderCount !== undefined || entry.noteCount !== undefined;

  return {
    header: (
      <CardTitleSection
        icon="folder"
        emoji={entry.emoji ?? undefined}
        title={entry.values.name}
        metadata={
          hasCounts ? [`${entry.subfolderCount ?? 0} Subfolders`, `${entry.noteCount ?? 0} Notes`] : undefined
        }
      />
    ),
    isSelected: entry.selected,
    onClick: entry.onClick,
  };
}
