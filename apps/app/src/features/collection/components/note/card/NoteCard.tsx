import { forwardRef, type HTMLAttributes } from 'react';

import { CollectionCard } from '../../card/CollectionCard';
import { CardTitleSection } from '../../card/CardTitleSection';
import type { SystemIcon } from '@shared/icon';
import type { DocumentPreviewResolvers } from './DocumentPreview';
import { PageCanvasPreview } from './PageCanvasPreview';
import './NoteCard.css';

export interface NoteCardProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'title'
> {
  title: string;
  emoji?: string;
  /** Header glyph when there's no emoji — `'note'` for a note, `'plus'` for the New Note card. */
  icon?: SystemIcon;

  /** The note's description, one truncated line above the edited date (undefined when the Description property is off, or the note has none). */
  description?: string;
  /** The edited date (undefined when the Last edited property is off). */
  updated?: string;

  /** Body Markdown for the page canvas — see PageCanvasPreview. */
  markdown?: string;
  cover?: string;
  coverHidden?: boolean;
  coverPositionAbove?: number;
  previewResolvers?: DocumentPreviewResolvers;
  /** No page canvas: just the header (the New Note / New template action cards). */
  headerOnly?: boolean;

  isSelected?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * One note as a card: the title section (the shared CardTitleSection) at real
 * size, then the note's page as one scaled canvas — cover and content together
 * (PageCanvasPreview). The card owns the padding and the gap between the two.
 * The whole card is the single open-note target — the canvas is inert — with
 * the same role/keyboard activation CollectionEntry gives a row (Enter/Space on
 * the card itself, never on a descendant). `headerOnly` drops the canvas (the
 * New Note / New template action cards).
 */
export const NoteCard = forwardRef<HTMLDivElement, NoteCardProps>(
  function NoteCard(
    {
      title,
      emoji,
      icon = 'note',
      description,
      updated,
      markdown = '',
      cover,
      coverHidden,
      coverPositionAbove,
      previewResolvers,
      headerOnly = false,
      isSelected = false,
      onClick,
      className,
      ...props
    },
    ref
  ) {
    return (
      <CollectionCard
        {...props}
        ref={ref}
        className={[
          'note-card',
          headerOnly && 'note-card--header-only',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        // Header-only (nothing fills the fixed card shape): just the header's height.
        compact={headerOnly}
        isSelected={isSelected}
        onClick={onClick}
      >
        {/* The shared title section (title, description, edited date). The
            card stays the one interactive target. */}
        <CardTitleSection
          className="note-card__header"
          icon={icon}
          emoji={emoji}
          title={title}
          description={description}
          metadata={updated ? <span>Edited {updated}</span> : undefined}
          metadataLayout="vertical"
        />

        {!headerOnly && (
          // The note's page as one canvas — the header above is real-size,
          // outside the scaling. The cover is always the top of the note,
          // whatever layout the note's own cover uses (`coverLayout` is not
          // an input): the saved *above* focal position drives its crop.
          <PageCanvasPreview
            markdown={markdown}
            cover={cover}
            coverHidden={coverHidden}
            coverPositionAbove={coverPositionAbove}
            resolvers={previewResolvers}
          />
        )}
      </CollectionCard>
    );
  }
);

NoteCard.displayName = 'NoteCard';
