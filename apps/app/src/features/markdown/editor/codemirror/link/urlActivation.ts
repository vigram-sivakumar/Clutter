import type { EditorView } from '@codemirror/view';

import { openExternalUrl } from '@shared/helpers/openExternalUrl';

import type { UrlNodeRange } from './urlEngagement';

/**
 * Resolves an at-rest bare `URL` node (standalone, or Autolink's inner
 * child) to its `activate()` callback — opens it via `openExternalUrl`,
 * identical mechanism to `linkActivation.ts`. No scan/resolve step is
 * needed here the way WikiLink/Tag/Date require: the matched node's own
 * range *is* the raw URL text (see `urlEngagement.ts`'s `isUrlNode`).
 */
export function getUrlActivation(view: EditorView, node: UrlNodeRange): (() => void) | null {
  const url = view.state.sliceDoc(node.from, node.to);
  if (!url) {
    return null;
  }

  return () => {
    void openExternalUrl(url);
  };
}
