import type { Extension } from '@codemirror/state';
import type { EditorView, WidgetType } from '@codemirror/view';

import { semanticTokenDecorations } from '../semanticToken/tokenDecorations';
import { isTagNode, type TagNodeRange } from './tagEngagement';
import { fallbackTagResolution, type ResolveTag } from './tagResolution';
import { scanTag } from './tagScanner';
import { TagWidget } from './TagWidget';

function renderTag(
  _view: EditorView,
  _node: TagNodeRange,
  raw: string,
  getResolver: () => ResolveTag | undefined
): WidgetType | null {
  const match = scanTag(raw, 0);
  if (!match) {
    // Only possible if the buffer changed out from under a stale tree
    // between parse and this decoration pass; skip decorating this pass
    // rather than throw — the next reparse corrects it.
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.name) ?? fallbackTagResolution(match.name);
  return new TagWidget(raw, resolution);
}

/**
 * Renders at-rest Tags as widgets, leaves engaged ones as plain editable
 * text, and marks at-rest ranges atomic — a thin Tag-specific adapter over
 * the generic `semanticToken/tokenDecorations.ts` mechanism, mirroring
 * `wikiLinkDecorations.ts`. No concealment logic exists here (unlike
 * `wikiLinkMarkerDecorations.ts`) — a Tag has no internal sub-structure to
 * hide, so the generic mechanism's own "raw text renders once engaged"
 * behavior is already exactly correct with no additional file.
 */
export function tagDecorations(getResolver: () => ResolveTag | undefined): Extension {
  return semanticTokenDecorations(isTagNode, (view, node, raw) =>
    renderTag(view, node, raw, getResolver)
  );
}
