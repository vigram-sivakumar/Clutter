import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { openExternalUrl } from '@shared/helpers/openExternalUrl';

import type { UrlNodeRange } from './urlEngagement';

/**
 * Resolves an at-rest bare `URL` node (standalone, or Autolink's inner
 * child) to its `activate()` callback — opens it via `openExternalUrl`,
 * identical mechanism to `linkActivation.ts`. No scan/resolve step is
 * needed here the way WikiLink/Tag/Date require: the matched node's own
 * range *is* the raw URL text (see `urlEngagement.ts`'s `isUrlNode`).
 *
 * **Excludes a `URL` whose parent is `Image`** ("Image source URL must
 * remain plain text while editing," 2026-09-02) — when an image's raw
 * Markdown (`![alt](url)`) is revealed via its own Edit source button, its
 * `url` becomes ordinary, directly-editable document text; a bare click on
 * it must place the caret there like any other text, never navigate.
 * `inlineLivePreviewParticipants.ts`'s `urlRenderer` already excludes
 * `Image` from `tok-link` *styling* for the identical reason, but that
 * guard only ever covered the visual side — this generic click mechanism
 * (`tokenMouseHandlers`/`findAtRestTokenAt`, shared with every other
 * semantic-inline kind) reads the syntax tree directly and has no idea
 * what CSS class, if any, was applied to a node, so an unstyled `URL`
 * inside `Image` was exactly as clickable-and-navigating as a styled bare
 * URL until this check existed — confirmed directly (not assumed): the
 * two guards live in genuinely separate code paths (decoration
 * construction vs. `domEventHandlers.mousedown`) with no shared gate. Not
 * excluded for `Link`/`Autolink`'s own inner `URL` — those already have a
 * dedicated click-to-navigate story of their own
 * (`linkMouseHandlers.ts`/`urlMouseHandlers.test.ts`'s own "double-
 * handled" coverage), and a second handler agreeing to open the identical
 * destination there is harmless; `Image` has no equivalent "click opens
 * this URL" behavior to agree with in the first place — its raw source is
 * meant to be plain text, full stop.
 */
export function getUrlActivation(view: EditorView, node: UrlNodeRange): (() => void) | null {
  const url = view.state.sliceDoc(node.from, node.to);
  if (!url) {
    return null;
  }

  const parentName = syntaxTree(view.state).resolve(node.from, 1).parent?.name;
  if (parentName === 'Image') {
    return null;
  }

  return () => {
    void openExternalUrl(url);
  };
}
