import type { SystemIcon } from '@shared/icon';
import { CardTitleSection } from '@features/collection/components/card/CardTitleSection';
import { NotePageCanvas } from './NotePageCanvas';
import { resolveNoteCoverUrl, type NotePreviewResolvers } from '../notePreviewResolvers';
import './NotePreviewCard.css';

export interface NotePreviewCardProps {
  title: string;
  emoji?: string;
  icon?: SystemIcon;
  /** The note's body Markdown. Blank (or absent) shows the empty-note state — also what a WikiLink to a page that doesn't exist previews as. */
  markdown?: string;
  /** The persisted cover reference; resolved through `resolvers.resolveCoverImage`. */
  cover?: string | null;
  coverHidden?: boolean;
  coverPositionAbove?: number;
  /** Show the title section above the canvas. Off by default: the preview is the page canvas alone. */
  showHeader?: boolean;
  resolvers?: NotePreviewResolvers;
}

/**
 * A note as a read-only card for a floating preview (the WikiLink hover): the
 * note's page canvas (cover + body, scaled as one — NotePageCanvas),
 * optionally under the shared card title section, on the floating surface of a
 * menu (opaque, with a shadow — unlike a collection card's translucent tint),
 * inert — no role, no focus, no click target — at a fixed size of its own. With
 * nothing to render it shows "Empty note" instead of an empty canvas.
 */
export function NotePreviewCard({
  title,
  emoji,
  icon = 'note',
  markdown = '',
  cover,
  coverHidden,
  coverPositionAbove,
  showHeader = false,
  resolvers,
}: NotePreviewCardProps) {
  const isEmpty = markdown.trim().length === 0;

  return (
    <div className="note-preview-card">
      {showHeader && <CardTitleSection title={title} icon={icon} emoji={emoji} />}

      {isEmpty ? (
        <div className="note-preview-card__empty">Empty note</div>
      ) : (
        <NotePageCanvas
          className={showHeader ? undefined : 'note-page-canvas--headless'}
          markdown={markdown}
          coverUrl={resolveNoteCoverUrl(cover ?? undefined, coverHidden, resolvers)}
          coverPositionAbove={coverPositionAbove}
          resolvers={resolvers}
        />
      )}
    </div>
  );
}
