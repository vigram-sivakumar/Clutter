import { forwardRef, type HTMLAttributes } from 'react';

import { CollectionCard } from '../../card/CollectionCard';
import { CardTitleSection } from '../../card/CardTitleSection';
import type { SystemIcon } from '@shared/icon';
import {
  DocumentPreview,
  type DocumentPreviewResolvers,
} from './DocumentPreview';
import './NoteCard.css';

export interface NoteCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: string;
  emoji?: string;
  /** Header glyph when there's no emoji — `'note'` for a note, `'plus'` for the New Note card. */
  icon?: SystemIcon;

  /** The note's description, one truncated line above the edited date (undefined when the Description property is off, or the note has none). */
  description?: string;
  /** The edited date (undefined when the Last edited property is off). */
  updated?: string;

  /** Body Markdown for the preview region — see DocumentPreview. */
  markdown?: string;
  cover?: string;
  coverHidden?: boolean;
  coverPositionAbove?: number;
  previewResolvers?: DocumentPreviewResolvers;
  /** The Cover image property: whether the cover section is shown. */
  showCover?: boolean;
  /** The Content preview property: whether the content section is shown. */
  showContent?: boolean;

  isSelected?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * One note as a card, made of up to three sibling sections — title
 * section (the shared CardTitleSection), cover, content. The card owns the padding around them and a single `gap` between
 * them (NoteCard.css); the sections have none of their own beyond the 4px
 * inline inset that lines the cover and content up under the header's icon.
 * Hiding any section removes it and its gap; with the content hidden the cover
 * grows to fill the card, so the card shrinks only when both are hidden. The content is a fixed document
 * canvas scaled to fit (see DocumentPreview); the cover is outside it. The
 * whole card is the single open-note target — the sections are inert — with
 * the same role/keyboard activation CollectionEntry gives a row (Enter/Space
 * on the card itself, never on a descendant).
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
      showCover = true,
      showContent = true,
      isSelected = false,
      onClick,
      className,
      ...props
    },
    ref
  ) {
    // The cover section: shown when the note has a visible cover. With the
    // content hidden it fills the card's remaining height (below), so the card
    // keeps its shape; a note without a cover just has nothing under the header.
    const coverUrl =
      showCover && cover && !coverHidden
        ? (previewResolvers?.resolveCoverImage?.(cover) ?? null)
        : null;

    return (
      <CollectionCard
        {...props}
        ref={ref}
        className={[
          'note-card',
          !showContent && !showCover && 'note-card--header-only',
          !showContent && showCover && 'note-card--cover-only',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        // Header-only (nothing fills the fixed card shape): just the header's height.
        compact={!showContent && !showCover}
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

        {coverUrl && (
          // Always the top of the note, whatever layout the note's own cover
          // uses (`coverLayout` is deliberately not an input): normalized to
          // the "above" crop, using the saved *above* focal position — the
          // value that describes a full-width banner (the side position is
          // a horizontal focus). Its own section, outside the content
          // canvas: real pixels, not scaled with the document — a fixed-height
          // banner above the content, or the whole remaining height when the
          // content is hidden. Nothing about the note's stored cover is read
          // for writing or changed.
          <div className="note-card__cover" aria-hidden="true">
            <img
              className="note-card__cover-image"
              src={coverUrl}
              alt=""
              draggable={false}
              loading="lazy"
              style={{ objectPosition: `50% ${coverPositionAbove ?? 50}%` }}
            />
          </div>
        )}

        {showContent && (
          <DocumentPreview markdown={markdown} resolvers={previewResolvers} />
        )}
      </CollectionCard>
    );
  }
);

NoteCard.displayName = 'NoteCard';
