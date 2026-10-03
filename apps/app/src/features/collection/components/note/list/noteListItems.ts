import type { ReactNode } from 'react';

import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import type { CollectionDataListItem } from '../../list/CollectionDataList';

export interface NoteListItemOptions {
  /** Which fields the list shows — an unchecked one is omitted, never a blanked-out but still-fetched value. */
  readonly show: {
    readonly description: boolean;
    readonly created: boolean;
    readonly updated: boolean;
    readonly archived: boolean;
  };
  /** Hover-revealed trailing slot (Archive's Restore / Delete). */
  readonly actions?: ReactNode;
}

/**
 * A note as an item of the generic collection list: its values only. The
 * note-specific part is just this mapping (which field fills which slot, in
 * which order); drawing the row is `CollectionDataList`'s job. `lastOpened`
 * has no data source (see CollectionEntryModel), so it never appears.
 */
export function toNoteListItem(
  entry: CollectionEntryModel,
  { show, actions }: NoteListItemOptions
): CollectionDataListItem {
  const metadata = [
    show.created ? entry.created : undefined,
    show.updated ? entry.updated : undefined,
    show.archived ? entry.archived : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    id: entry.id,
    icon: 'note',
    emoji: entry.emoji ?? undefined,
    title: entry.title,
    description: show.description ? entry.description : undefined,
    metadata,
    isSelected: entry.selected,
    actions,
    onClick: entry.onClick,
  };
}
