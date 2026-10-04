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
const IMAGE = /!\[(?!\[)([^\]]*)\]\(([^)\n]*)\)/g;
const TRAILING_TITLE = /\s+(?:"[^"]*"|'[^']*')\s*$/;

/**
 * Splits the text between an image's parens into the destination and where it
 * sits in that text — the same reading `extract` does (title dropped, `<...>`
 * removed), but keeping the offsets so the destination alone can be replaced.
 */
function locateDestination(raw: string): { text: string; start: number } | null {
  const leading = raw.length - raw.trimStart().length;
  const body = raw.trim().replace(TRAILING_TITLE, '').trim();
  const bracketed = body.startsWith('<') && body.endsWith('>');
  const text = bracketed ? body.slice(1, -1).trim() : body;

  if (!text) {
    return null;
  }

  return { text, start: leading + raw.slice(leading).indexOf(text) };
}

export class ImageReferenceExtractor {
  /**
   * `content` with every standard image whose source is exactly `from` now
   * pointing at `to`. Only the destination changes — alt text, title and
   * `<...>` brackets stay as written — and anything inside code is untouched.
   */
  replaceSource(content: string, from: string, to: string): string {
    if (!content.includes(from)) {
      return content;
    }

    const code = allCodeRanges(content);
    let result = content;
    const matches = [...content.matchAll(IMAGE)].reverse();

    for (const match of matches) {
      const index = match.index ?? 0;

      if (isInsideAnyRange(index, code)) {
        continue;
      }

      const raw = match[2] ?? '';
      const destination = locateDestination(raw);

      if (!destination || destination.text !== from) {
        continue;
      }

      const rawStart = index + match[0].length - 1 - raw.length;
      const start = rawStart + destination.start;

      result = result.slice(0, start) + to + result.slice(start + from.length);
    }

    return result;
  }

  /**
   * Every standard image with its display (alt) text and source, in document
   * order — `![display text](src)` -> `{ alt: 'display text', src }`. Same
   * rules as `extract` (code is ignored, titles and `<...>` dropped); the alt
   * text is exactly as typed, trimmed.
   */
  extractImages(content: string): readonly { readonly alt: string; readonly src: string }[] {
    if (!content.includes('![')) {
      return [];
    }

    const code = allCodeRanges(content);
    const images: { alt: string; src: string }[] = [];

    for (const match of content.matchAll(IMAGE)) {
      if (isInsideAnyRange(match.index ?? 0, code)) {
        continue;
      }

      const destination = locateDestination(match[2] ?? '');

      if (destination) {
        images.push({ alt: (match[1] ?? '').trim(), src: destination.text });
      }
    }

    return images;
  }

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

      let destination = (match[2] ?? '').trim().replace(TRAILING_TITLE, '').trim();

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
