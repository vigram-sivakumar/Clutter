import { tagParser } from './tagParser';

/** One `#tag` in a Markdown string, located by the parse tree — never by a text search. */
export interface TagSpan {
  /** Exactly as typed, without the `#`. */
  readonly name: string;
  /** Offset of the `#`. */
  readonly startOffset: number;
  /** Exclusive end offset. */
  readonly endOffset: number;
}

/**
 * Every tag in `markdown`, in document order: the `Tag` nodes of one parse
 * with the shared grammar. Code (fenced, inline, indented-if-enabled),
 * escapes (`\#x`), URLs, heading markers and mid-word `#` never produce a
 * `Tag` node, so none of them can appear here.
 */
export function findTagOccurrences(markdown: string): readonly TagSpan[] {
  const spans: TagSpan[] = [];

  tagParser.parse(markdown).iterate({
    enter(node) {
      if (node.name === 'Tag') {
        spans.push({
          name: markdown.slice(node.from + 1, node.to),
          startOffset: node.from,
          endOffset: node.to,
        });
      }
    },
  });

  return spans;
}
