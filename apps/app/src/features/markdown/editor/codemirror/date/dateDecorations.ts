import type { WidgetType } from '@codemirror/view';

import { fallbackDateResolution, type ResolveDate } from './dateResolution';
import { scanDate } from './dateScanner';
import { DateWidget } from './DateWidget';

/**
 * Date's own at-rest rendering fact — see `wikiLinkDecorations.ts`'s
 * `renderWikiLink` doc comment for the full rationale, which applies
 * unchanged here. No concealment logic exists for Date, same as Tag.
 */
export function renderDate(
  raw: string,
  getResolver: () => ResolveDate | undefined
): WidgetType | null {
  const match = scanDate(raw, 0);
  if (!match) {
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.isoDate) ?? fallbackDateResolution();
  return new DateWidget(match.isoDate, resolution);
}
