import type { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

import { openExternalUrl } from '@shared/helpers/openExternalUrl';

import type { LinkNodeRange } from './linkEngagement';

/**
 * Resolves an at-rest `Link` node to its `activate()` callback — opens the
 * destination via the existing `openExternalUrl` helper, no injected
 * resolver needed (unlike WikiLink/Tag/Date). Extracts the `URL` child by
 * walking the node's children directly, mirroring `linkRenderer`'s own
 * child-walk in `inlineLivePreviewParticipants.ts` — `Link` always opens
 * externally, unconditionally; there is no vault-relative-path resolution
 * branch here, that is `[[WikiLink]]`'s exclusive concern.
 *
 * Returns `null` for a reference-style/shortcut link (no `URL` child) —
 * matching `linkRenderer`'s own scope boundary — so `handleTokenClick`
 * treats the click as unhandled and falls through to CM6's default
 * click-to-position-cursor.
 */
export function getLinkActivation(view: EditorView, node: LinkNodeRange): (() => void) | null {
  let url: string | null = null;
  syntaxTree(view.state).iterate({
    from: node.from,
    to: node.to,
    enter: (n) => {
      if (n.name === 'URL') {
        url = view.state.sliceDoc(n.from, n.to);
      }
    },
  });

  if (!url) {
    return null;
  }

  const destination = url;
  return () => {
    void openExternalUrl(destination);
  };
}
