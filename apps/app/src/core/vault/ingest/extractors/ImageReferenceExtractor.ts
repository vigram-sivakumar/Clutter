import { allCodeRanges, isInsideAnyRange } from './markdownCodeRanges';

/**
 * Standard Markdown image sources — the `src` of every `![alt](src)` — in
 * document order, exactly as written (a title is dropped; `<...>` brackets
 * are removed). Whether a source is a vault file or a remote URL is for the
 * consumer to decide: this only finds them. Wikilink embeds (`![[...]]`) are
 * the `EmbedExtractor`'s, and anything inside code is ignored.
 *
 * A destination may contain raw spaces (`![x](my photo.png)`) — Clutter's
 * editor grammar accepts them — so the destination runs to the closing paren.
 */
const IMAGE = /!\[(?!\[)[^\]]*\]\(([^)\n]*)\)/g;
const TRAILING_TITLE = /\s+(?:"[^"]*"|'[^']*')\s*$/;

export class ImageReferenceExtractor {
  extract(content: string): readonly string[] {
    if (!content.includes('![')) {
      return [];
    }

    const code = allCodeRanges(content);
    const sources: string[] = [];

    for (const match of content.matchAll(IMAGE)) {
      if (isInsideAnyRange(match.index ?? 0, code)) {
        continue;
      }

      let destination = (match[1] ?? '').trim().replace(TRAILING_TITLE, '').trim();

      if (destination.startsWith('<') && destination.endsWith('>')) {
        destination = destination.slice(1, -1).trim();
      }

      if (destination) {
        sources.push(destination);
      }
    }

    return sources;
  }
}
