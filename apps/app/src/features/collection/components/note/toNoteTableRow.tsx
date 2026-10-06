import type { MouseEvent } from 'react';

import type {
  CollectionDataTableRow,
  CollectionTableCellValue,
} from '@features/collection/components/table/CollectionDataTable';

import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import type { PropertyId } from '@core/properties/collectionProperties';
import { propertyValueCells } from '../../properties/tableColumns';
import { toNoteCoverImage } from './toNoteCoverImage';

/**
 * The empty-description fallback text. Currently NOT shown in the table (an empty description
 * renders nothing); set `SHOW_EMPTY_DESCRIPTION_PLACEHOLDER` to true to bring it back.
 */
const EMPTY_DESCRIPTION_PLACEHOLDER = 'No description';
const SHOW_EMPTY_DESCRIPTION_PLACEHOLDER = false;

export interface NoteTableRowOptions {
  /**
   * The visible properties (from the resolved view) — must be the same ones the table's columns
   * were built from. Description is not a column: it is drawn inside the Name cell (its
   * empty-description fallback is currently off) when it is visible.
   */
  readonly visible: readonly PropertyId[];
  /**
   * The Cover image column's cell for this note — only read when the Cover image is visible.
   * `url` is the cover resolved to a loadable URL (null: no visible cover); `onClick` is what
   * the thumbnail does when clicked (open the cover picker for this note).
   */
  readonly cover?: {
    readonly url: string | null;
    readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
}

/**
 * A note as a row of the generic collection table: its values only, keyed by
 * the column ids `buildPropertyTableColumns` declares. The note-specific part is
 * just this mapping (which field fills which column); drawing the cells and
 * the grid is `CollectionDataTable`'s job.
 */
export function toNoteTableRow(
  entry: CollectionEntryModel,
  { visible, cover }: NoteTableRowOptions
): CollectionDataTableRow {
  const showDescription = visible.includes('description');
  const cells: Record<string, CollectionTableCellValue> = {
    name: {
      variant: 'header',
      icon: 'note',
      emoji: entry.emoji ?? undefined,
      title: entry.values.name,
      description: showDescription ? entry.values.description : undefined,
      descriptionPlaceholder:
        showDescription && SHOW_EMPTY_DESCRIPTION_PLACEHOLDER
          ? EMPTY_DESCRIPTION_PLACEHOLDER
          : undefined,
    },
    ...propertyValueCells(visible, entry.values),
  };

  if (visible.includes('cover') && cover) {
    cells.cover = {
      variant: 'media',
      children: toNoteCoverImage(cover.url, entry.coverPositionAbove),
      onClick: cover.onClick,
      label: cover.url ? 'Change cover image' : 'Add cover image',
    };
  }

  return { id: entry.id, cells, isSelected: entry.selected, onClick: entry.onClick };
}
