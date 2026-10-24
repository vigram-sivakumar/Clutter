import { tagParser } from '../../vault/ingest/tag/tagParser';

/**
 * A note's VISIBLE text — what a reader sees, minus the Markdown syntax around it — together with the map back
 * to the Markdown it came from.
 *
 * `text` is the source with the syntax removed: formatting delimiters, link and image destinations and titles,
 * reference definitions, fence info strings, table pipes, task markers, comments and HTML tags are left out; text
 * (code included) is kept. Because nothing but removal is done, `text` is a concatenation of verbatim source
 * slices, recorded as `segments` — flat pairs of `visibleStart, sourceStart`, one per slice, followed by a final
 * pair whose `visibleStart` is the total length (a slice's length is the next `visibleStart` minus its own). A
 * visible offset maps to a source offset by finding its segment, so a match never needs the source to be re-scanned
 * or normalized. `text` itself is transient: what is kept per note is `segments` and a `VisibleView` over them.
 *
 * Line breaks are kept (they are source characters), so `text` has the source's lines; a match never spans one.
 * The input must already be line-ending-normalized with `normalizeLineEndings`: the editor's document has no CR,
 * and every offset reported here is an offset into that document.
 */
export interface VisibleText {
  readonly text: string;
  readonly segments: Int32Array;
}

/** The editor document's own line splitting (CM6 splits on `\r\n?|\n`), so offsets here are offsets there. */
export function normalizeLineEndings(markdown: string): string {
  return markdown.includes('\r') ? markdown.replace(/\r\n?/g, '\n') : markdown;
}

/**
 * Nodes whose whole range is not visible text. The node names are Lezer's (`@lezer/markdown`) and Clutter's own
 * grammar's (`markdownGrammarExtensions`); every `*Mark` node is excluded separately (see `isMark`).
 */
const EXCLUDED_NODES: ReadonlySet<string> = new Set([
  'LinkReference', // `[ref]: destination` definitions
  'LinkTitle',
  'LinkLabel', // the `[ref]` of `[text][ref]`
  'CodeInfo', // the fence's language tag
  'HTMLTag',
  'HTMLBlock',
  'Comment',
  'CommentBlock',
  'ProcessingInstruction',
  'TaskMarker',
  'TaskCompletionMetadata',
  'TableDelimiter',
  'HorizontalRule',
  'WavyHorizontalRule',
  'DoubleHorizontalRule',
  'DottedHorizontalRule',
  'LabeledHorizontalRule',
]);

/** A URL is a destination — not text — only inside these; a bare URL or an `<autolink>` is what the reader sees. */
const DESTINATION_PARENTS: ReadonlySet<string> = new Set(['Link', 'Image', 'LinkReference']);

function isMark(name: string): boolean {
  return name.endsWith('Mark');
}

type Range = readonly [from: number, to: number];

/** Index of the first unescaped `|` in `markdown[from, to)`, or -1. */
function unescapedPipe(markdown: string, from: number, to: number): number {
  for (let index = from; index < to; index++) {
    const char = markdown[index];

    if (char === '\\') {
      index++;
    } else if (char === '|') {
      return index;
    }
  }

  return -1;
}

/** `[[target|alias]]` / `![[target|alias]]`: the brackets and, when there is an alias, the target are not shown. */
function excludeWikiLink(markdown: string, from: number, to: number, opening: number, out: Range[]): void {
  if (to - from < opening + 2 || markdown.slice(to - 2, to) !== ']]') {
    out.push([from, Math.min(from + opening, to)]);
    return;
  }

  out.push([from, from + opening]);
  out.push([to - 2, to]);

  const pipe = unescapedPipe(markdown, from + opening, to - 2);

  if (pipe >= 0) {
    out.push([from + opening, pipe + 1]);
  }
}

