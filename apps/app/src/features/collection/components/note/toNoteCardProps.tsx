import { showsDescriptionSnippet } from './toNoteTagContent';
import { CardDivider } from '@features/collection/components/card/CardDivider';
import { CardTitleSection } from '@features/collection/components/card/CardTitleSection';
import type { CollectionCardProps } from '@features/collection/components/card/CollectionCard';
import { CollectionImage } from '@features/collection/components/media/CollectionImage';
import type { CollectionGridColumns } from '@features/collection/components/grid/CollectionGrid';
import type { CollectionEntryModel } from '../../page/CollectionEntryModel';
import type { PropertyId } from '@core/properties/collectionProperties';
import { cardMetadataLines } from '../../properties/cardMetadata';
import { resolveNoteCoverUrl, type NotePreviewResolvers } from './notePreviewResolvers';
import { NotePageCanvas } from './preview/NotePageCanvas';

/** The notes card grid: cards between 200px and 1/5 of the row wide. */
export const NOTE_GRID: CollectionGridColumns = { min: 200, max: 5 };

/** A note card's fixed shape (width / height) — the page canvas fills what the cover and header leave. */
export const NOTE_CARD_ASPECT_RATIO = '3 / 4';

export interface NoteCardOptions {
  /**
   * The visible properties (from the resolved view). A note card draws the Cover image, the Description, the
   * Created date and the Last edited date; every other property it simply does not draw (see the
   * characterization tests — known gaps, not decisions).
   */
  readonly visible: readonly PropertyId[];
  /** Resolves the cover and the Markdown's links/embeds for the page canvas. */
  readonly resolvers?: NotePreviewResolvers;
  /** Draws a rule between the header and the page. The page decides whether to show it (the header-separator setting); the mapper only draws it. */
  readonly divider?: boolean;
}

/**
 * A note as a card: its cover as the card's media (when it has one the resolver
 * can load), then the title section (title, description, edited date) at real
 * size, an optional divider, and the note's page — the body, as one scaled
 * canvas (`NotePageCanvas`) that runs to the card's bottom edge. The
 * note-specific part is this mapping: which field fills which part, and the
 * card's shape. Drawing it is `CollectionCard`'s job.
 */
export function toNoteCardProps(
  entry: CollectionEntryModel,
  { visible, resolvers, divider }: NoteCardOptions
): CollectionCardProps {
  // Every visible plain-value property the note has a value for (Created, Edited), each one plain line.
  const dates = cardMetadataLines(entry.values, visible).map((line) => `${line.label} ${line.value}`);
  // The cover is a property like any other: turned off in the view, the card draws no cover.
  const coverUrl = visible.includes('cover') ? resolveNoteCoverUrl(entry.values.cover, false, resolvers) : null;

  return {
    media: coverUrl ? <CollectionImage src={coverUrl} positionY={entry.coverPositionAbove} /> : undefined,
    header: (
      <CardTitleSection
        icon="note"
        emoji={entry.emoji ?? undefined}
        title={entry.values.name}
        description={showsDescriptionSnippet(entry, visible) ? entry.values.description : undefined}
        metadata={dates}
        metadataLayout="vertical"
      />
    ),
    divider: divider ? <CardDivider /> : undefined,
    // The card's main section pads the page, so the canvas has no inset of its own.
    children: <NotePageCanvas markdown={entry.markdown} resolvers={resolvers} inset="0px" />,
    aspectRatio: NOTE_CARD_ASPECT_RATIO,
    isSelected: entry.selected,
    onClick: entry.onClick,
  };
}
