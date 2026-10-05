import type { MouseEvent } from 'react';

import type { CollectionDataListItem } from '@features/collection/components/list/CollectionDataList';

import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import type { PropertyId } from '@core/properties/collectionProperties';

import { formatPropertyValue, valueProperties } from '../../properties/formatProperty';
import { toNoteCoverImage } from './toNoteCoverImage';

export interface NoteListItemOptions {
  /** The visible properties (from the resolved view) — a property that isn't visible is omitted, never a blanked-out but still-fetched value. */
  readonly visible: readonly PropertyId[];
  /**
   * The note's cover thumbnail at the row's trailing end — the same one the
   * table's Cover image column shows. `url` is the cover resolved to a loadable
   * URL (null: no visible cover → a plus to add one); `onClick` is what the
   * thumbnail does when clicked (open the cover picker for this note). Absent,
   * no media.
   */
  readonly cover?: {
    readonly url: string | null;
    readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
}

/**
 * A note as an item of the generic collection list: its values only. The
 * note-specific part is just this mapping (which field fills which slot, in
 * which order); drawing the row is `CollectionDataList`'s job.
 */
export function toNoteListItem(
  entry: CollectionEntryModel,
  { visible, cover }: NoteListItemOptions
): CollectionDataListItem {
  // Every visible plain-value property, in canonical order, that this note actually has.
  const metadata = valueProperties(visible)
    .map((id) => formatPropertyValue(id, entry.values))
    .filter((value): value is string => Boolean(value));

  return {
    id: entry.id,
    icon: 'note',
    emoji: entry.emoji ?? undefined,
    title: entry.values.name,
    description: visible.includes('description') ? entry.values.description : undefined,
    metadata,
    media: cover && {
      children: toNoteCoverImage(cover.url, entry.coverPositionAbove),
      onClick: cover.onClick,
      label: cover.url ? 'Change cover image' : 'Add cover image',
    },
    isSelected: entry.selected,
    onClick: entry.onClick,
  };
}