export function buildVisibleText(markdown: string): VisibleText {
  const excluded: Range[] = [];

  tagParser.parse(markdown).iterate({
    enter: (node) => {
      const { name, from, to } = node;

      if (isMark(name) || EXCLUDED_NODES.has(name)) {
        excluded.push([from, to]);
        return false;
      }

      if (name === 'URL') {
        if (node.node.parent && DESTINATION_PARENTS.has(node.node.parent.name)) {
          excluded.push([from, to]);
        }
        return false;
      }

      if (name === 'Escape') {
        // `\*` shows `*`; a backslash at a line end (a hard break) shows nothing.
        excluded.push([from, from + 1]);
        return false;
      }

      if (name === 'WikiLink') {
        excludeWikiLink(markdown, from, to, 2, excluded);
        return false;
      }

      if (name === 'Embed') {
        excludeWikiLink(markdown, from, to, 3, excluded);
        return false;
      }

      if (name === 'Tag') {
        // `#design` reads as "design": the sigil is syntax, the word is text.
        excluded.push([from, from + 1]);
        return false;
      }

      return undefined;
    },
  });

  excluded.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const pieces: string[] = [];
  const segments: number[] = [];
  let visibleLength = 0;
  let cursor = 0;

  const keep = (from: number, to: number): void => {
    if (to <= from) {
      return;
    }

    pieces.push(markdown.slice(from, to));
    segments.push(visibleLength, from);
    visibleLength += to - from;
  };

  for (const [from, to] of excluded) {
    if (from > cursor) {
      keep(cursor, from);
    }

    cursor = Math.max(cursor, to);
  }

  keep(cursor, markdown.length);
  segments.push(visibleLength, 0);

  return { text: pieces.join(''), segments: Int32Array.from(segments) };
}

/**
 * The index of the segment holding visible offset `offset` (the last segment starting at or before it).
 */
function segmentIndexAt(segments: Int32Array, offset: number): number {
  let low = 0;
  let high = segments.length / 2 - 2; // the last pair is the end sentinel, not a segment

  while (low < high) {
    const middle = (low + high + 1) >> 1;

    if (segments[middle * 2]! <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
}

/**
 * The source range covering the visible range `[from, to)` (non-empty): from the source position of its first
 * character to just past the source position of its last one. A match that crosses removed syntax — a word split by
 * `**` — therefore covers that syntax too, which is the honest extent of the text in the document.
 */
export function visibleRangeToSource(
  visible: { readonly segments: Int32Array },
  from: number,
  to: number
): { readonly from: number; readonly to: number } {
  const { segments } = visible;
  const first = segmentIndexAt(segments, from);
  const last = segmentIndexAt(segments, to - 1);

  return {
    from: segments[first * 2 + 1]! + (from - segments[first * 2]!),
    to: segments[last * 2 + 1]! + (to - 1 - segments[last * 2]!) + 1,
  };
}

/**
 * The visible text, read straight out of the Markdown through the segment map — so the visible string itself never
 * has to be kept (it is a second copy of the note). Implements what `sourceRangeOf` and snippet building read.
 */
export class VisibleView {
  readonly length: number;

  constructor(
    private readonly markdown: string,
    readonly segments: Int32Array
  ) {
    this.length = segments[segments.length - 2]!;
  }

  charCodeAt(index: number): number {
    if (index < 0 || index >= this.length) {
      return Number.NaN;
    }

    const segment = segmentIndexAt(this.segments, index);

    return this.markdown.charCodeAt(this.segments[segment * 2 + 1]! + (index - this.segments[segment * 2]!));
  }

  slice(from: number, to: number): string {
    const end = Math.min(to, this.length);

    if (from >= end) {
      return '';
    }

    const { segments } = this;
    let segment = segmentIndexAt(segments, from);
    let out = '';

    for (let position = from; position < end; segment++) {
      const segmentStart = segments[segment * 2]!;
      const segmentEnd = segments[(segment + 1) * 2]!;
      const stop = Math.min(end, segmentEnd);
      const sourceStart = segments[segment * 2 + 1]! + (position - segmentStart);

      out += this.markdown.slice(sourceStart, sourceStart + (stop - position));
      position = stop;
    }

    return out;
  }
}
