import { createElement, type MouseEvent, type ReactNode } from 'react';

import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import type { CollectionDataListItem } from '../../list/CollectionDataList';
import { NoteCoverThumbnail } from '../table/NoteCoverThumbnail';

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
  { show, actions, cover }: NoteListItemOptions
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
    media: cover && {
      children: createElement(NoteCoverThumbnail, {
        url: cover.url,
        positionAbove: entry.coverPositionAbove,
      }),
      onClick: cover.onClick,
      label: cover.url ? 'Change cover image' : 'Add cover image',
    },
    isSelected: entry.selected,
    actions,
    onClick: entry.onClick,
  };
}
