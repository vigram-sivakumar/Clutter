import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

import { Popover } from '@components/popover/Popover';

import type { WikiLinkHoverTarget } from './wikiLinkHoverPreview';

/** What the host is asked to draw a preview of — the hovered link, minus its element. */
export type WikiLinkPreviewRequest =
  | { readonly kind: 'resolved'; readonly pageId: string }
  | { readonly kind: 'unresolved'; readonly title: string };

/** Injected by the app layer: the preview content for a request, or `null` for none. The editor never loads or renders a page itself. */
export type RenderWikiLinkPreview = (request: WikiLinkPreviewRequest) => ReactNode | null;

export interface WikiLinkPreviewPopoverProps {
  target: WikiLinkHoverTarget | null;
  render: RenderWikiLinkPreview | undefined;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClose: () => void;
}

// An anchored `Overlay` returns focus to the anchor when it closes; a hover preview must never touch focus.
const NO_FOCUS_RESTORE: RefObject<HTMLElement> = { current: null };

/**
 * The floating preview, positioned above the hovered link by the shared
 * `Popover`/`Overlay` (viewport collision, flipping below when there's no room above, scroll tracking).
 * Read-only and non-modal: no backdrop, no focus movement. It renders (and so
 * asks the host to load anything) only once `target` is set, which the hover
 * hook does only after the hover has settled.
 */
export function WikiLinkPreviewPopover({
  target,
  render,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: WikiLinkPreviewPopoverProps) {
  const anchorRef = useRef<HTMLElement | null>(null);
  anchorRef.current = target?.element ?? null;

  // A link re-rendered away under an open preview (a rename, a rebuilt widget) leaves nothing to anchor to.
  useEffect(() => {
    if (!target) {
      return;
    }
    const id = setInterval(() => {
      if (!target.element.isConnected) {
        onClose();
      }
    }, 500);
    return () => clearInterval(id);
  }, [target, onClose]);

  const content =
    target && render
      ? render(
          target.kind === 'resolved'
            ? { kind: 'resolved', pageId: target.pageId }
            : { kind: 'unresolved', title: target.title }
        )
      : null;

  return (
    <Popover
      open={content !== null && content !== undefined}
      onClose={onClose}
      anchorRef={anchorRef as RefObject<HTMLElement>}
      returnFocusRef={NO_FOCUS_RESTORE}
      side="top"
      alignment="start"
      offset={4}
      backdrop={false}
      size="fit-content"
    >
      <div className="wikilink-preview" onMouseEnter={onPointerEnter} onMouseLeave={onPointerLeave}>
        {content}
      </div>
    </Popover>
  );
}
