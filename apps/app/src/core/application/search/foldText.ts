/**
 * Case- and diacritic-insensitive folding for search, done on a DERIVED copy of the text.
 *
 * The source string is never normalized: folding can change the length of the text (a ligature
 * `ﬁ` folds to `fi`, `½` to three characters, a Hangul syllable to its jamo, a combining mark to
 * nothing), so an index into the folded string is not an index into the original. A fold therefore
 * carries `breaks`, which records exactly the source code points whose folded length differs from
 * their own, and `sourceRangeOf` is the only way to turn a folded range into a source range (always
 * whole code points, never a lone surrogate or a stranded combining mark).
 *
 * Folding is per code point, so it is context-free: the query and the text fold identically and a
 * match found in the folded text is a match of those very source characters.
 */
export interface FoldedText {
  readonly text: string;
  /**
   * Where the fold stops being the identity on indices, as flat quadruples
   * `foldStart, sourceStart, foldLength, sourceLength` — one per source code point whose folded
   * length differs from its own, in order. Every other code point folds to the same number of units,
   * so between breaks a folded index is a source index plus a constant. `null` when no code point
   * changed length (pure ASCII, but also text like `Café`, whose `é` folds to one unit): the fold is
   * then the identity and nothing needs to be stored. A text pays for its few length-changing
   * characters, never for its length.
   */
  readonly breaks: Int32Array | null;
}

const NON_ASCII = /[^\x00-\x7f]/;
const MARKS = /\p{M}/gu;
const MARK = /^\p{M}$/u;

function foldCodePoint(char: string): string {
  const folded = char.normalize('NFKD').replace(MARKS, '').toLowerCase();

  // Final sigma lower-cases to a different letter than medial sigma only when the whole word is
  // known; folding it to the medial form keeps the fold context-free.
  return folded === 'ς' ? 'σ' : folded;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Number of UTF-16 units of the code point starting at `index`. */
function codePointLength(text: { readonly length: number; charCodeAt(index: number): number }, index: number): number {
  if (isHighSurrogate(text.charCodeAt(index)) && index + 1 < text.length && isLowSurrogate(text.charCodeAt(index + 1))) {
    return 2;
  }

  return 1;
}

/** What `sourceRangeOf` reads of the source text: a plain string, or a view that never materializes one. */
export interface TextLike {
  readonly length: number;
  charCodeAt(index: number): number;
  slice(from: number, to: number): string;
}

export function foldText(source: string): FoldedText {
  if (!NON_ASCII.test(source)) {
    return { text: source.toLowerCase(), breaks: null };
  }

  const pieces: string[] = [];
  const breaks: number[] = [];
  let foldedLength = 0;

  for (let index = 0; index < source.length; ) {
    const length = codePointLength(source, index);
    const folded = foldCodePoint(source.slice(index, index + length));

    if (folded.length !== length) {
      breaks.push(foldedLength, index, folded.length, length);
    }

    pieces.push(folded);
    foldedLength += folded.length;
    index += length;
  }

  return { text: pieces.join(''), breaks: breaks.length > 0 ? Int32Array.from(breaks) : null };
}

const NON_ASCII_RUN = /[^\x00-\x7f]+/g;

/**
 * Just the folded string — for a query, or a prefilter that never needs to map back. Always equal to
 * `foldText(source).text`, but ASCII runs are lower-cased in one call and only the non-ASCII runs are folded one
 * code point at a time, which is what makes folding a whole vault's bodies affordable.
 */
export function foldString(source: string): string {
  if (!NON_ASCII.test(source)) {
    return source.toLowerCase();
  }

  const pieces: string[] = [];
  let cursor = 0;

  for (const run of source.matchAll(NON_ASCII_RUN)) {
    pieces.push(source.slice(cursor, run.index).toLowerCase());

    for (let index = 0; index < run[0].length; ) {
      const length = codePointLength(run[0], index);

      pieces.push(foldCodePoint(run[0].slice(index, index + length)));
      index += length;
    }

    cursor = run.index + run[0].length;
  }

  pieces.push(source.slice(cursor).toLowerCase());

  return pieces.join('');
}

/** The source index the folded index `index` belongs to (the start of its code point when inside a length change). */
export function foldedIndexToSource(breaks: Int32Array | null, index: number): number {
  if (!breaks) {
    return index;
  }

  // The last break that starts at or before `index`.
  let low = 0;
  let high = breaks.length / 4 - 1;

  if (high < 0 || breaks[0]! > index) {
    return index;
  }

  while (low < high) {
    const middle = (low + high + 1) >> 1;

    if (breaks[middle * 4]! <= index) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  const foldStart = breaks[low * 4]!;
  const sourceStart = breaks[low * 4 + 1]!;
  const foldLength = breaks[low * 4 + 2]!;
  const sourceLength = breaks[low * 4 + 3]!;

  return index < foldStart + foldLength
    ? sourceStart // inside the folded form of one source code point
    : index + (sourceStart + sourceLength) - (foldStart + foldLength); // after it: identity again, shifted
}

/**
 * The source range covered by the folded range `[from, to)` of `folded` (built from `source`):
 * whole code points, widened to include any combining marks that follow the last one (the folded
 * text drops them, so a match on `e` of `é` written as `e` + U+0301 must cover both characters).
 */
export function sourceRangeOf(
  folded: FoldedText,
  source: TextLike,
  from: number,
  to: number
): { readonly from: number; readonly to: number } {
  let sourceFrom = foldedIndexToSource(folded.breaks, from);

  // Between breaks the map is by unit, so a position can land on the second half of a surrogate pair.
  if (sourceFrom > 0 && isLowSurrogate(source.charCodeAt(sourceFrom)) && isHighSurrogate(source.charCodeAt(sourceFrom - 1))) {
    sourceFrom--;
  }

  const lastIndex = foldedIndexToSource(folded.breaks, to - 1);
  let sourceTo = lastIndex + codePointLength(source, lastIndex);

  while (sourceTo < source.length) {
    const length = codePointLength(source, sourceTo);

    if (!MARK.test(source.slice(sourceTo, sourceTo + length))) {
      break;
    }

    sourceTo += length;
  }

  return { from: sourceFrom, to: sourceTo };
}
