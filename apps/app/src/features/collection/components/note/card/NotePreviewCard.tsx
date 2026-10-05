import type { SystemIcon } from '@shared/icon';

import { CardTitleSection } from '../../card/CardTitleSection';
import type { DocumentPreviewResolvers } from './DocumentPreview';
import { PageCanvasPreview } from './PageCanvasPreview';
import './NotePreviewCard.css';

export interface NotePreviewCardProps {
  title: string;
  emoji?: string;
  icon?: SystemIcon;
  /** The note's body Markdown. Blank (or absent) shows the empty-note state — also what a WikiLink to a page that doesn't exist previews as. */
  markdown?: string;
  cover?: string | null;
  coverHidden?: boolean;
  coverPositionAbove?: number;
  /** Show the title section above the canvas. Off by default: the preview is the page canvas alone. */
  showHeader?: boolean;
  resolvers?: DocumentPreviewResolvers;
}

/**
 * A note as a read-only card for a floating preview (the WikiLink hover):
 * the note's page canvas (cover + body, scaled as one — PageCanvasPreview),
 * optionally under the note card's title section, in the same card
 * surface, but inert — no `role="button"`, no focus, no click target, no
 * selection — and a fixed size of its own rather than a grid cell's shape.
 * With nothing to render it shows "Empty note" instead of an empty canvas.
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
      {showHeader && (
        <CardTitleSection title={title} icon={icon} emoji={emoji} />
      )}
      {isEmpty ? (
        <div className="note-preview-card__empty">Empty note</div>
      ) : (
        <PageCanvasPreview
          className={showHeader ? undefined : 'page-canvas-preview--headless'}
          markdown={markdown}
          cover={cover}
          coverHidden={coverHidden}
          coverPositionAbove={coverPositionAbove}
          resolvers={resolvers}
        />
      )}
    </div>
  );
}
