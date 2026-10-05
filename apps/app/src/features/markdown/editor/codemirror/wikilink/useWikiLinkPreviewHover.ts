import { useCallback, useEffect, useRef, useState } from 'react';

import type { WikiLinkHoverHandlers, WikiLinkHoverTarget } from './wikiLinkHoverPreview';

/** How long the pointer must rest on a link before its preview opens — a pass-over opens (and loads) nothing. */
export const WIKILINK_PREVIEW_OPEN_DELAY_MS = 400;

export interface WikiLinkPreviewHover {
  /** The link whose preview is open; `null` while closed (or still waiting out the open delay). */
  readonly target: WikiLinkHoverTarget | null;
  /** Hand to `wikiLinkHoverPreview`: the editor's raw enter/leave reports. */
  readonly editorHandlers: WikiLinkHoverHandlers;
  /** Pointer entered / left the open preview itself (it can be reached where it overlaps the link's edge). */
  readonly onPreviewEnter: () => void;
  readonly onPreviewLeave: () => void;
  /** Closes at once, with no grace (Escape, the editor invalidating the hover). */
  readonly close: () => void;
}

/**
 * The preview's hover lifecycle: link → (open delay) → open → pointer leaves
 * link (or the preview) → closed at once, with no grace period. Pure timing and state — it never
 * touches the editor, and nothing is resolved or rendered until `target` is
 * set, i.e. until the hover has settled.
 */
export function useWikiLinkPreviewHover(): WikiLinkPreviewHover {
  const [target, setTarget] = useState<WikiLinkHoverTarget | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = null;
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setTarget(null);
  }, [clearTimers]);

  const enter = useCallback(
    (next: WikiLinkHoverTarget) => {
      clearTimers();
      openTimer.current = setTimeout(() => {
        openTimer.current = null;
        setTarget(next);
      }, WIKILINK_PREVIEW_OPEN_DELAY_MS);
    },
    [clearTimers]
  );

  useEffect(() => clearTimers, [clearTimers]);

  const editorHandlersRef = useRef<WikiLinkHoverHandlers>({ enter, leave: close });

  return {
    target,
    editorHandlers: editorHandlersRef.current,
    onPreviewEnter: clearTimers,
    onPreviewLeave: close,
    close,
  };
}
