import type { MouseEvent } from 'react';

import type { CollectionDataListItem } from '@features/collection/components/list/CollectionDataList';

import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import { formatPropertyValue } from '../../properties/formatProperty';
import { toNoteCoverImage } from './toNoteCoverImage';

export interface NoteListItemOptions {
  /** Which fields the list shows — an unchecked one is omitted, never a blanked-out but still-fetched value. */
  readonly show: {
    readonly description: boolean;
    readonly created: boolean;
    readonly updated: boolean;
    readonly archived: boolean;
  };
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
  { show, cover }: NoteListItemOptions
): CollectionDataListItem {
  const metadata = [
    show.created ? formatPropertyValue('created', entry.values) : undefined,
    show.updated ? formatPropertyValue('updated', entry.values) : undefined,
    show.archived ? formatPropertyValue('archived', entry.values) : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    id: entry.id,
    icon: 'note',
    emoji: entry.emoji ?? undefined,
    title: entry.values.name,
    description: show.description ? entry.values.description : undefined,
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
