import { forwardRef, type HTMLAttributes } from 'react';

import { CollectionEntry } from '@features/collection/CollectionEntry';
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
 * One note as a card, made of up to three sibling sections — header, cover,
 * content. The card owns the padding around them and a single `gap` between
 * them (NoteCard.css); the sections have none of their own beyond the 4px
 * inline inset that lines the cover and content up under the header's icon.
 * Hiding any section removes it and its gap. The content is a fixed document
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
    // The cover section: shown when the note has a visible cover — and, when
    // there's no content section (so the card isn't the fixed page shape),
    // as an empty slot even for a note without one, so every card is the
    // same height.
    const coverUrl =
      showCover && cover && !coverHidden
        ? (previewResolvers?.resolveCoverImage?.(cover) ?? null)
        : null;
    const reserveCoverSlot = showCover && !showContent;

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      if (event.target !== event.currentTarget) {
        return;
      }
      event.preventDefault();
      event.currentTarget.click();
    };

    return (
      <div
        {...props}
        ref={ref}
        className={['note-card', !showContent && !showCover && 'note-card--header-only', !showContent && showCover && 'note-card--cover-only', isSelected && 'note-card--selected', className]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
      >
        {/* The shared collection entry in its stacked layout (icon + title,
            metadata below) — same header FolderCard uses. No onClick, so
            it renders as a plain row and the card stays the one
            interactive target. */}
        <CollectionEntry
          stacked
          className="note-card__header"
          icon={icon}
          emoji={emoji}
          title={title}
          metadata={
            description || updated ? (
              <>
                {description && (
                  <span className="note-card__description">{description}</span>
                )}
                {updated && <span>Edited {updated}</span>}
              </>
            ) : undefined
          }
        />

        {(coverUrl || reserveCoverSlot) && (
          // Always the top of the note, whatever layout the note's own cover
          // uses (`coverLayout` is deliberately not an input): normalized to
          // the "above" crop, using the saved *above* focal position — the
          // value that describes a full-width banner (the side position is
          // a horizontal focus). Its own section, outside the content
          // canvas: real pixels, not scaled with the document. Nothing about
          // the note's stored cover is read for writing or changed.
          <div className="note-card__cover" aria-hidden="true">
            {coverUrl && (
              <img
                className="note-card__cover-image"
                src={coverUrl}
                alt=""
                draggable={false}
                loading="lazy"
                style={{ objectPosition: `50% ${coverPositionAbove ?? 50}%` }}
              />
            )}
          </div>
        )}

        {showContent && (
          <DocumentPreview markdown={markdown} resolvers={previewResolvers} />
        )}
      </div>
    );
  }
);

NoteCard.displayName = 'NoteCard';
