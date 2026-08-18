import type { Extension } from '@codemirror/state';
import type { EditorView, WidgetType } from '@codemirror/view';

import { semanticTokenDecorations } from '../semanticToken/tokenDecorations';
import { isWikiLinkNode, type WikiLinkNodeRange } from './wikiLinkEngagement';
import { scanWikiLink } from './wikiLinkScanner';
import { fallbackWikiLinkResolution, type ResolveWikiLink } from './wikiLinkResolution';
import { WikiLinkWidget } from './WikiLinkWidget';

function renderWikiLink(
  _view: EditorView,
  _node: WikiLinkNodeRange,
  raw: string,
  getResolver: () => ResolveWikiLink | undefined
): WidgetType | null {
  const match = scanWikiLink(raw, 0);
  if (!match) {
    // Only possible if the buffer changed out from under a stale tree
    // between parse and this decoration pass; skip decorating this pass
    // rather than throw — the next reparse corrects it.
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.path, match.alias) ?? fallbackWikiLinkResolution(match.path);
  return new WikiLinkWidget(match.path, match.alias, resolution);
}

/**
 * Renders at-rest WikiLinks as collapsed widgets, leaves engaged ones as
 * plain editable text, and marks at-rest ranges atomic — a thin
 * WikiLink-specific adapter over the generic
 * `semanticToken/tokenDecorations.ts` mechanism (docs/editor-architecture-decisions.md
 * §11). All WikiLink-specific behavior (scanning the raw text, resolving
 * it, building the widget) lives in `renderWikiLink` above; the shared
 * mechanism owns tree iteration, engagement suppression, and atomic-range
 * wiring.
 */
export function wikiLinkDecorations(getResolver: () => ResolveWikiLink | undefined): Extension {
  return semanticTokenDecorations(isWikiLinkNode, (view, node, raw) =>
    renderWikiLink(view, node, raw, getResolver)
  );
}
