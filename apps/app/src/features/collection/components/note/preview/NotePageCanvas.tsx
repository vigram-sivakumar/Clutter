import { useMemo } from 'react';
import { CollectionImage } from '@features/collection/components/media/CollectionImage';
import { ScaledCanvas } from '@features/collection/components/scale/ScaledCanvas';
import type { CompactMarkdownResolvers } from '@features/markdown/render/renderCompactMarkdown';
import { renderMarkdownBlocks } from '@features/markdown/render/renderMarkdownBlocks';
import './NotePageCanvas.css';

/** The width, in the document's own pixels, a note's page is laid out at before it is scaled to fit. */
export const NOTE_CANVAS_WIDTH = 600;

export interface NotePageCanvasProps {
  /** The note's body Markdown (no frontmatter). */
  markdown?: string;
  /** The note's cover as a loadable URL (resolved by the caller); shown at the top of the page when given. */
  coverUrl?: string | null;
  /** Vertical focal point (0–100) the cover was framed with. Defaults to centred. */
  coverPositionAbove?: number;
  resolvers?: CompactMarkdownResolvers;
  /** Extra class on the viewport (e.g. the headless inset). */
  className?: string;
}

/** Parsed and rendered only once ScaledCanvas mounts its children (near the viewport), so a long grid doesn't parse every note up front. */
function NotePageBody({ markdown, resolvers }: { markdown: string; resolvers?: CompactMarkdownResolvers }) {
  const blocks = useMemo(() => renderMarkdownBlocks(markdown, resolvers), [markdown, resolvers]);

  return <div className="note-page-canvas__body">{blocks}</div>;
}

/**
 * A note's page — cover and body — as ONE canonical page, laid out at
 * NOTE_CANVAS_WIDTH and scaled as a unit to the width it is given, so the cover
 * and the text keep the same proportions at every size. The card's header sits
 * outside it, at real size. Read-only and inert (ScaledCanvas: no pointer
 * events, hidden from assistive tech); it never mounts an editor. It renders
 * Markdown, which the generic primitives cannot — that is why it is a
 * component and not a mapper.
 */
export function NotePageCanvas({
  markdown = '',
  coverUrl,
  coverPositionAbove,
  resolvers,
  className,
}: NotePageCanvasProps) {
  return (
    <div className={['note-page-canvas', className].filter(Boolean).join(' ')}>
      <ScaledCanvas designWidth={NOTE_CANVAS_WIDTH}>
        <div className="note-page-canvas__page">
          {coverUrl && (
            <div className="note-page-canvas__cover">
              <CollectionImage src={coverUrl} positionY={coverPositionAbove ?? 50} />
            </div>
          )}
          <NotePageBody markdown={markdown} resolvers={resolvers} />
        </div>
      </ScaledCanvas>
    </div>
  );
}
