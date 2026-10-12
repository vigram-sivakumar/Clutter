/**
 * Work limit for a reference preview, not a visual contract (the preview's own max-height clips what is left).
 * A line over it is not extracted: the caller falls back to the compact one-line rendering instead of building
 * an editor view around a very long line.
 */
export const MAX_REFERENCE_LINE_CHARS = 1500;

const EMBED = /!\[\[/;

/**
 * Whether `text` holds an embed (`![[...]]`). The editor renders an embed's content, which a reference never
 * shows, so such text is not previewed in the editor.
 */
export function containsEmbed(text: string): boolean {
  return EMBED.test(text);
}

/** A reference's line: where it starts (its identity within the page) and what to preview of it. */
export interface ReferenceLine {
  /** Offset of the start of the line — equal for every reference on the same line. */
  readonly from: number;
  /**
   * The line as its own document, for the editor preview, or `null` when it should not be previewed in the
   * editor: it holds an embed, or it is over the work limit. The caller then shows the compact rendering.
   *
   * Only the line itself — never the rest of the paragraph, list or quote it belongs to — verbatim apart from
   * its leading indentation, which is dropped so a nested list item (or an indented continuation line) reads
   * as a top-level one instead of as an indented code block. Every inline construct on it (styles, wiki links,
   * tags, dates, links) is parsed and decorated by the editor's own pipeline exactly as it is in the note, and
   * a list, quote or heading marker on the line keeps its block formatting.
   */
  readonly text: string | null;
}

/** The line of `markdown` containing `offset` (a reference's position in it). */
export function extractReferenceLine(
  markdown: string,
  offset: number
): ReferenceLine {
  const from = markdown.lastIndexOf('\n', offset - 1) + 1;
  const end = markdown.indexOf('\n', offset);
  const text = markdown.slice(from, end === -1 ? markdown.length : end).trim();

  return {
    from,
    text:
      text.length === 0 ||
      text.length > MAX_REFERENCE_LINE_CHARS ||
      containsEmbed(text)
        ? null
        : text,
  };
}
