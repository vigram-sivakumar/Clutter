import { CardTitleSection } from '@features/collection/components/card/CardTitleSection';
import type { CollectionCardProps } from '@features/collection/components/card/CollectionCard';
import type { CollectionGridColumns } from '@features/collection/components/grid/CollectionGrid';
import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import { formatPropertyValue } from '../../properties/formatProperty';
import { resolveNoteCoverUrl, type NotePreviewResolvers } from './notePreviewResolvers';
import { NotePageCanvas } from './preview/NotePageCanvas';

/** The notes card grid: cards between 200px and 1/5 of the row wide. */
export const NOTE_GRID: CollectionGridColumns = { min: 200, max: 5 };

/** A note card's fixed shape (width / height) — the page canvas fills what the header leaves. */
export const NOTE_CARD_ASPECT_RATIO = '3 / 4';

export interface NoteCardOptions {
  /** Which note properties the card shows. */
  readonly show: {
    readonly description: boolean;
    readonly updated: boolean;
  };
  /** Resolves the cover and the Markdown's links/embeds for the page canvas. */
  readonly resolvers?: NotePreviewResolvers;
}

/**
 * A note as a card: the title section (title, description, edited date) at
 * real size, then the note's page — cover and body — as one scaled canvas
 * (`NotePageCanvas`). The note-specific part is this mapping: which field
 * fills which part, and the card's shape. Drawing it is `CollectionCard`'s job.
 */
export function toNoteCardProps(
  entry: CollectionEntryModel,
  { show, resolvers }: NoteCardOptions
): CollectionCardProps {
  const edited = formatPropertyValue('updated', entry.values);

  return {
    header: (
      <CardTitleSection
        icon="note"
        emoji={entry.emoji ?? undefined}
        title={entry.values.name}
        description={show.description ? entry.values.description : undefined}
        metadata={show.updated && edited ? [`Edited ${edited}`] : undefined}
        metadataLayout="vertical"
      />
    ),
    children: (
      <NotePageCanvas
        markdown={entry.markdown}
        coverUrl={resolveNoteCoverUrl(entry.values.cover, false, resolvers)}
        coverPositionAbove={entry.coverPositionAbove}
        resolvers={resolvers}
      />
    ),
    aspectRatio: NOTE_CARD_ASPECT_RATIO,
    isSelected: entry.selected,
    onClick: entry.onClick,
  };
}
