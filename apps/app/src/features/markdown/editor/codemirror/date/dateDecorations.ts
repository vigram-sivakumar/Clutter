import type { Extension } from '@codemirror/state';
import type { EditorView, WidgetType } from '@codemirror/view';

import { semanticTokenDecorations } from '../semanticToken/tokenDecorations';
import { isDateNode, type DateNodeRange } from './dateEngagement';
import { fallbackDateResolution, type ResolveDate } from './dateResolution';
import { scanDate } from './dateScanner';
import { DateWidget } from './DateWidget';

function renderDate(
  _view: EditorView,
  _node: DateNodeRange,
  raw: string,
  getResolver: () => ResolveDate | undefined
): WidgetType | null {
  const match = scanDate(raw, 0);
  if (!match) {
    // Only possible if the buffer changed out from under a stale tree
    // between parse and this decoration pass; skip decorating this pass
    // rather than throw — the next reparse corrects it.
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.isoDate) ?? fallbackDateResolution();
  return new DateWidget(match.isoDate, resolution);
}

/**
 * Renders at-rest Dates as widgets, leaves engaged ones as plain editable
 * text, and marks at-rest ranges atomic — a thin Date-specific adapter
 * over the generic `semanticToken/tokenDecorations.ts` mechanism,
 * mirroring `wikiLinkDecorations.ts`/`tagDecorations.ts`. No concealment
 * logic exists here — a Date has no internal sub-structure to hide, same
 * as Tag.
 */
export function dateDecorations(getResolver: () => ResolveDate | undefined): Extension {
  return semanticTokenDecorations(isDateNode, (view, node, raw) =>
    renderDate(view, node, raw, getResolver)
  );
}
