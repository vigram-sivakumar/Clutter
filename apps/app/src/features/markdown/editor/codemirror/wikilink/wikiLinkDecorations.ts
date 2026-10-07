import type { WidgetType } from '@codemirror/view';

import { scanWikiLink } from '../../../../../core/vault/ingest/grammar/wikiLinkScanner';
import { fallbackWikiLinkResolution, type ResolveWikiLink } from './wikiLinkResolution';
import { WikiLinkWidget } from './WikiLinkWidget';

/**
 * WikiLink's own at-rest rendering fact: given the node's raw matched
 * text and a resolver getter, produce the widget to show — or `null` to
 * skip decorating this occurrence this pass (only possible if the buffer
 * changed out from under a stale tree between parse and this call; the
 * next reparse corrects it).
 *
 * Registered as a Phase 3 participant renderer in
 * `inlineLivePreviewParticipants.ts` via `widgetReplaceRenderer` — this
 * function owns only the WikiLink-specific facts (scanning, resolution,
 * widget construction), per ODR §4.5; it has no opinion on engagement,
 * tree traversal, or atomic-range membership, all of which are the
 * shared mechanism's responsibility (docs/editor-research/inline-live-preview-region-odr-v1.md).
 *
 * An empty or whitespace-only path (`[[]]`, `[[ ]]` — both valid,
 * well-formed WikiLink syntax) also returns `null`, same as a stale-tree
 * miss: every resolution path (a real resolver's `unresolved` branch,
 * `fallbackWikiLinkResolution`) derives `displayLabel` from this same
 * empty path, producing a widget with empty `textContent` — present in
 * the DOM, atomic, but visually indistinguishable from nothing at all.
 * Declining to decorate it here leaves it as ordinary raw, editable text
 * in every state (engaged or not — the engaged branch already leaves
 * WikiLink text completely undecorated regardless of path), so an
 * in-progress or intentionally empty WikiLink is never silently invisible.
 */
export function renderWikiLink(
  raw: string,
  getResolver: () => ResolveWikiLink | undefined,
  extraClasses: readonly string[] = []
): WidgetType | null {
  const match = scanWikiLink(raw, 0);
  if (!match || !match.path.trim()) {
    return null;
  }

  const resolver = getResolver();
  const resolution = resolver?.(match.path, match.alias) ?? fallbackWikiLinkResolution(match.path);
  return new WikiLinkWidget(match.path, match.alias, resolution, extraClasses);
}

/**
 * Marker-color unification: WikiLink's `[[`/`|`/`]]` punctuation, as
 * node-relative `[from, to)` ranges, for painting via the shared
 * `cm-marker` contract while engaged (raw source revealed). WikiLink is a
 * flat leaf node (`wikiLinkSyntax.ts`'s `defineNodes: ['WikiLink']`, no
 * mark child nodes at all) — unlike Emphasis/Link/Autolink, its punctuation
 * positions exist only inside `scanWikiLink`'s own match, never as tree
 * children, so this reuses that same scan (already run once per occurrence
 * for the at-rest widget) rather than introducing a second, independent
 * notion of where WikiLink's brackets are.
 *
 * `match.pipeIndex` is `null` when the WikiLink carries no local alias — no
 * separator range in that case, matching every other marker set's "only
 * emit a range for punctuation that's actually present" convention (e.g.
 * `getHeadingMarkRanges`'s own optional separator-space range).
 */
export function getWikiLinkMarkerRanges(raw: string): readonly { from: number; to: number }[] {
  const match = scanWikiLink(raw, 0);
  if (!match) {
    return [];
  }

  const ranges = [{ from: 0, to: 2 }];
  if (match.pipeIndex !== null) {
    ranges.push({ from: match.pipeIndex, to: match.pipeIndex + 1 });
  }
  ranges.push({ from: match.end - 2, to: match.end });
  return ranges;
}
