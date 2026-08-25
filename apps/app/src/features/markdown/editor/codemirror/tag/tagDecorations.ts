import type { WidgetType } from '@codemirror/view';

import { fallbackTagResolution, type ResolveTag } from './tagResolution';
import { scanTag } from './tagScanner';
import { TagWidget } from './TagWidget';

/**
 * Tag's own at-rest rendering fact — see `wikiLinkDecorations.ts`'s
 * `renderWikiLink` doc comment for the full rationale, which applies
 * unchanged here. No concealment logic exists for Tag (unlike WikiLink's
 * former `wikiLinkMarkerDecorations.ts`, retired — a Tag has no internal
 * sub-structure to hide), so this is the entirety of Tag's participation.
 */
export function renderTag(
  raw: string,
  getResolver: () => ResolveTag | undefined
): WidgetType | null {
  const match = scanTag(raw, 0);
  if (!match) {
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.name) ?? fallbackTagResolution(match.name);
  return new TagWidget(raw, resolution);
}
