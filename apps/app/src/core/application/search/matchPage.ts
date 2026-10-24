import { foldString, foldText, foldedIndexToSource, sourceRangeOf, type FoldedText } from './foldText';
import { VisibleView, buildVisibleText, normalizeLineEndings, visibleRangeToSource } from './visibleText';

/**
 * Pure matching for one page: query parsing, relevance scoring, and snippet building. No Vault, no React, no I/O —
 * `SearchService` feeds it text and orders what it returns.
 *
 * The aim is to put the page the user is most likely looking for first, not the page with the most occurrences:
 *
 *  - A page matches when EVERY query word is found (case- and diacritic-insensitively). A word of one or two letters
 *    is a word the user is probably still typing, so it only matches at the START of a word (`New n` finds "New note",
 *    not every `n`); a longer word may also match inside a word, though less well.
 *  - WHERE a page matches is the main signal. Each place has a baseline, far enough apart that the order is: an exact
 *    title match (exact, prefix, word prefix, substring) → a close title match → an exact alias → a close alias → the
 *    phrase in a heading or the body → words near each other in the body → the weakest body matches and tags. Within a
 *    place, a score from how well the query matches there (exact, prefix, a phrase at a word start, the words apart)
 *    and how close together the words are separates the pages. Recency adds at most five points, so it only
 *    breaks ties and can never lift a page into the place above.
 *  - It is a score, not a list of buckets: the baselines and the quality points are plain numbers (below), so a
 *    different balance is a change of numbers, and every ranking is deterministic.
 *  - Repeating a word never raises a score: a note that says "meeting" a hundred times does not outrank one titled
 *    "Meeting notes".
 *
 * Titles and aliases (only) are also matched TOLERATING A TYPO: a word of three or more letters may be one edit away
 * (a substitution, an insertion, a deletion or a swap of two neighbours) from a word of the title or alias, provided
 * it starts with the same letter. A close match always ranks below an exact match in the same place, and never
 * applies to one- or two-letter words, headings, tags or the body. There are no operators.
 */

export type MatchClass = 'title' | 'alias' | 'heading' | 'tag' | 'body' | 'mixed';

/**
 * A score is `baseline of the place + quality points + proximity points + recency points`. The quality and proximity
 * points are at most 65 together (`WEIGHT_QUALITY * 100 + WEIGHT_PROXIMITY * 100`) and recency at most 5, so two
 * baselines 80 or more apart never cross; the ones below keep each place above the next whatever the details.
 */
const WEIGHT_QUALITY = 0.45;
const WEIGHT_PROXIMITY = 0.2;
const WEIGHT_RECENCY = 0.05;

const BASE = {
  title: 600,
  /** Below the weakest exact title (620) even with recency: an exact title always outranks a close one. */
  titleClose: 580,
  alias: 500,
  aliasClose: 480,
  /** A tag: above anything the body can offer, below an alias (even a close one). */
  tag: 400,
  /** A heading, and the phrase as typed in the body. */
  heading: 330,
  bodyPhrase: 330,
  /** All the words on one line, near each other. */
  bodyNear: 320,
  /** All the words in the body but never together. */
  bodySpread: 250,
  /** The words spread over several places (a title word and a body word, say). */
  mixed: 230,
} as const;

/** A recently edited note counts for half as much after this many days (only ever a small tie-breaker). */
const RECENCY_HALF_LIFE_DAYS = 30;

/** Words shorter than this only match at the start of a word. */
const SHORT_WORD = 3;

/** A query this long (in characters, whitespace not counted) searches every field; a shorter one only titles. */
const MIN_FULL_QUERY_LENGTH = 3;

const MAX_QUERY_TOKENS = 8;
const SNIPPET_LIMIT = 3;
const SNIPPET_CHARS = 110;
const MAX_POSITIONS_PER_TOKEN = 30;
const MAX_MATCHES_PER_TOKEN = 200;
/** Query words further apart than this are not "close together". */
const NEAR_LIMIT = 200;

export interface ParsedQuery {
  /** Folded, distinct, non-empty words. */
  readonly tokens: readonly string[];
  /** The words joined by one space — what an exact or prefix match is measured against. */
  readonly phrase: string;
  /** Each word with Markdown punctuation removed, for the raw-text prefilter (see `BodyText.mayContain`). */
  readonly prefilterTokens: readonly string[];
  /** The prefilter words joined by one space (empty words left out). */
  readonly prefilterPhrase: string;
  /** A word is the beginning of another (`new n`): the same text could satisfy both, so they must be placed apart. */
  readonly overlapping: boolean;
  /** At least one word is long enough for a typo to be tolerated in it (and the query as a whole is not too short). */
  readonly allowsClose: boolean;
  /**
   * The query has fewer than three characters (whitespace not counted, after folding): it is searched in titles only,
   * and never with typo tolerance — one or two letters are a start, not yet a query about anything else.
   */
  readonly titleOnly: boolean;
}

export function parseQuery(raw: string): ParsedQuery | null {
  const folded = foldString(raw);
  const tokens = [...new Set(folded.split(/\s+/).filter(Boolean))].slice(0, MAX_QUERY_TOKENS);

  if (tokens.length === 0) {
    return null;
  }

  const prefilterTokens = tokens.map(stripSyntaxCharacters);
  const titleOnly = Array.from(folded.replace(/\s+/g, '')).length < MIN_FULL_QUERY_LENGTH;

  return {
    tokens,
    phrase: tokens.join(' '),
    prefilterTokens,
    prefilterPhrase: prefilterTokens.filter(Boolean).join(' '),
    allowsClose: !titleOnly && tokens.some((token) => token.length >= SHORT_WORD),
    titleOnly,
    overlapping: tokens.some((token, index) => tokens.some((other, otherIndex) => index !== otherIndex && other.startsWith(token))),
  };
}

/**
 * The characters Markdown uses to delimit text inside a word (`bo**ld**`, `` `a`b ``, `[[a|b]]`, `\*`). The raw
 * prefilter text has them removed, so a word split by formatting still contains the query word there.
 */
const SYNTAX_CHARACTERS = /[*_~=`[\]()|\\!<>]/g;

/**
 * `text` without the delimiter characters, built by joining the pieces between them — which always yields one flat
 * string. (`text.replace(regex, '')` returns a rope of slices that keeps `text` alive and, left unflattened, costs
 * about twice the string's size in nodes for as long as it is held.)
 */
function stripSyntaxCharacters(text: string): string {
  const pieces: string[] = [];
  let last = 0;

  for (const match of text.matchAll(SYNTAX_CHARACTERS)) {
    if (match.index > last) {
      pieces.push(text.slice(last, match.index));
    }

    last = match.index + 1;
  }

  if (last === 0) {
    return text;
  }

  pieces.push(text.slice(last));

  return pieces.join('');
}

/**
 * One page's body, prepared for matching. Built once per immutable revision, and in two lazy steps so a note pays
 * only for what a query needs of it:
 *
 *  1. `prefilter` — the folded Markdown with delimiter characters removed: one flat string, made on first use.
 *  2. `visible` — the visible text's source map and folded copy: made only for a page a query has to confirm.
 *
 * Nothing here copies the Markdown: `raw` is the page's own string (or the open session's), the visible text is read
 * back out of it through the segment map rather than kept, and the normalized copy (`markdown`) exists only for a
 * body that actually contains carriage returns.
 */
export class BodyText {
  private readonly raw: string;
  private cachedPrefilter: string | undefined;
  private cachedMarkdown: string | undefined;
  private built: { readonly visible: VisibleView; readonly folded: FoldedText } | undefined;

  constructor(markdown: string) {
    this.raw = markdown;
  }

  /** The Markdown with the editor document's line endings — every reported range is an offset into this text. */
  get markdown(): string {
    this.cachedMarkdown ??= normalizeLineEndings(this.raw);

    return this.cachedMarkdown;
  }

  /**
   * The Markdown, folded, with delimiter characters removed: a cheap, parse-free necessary condition (see
   * `mayContain`). Visible text is a subsequence of the Markdown, so a visible word whose characters were split only
   * by delimiters is a substring of this.
   */
  get prefilter(): string {
    this.cachedPrefilter ??= stripSyntaxCharacters(foldString(this.raw));

    return this.cachedPrefilter;
  }

  /** Whether the body could contain `token` (never false for a body that does, may be true for one that does not). */
  mayContain(prefilterToken: string): boolean {
    return prefilterToken === '' || this.prefilter.includes(prefilterToken);
  }

  /** The visible text (as a view) and its folded copy — the expensive step (a Markdown parse), run only for real candidates. */
  get visible(): { readonly visible: VisibleView; readonly folded: FoldedText } {
    this.built ??= (() => {
      const markdown = this.markdown;
      const visible = buildVisibleText(markdown);

      return { visible: new VisibleView(markdown, visible.segments), folded: foldText(visible.text) };
    })();

    return this.built;
  }
}

export interface FoldedMeta {
  /** Folded text the title is searched by (a Daily Note's date spellings included). */
  readonly title: string;
  readonly aliases: readonly string[];
  /** The page's headings, folded. */
  readonly headings: readonly string[];
  /** Tags folded, with `-`/`_` runs as spaces — `product-design` is found by `product design`. */
  readonly tags: readonly string[];
}

export interface Classification {
  readonly cls: MatchClass;
  /** The relevance score, higher is better. For a page that still has to be confirmed, the score it will have. */
  readonly score: number;
  /** The body still has to be parsed to confirm this page (a body or mixed candidate). */
  readonly pendingBody: boolean;
  /** The match needed a typo tolerated ("close match"). */
  readonly fuzzy: boolean;
  /** What the page is worth if confirming its body shows the body does not match after all. */
  readonly fallback?: Classification;
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

function isWordCharacter(char: string | undefined): boolean {
  if (char === undefined) {
    return false;
  }

  const code = char.charCodeAt(0);

  // ASCII is decided by arithmetic: this runs once per occurrence of a one-letter word, thousands of times a query.
  return code < 128 ? (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) : WORD_CHARACTER.test(char);
}

/** Whether `index` in `text` is the start of a word. */
function atWordStart(text: string, index: number): boolean {
  return index === 0 || !isWordCharacter(text[index - 1]);
}

const wordStartPatterns = new Map<string, RegExp>();

/** A pattern for `token` at the start of a word (global, so callers set `lastIndex`); one per distinct word, kept. */
function wordStartPattern(token: string): RegExp {
  let pattern = wordStartPatterns.get(token);

  if (!pattern) {
    // Only ever built for words of one or two letters typed in a query, so the table stays tiny.
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gu');
    wordStartPatterns.set(token, pattern);
  }

  return pattern;
}

function startsAWord(text: string, token: string): boolean {
  if (token.length < SHORT_WORD) {
    const pattern = wordStartPattern(token);

    pattern.lastIndex = 0;

    return pattern.test(text);
  }

  for (let at = text.indexOf(token); at >= 0; at = text.indexOf(token, at + 1)) {
    if (atWordStart(text, at)) {
      return true;
    }
  }

  return false;
}

/** Whether the folded `token` matches in `text`: a short word at the start of a word, a longer one anywhere. */
export function tokenMatches(text: string, token: string): boolean {
  return token.length < SHORT_WORD ? startsAWord(text, token) : text.includes(token);
}

interface FieldMatch {
  /** 0–100: how well the query matches (exact, prefix, a phrase, the words apart). */
  readonly quality: number;
  /** 0–100: how close together the words are. */
  readonly proximity: number;
  /** At least one word matched only by tolerating a typo. */
  readonly fuzzy?: true;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Positions where `token` occurs in `text`, at most `cap`, as the matching rule allows (word starts only for a short word). */
function positionsOf(text: string, token: string, cap: number): number[] {
  const positions: number[] = [];

  if (token.length < SHORT_WORD) {
    const pattern = wordStartPattern(token);

    pattern.lastIndex = 0;

    for (let match = pattern.exec(text); match && positions.length < cap; match = pattern.exec(text)) {
      positions.push(match.index);
    }

    return positions;
  }

  for (let at = text.indexOf(token); at >= 0 && positions.length < cap; at = text.indexOf(token, at + 1)) {
    positions.push(at);
  }

  return positions;
}

/**
 * Gives every query word an occurrence of its own — two words never share a stretch of text, so `new n` is not
 * satisfied by the single word "new" — and measures how close together such a set can be. Null when no such set
 * exists; otherwise the length of the tightest window holding one, or `span: null` when the words are all present
 * but never close (or never on one line).
 */
function placeTokens(
  positionsByToken: readonly number[][],
  lengths: readonly number[],
  text: string,
  allowNewline: boolean
): { readonly span: number | null; readonly ordered: boolean } | null {
  let feasible = false;
  let best: number | null = null;
  let bestOrdered = true;

  for (const anchor of positionsByToken[0]!) {
    const taken: Array<readonly [number, number]> = [[anchor, anchor + lengths[0]!]];
    let start = anchor;
    let end = anchor + lengths[0]!;
    let ordered = true;
    let previous = anchor;
    let placed = true;

    for (let token = 1; token < positionsByToken.length && placed; token++) {
      let nearest: number | undefined;

      for (const position of positionsByToken[token]!) {
        const free = taken.every(([from, to]) => position + lengths[token]! <= from || position >= to);

        if (free && (nearest === undefined || Math.abs(position - anchor) < Math.abs(nearest - anchor))) {
          nearest = position;
        }
      }

      if (nearest === undefined) {
        placed = false;
        break;
      }

      taken.push([nearest, nearest + lengths[token]!]);
      start = Math.min(start, nearest);
      end = Math.max(end, nearest + lengths[token]!);
      ordered &&= nearest > previous;
      previous = nearest;
    }

    if (!placed) {
      continue;
    }

    feasible = true;

    const span = end - start;
    const newline = allowNewline ? -1 : text.indexOf('\n', start);

    if (span <= NEAR_LIMIT && !(newline >= 0 && newline < end) && (best === null || span < best)) {
      best = span;
      bestOrdered = ordered;
    }
  }

  return feasible ? { span: best, ordered: bestOrdered } : null;
}

/**
 * How close together words that do NOT form the phrase are: at most 70 (only the phrase itself scores 100, so a
 * contiguous phrase always beats the same words merely near each other), falling as they spread, never below 20.
 */
function proximityOf(span: number, phraseLength: number, ordered = true): number {
  const proximity = clamp(70 - (span - phraseLength) * 0.8, 20, 70);

  // The words in another order than typed are a looser match than the same words in order.
  return ordered ? proximity : Math.min(proximity, OUT_OF_ORDER_PROXIMITY);
}

/** The most proximity points words found in a different order than the query can earn. */
const OUT_OF_ORDER_PROXIMITY = 40;

/**
 * Matches the whole query against one short text (a title, an alias, a heading, a tag). Null unless every word
 * matches. A phrase at the start of the text beats one at the start of a word, which beats one inside a word; words
 * found apart come after, ordered by how close together they are.
 */
function matchField(text: string, query: ParsedQuery): FieldMatch | null {
  if (!query.tokens.every((token) => tokenMatches(text, token))) {
    return null;
  }

  const phrase = query.phrase;

  if (text === phrase) {
    return { quality: 100, proximity: 100 };
  }

  const first = text.indexOf(phrase);

  if (first === 0) {
    return { quality: 85, proximity: 100 };
  }

  for (let at = first; at >= 0; at = text.indexOf(phrase, at + 1)) {
    if (atWordStart(text, at)) {
      return { quality: 70, proximity: 100 };
    }
  }

  if (first >= 0) {
    return { quality: 55, proximity: 100 };
  }

  const positions = query.tokens.map((token) => positionsOf(text, token, MAX_POSITIONS_PER_TOKEN));
  const placed = placeTokens(positions, query.tokens.map((token) => token.length), text, true);

  if (!placed) {
    return null;
  }

  const everyWordStart = query.tokens.every((token) => startsAWord(text, token));

  return {
    quality: everyWordStart ? 60 : 35,
    proximity: placed.span === null ? 10 : proximityOf(placed.span, phrase.length, placed.ordered),
  };
}

/** Quality of a match that needed a typo tolerated — below any exact match, even a weak one. */
const FUZZY_QUALITY = 25;
/** Close matches never count as "words together" more than this: exact phrases must always be able to beat them. */
const FUZZY_MAX_PROXIMITY = 80;

/**
 * Whether `a` and `b` are at most one edit apart: one substitution, insertion, deletion, or swap of two adjacent
 * letters (Damerau–Levenshtein distance ≤ 1). Linear in the length, never builds a table.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }

  let index = 0;

  while (index < a.length && index < b.length && a[index] === b[index]) {
    index++;
  }

  if (index === a.length && index === b.length) {
    return true;
  }

  if (a.length === b.length) {
    return (
      a.slice(index + 1) === b.slice(index + 1) || // one letter replaced
      (a[index] === b[index + 1] && a[index + 1] === b[index] && a.slice(index + 2) === b.slice(index + 2)) // two swapped
    );
  }

  return a.length > b.length ? a.slice(index + 1) === b.slice(index) : b.slice(index + 1) === a.slice(index);
}

/**
 * How many edits a query word may be from a word it is meant to be: none for one or two letters, one for three to five,
 * two from six letters on (a short word has too little left after two edits to mean anything).
 */
function allowedEdits(length: number): 0 | 1 | 2 {
  return length < SHORT_WORD ? 0 : length <= 5 ? 1 : 2;
}

/**
 * Whether `a` and `b` are at most `max` (1 or 2) edits apart: substitutions, insertions, deletions and swaps of two
 * adjacent letters (the optimal-string-alignment form of Damerau–Levenshtein distance). The table is only as wide as
 * the words and the work stops as soon as a whole row is past `max`.
 */
export function withinEdits(a: string, b: string, max: 1 | 2): boolean {
  if (Math.abs(a.length - b.length) > max) {
    return false;
  }

  if (max === 1) {
    return withinOneEdit(a, b);
  }

  let beforePrevious: number[] | undefined;
  let previous = Array.from({ length: b.length + 1 }, (_, column) => column);

  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    let rowMinimum = row;

    for (let column = 1; column <= b.length; column++) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      let value = Math.min(previous[column]! + 1, current[column - 1]! + 1, previous[column - 1]! + cost);

      if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
        value = Math.min(value, beforePrevious![column - 2]! + 1);
      }

      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > max) {
      return false;
    }

    beforePrevious = previous;
    previous = current;
  }

  return previous[b.length]! <= max;
}

/** A word this long (or longer) may be a typo of the START of a longer word, not only of a whole word. */
const PARTIAL_TYPO_LENGTH = 5;

/** Whether `token` is a typo of `word`, or — for a longer token — of the start of it (the user may still be typing). */
function fuzzyWordMatches(token: string, word: string): boolean {
  const edits = allowedEdits(token.length);

  if (edits === 0 || token[0] !== word[0]) {
    return false;
  }

  if (withinEdits(token, word, edits)) {
    return true;
  }

  // Still typing a longer word: a typo in what has been typed so far — but only from five letters on. A short word
  // compared with the start of a longer one is mostly coincidence ("new" is one edit from "nes" of "nesting").
  if (token.length < PARTIAL_TYPO_LENGTH || word.length <= token.length) {
    return false;
  }

  for (let length = token.length - edits; length <= token.length + edits; length++) {
    if (length > 0 && length < word.length && withinEdits(token, word.slice(0, length), edits)) {
      return true;
    }
  }

  return false;
}

interface WordSpan {
  readonly text: string;
  readonly start: number;
}

const WORDS = /[\p{L}\p{N}]+/gu;

function wordsOf(text: string): WordSpan[] {
  return Array.from(text.matchAll(WORDS), (match) => ({ text: match[0], start: match.index }));
}

/** The words of a page's title, made once (the meta object lives as long as the page does): one lookup per page. */
const titleWords = new WeakMap<FoldedMeta, WordSpan[]>();

function cachedTitleWords(meta: FoldedMeta): WordSpan[] {
  let words = titleWords.get(meta);

  if (!words) {
    words = wordsOf(meta.title);
    titleWords.set(meta, words);
  }

  return words;
}

/**
 * Matches the query against a title or alias allowing typos: every word must match, each exactly (by the usual rule)
 * or as a typo of one of the text's words, and at least one by typo — an exact match is `matchField`'s. Null when any
 * word matches neither way, so a single close word can never carry a query whose other words are missing.
 */
function matchFieldFuzzy(words: readonly WordSpan[], text: string, query: ParsedQuery): FieldMatch | null {
  let typos = 0;
  let start = Number.POSITIVE_INFINITY;
  let end = 0;
  let ordered = true;
  let previousStart = -1;
  // Stretches of the text already given to a query word; only made once a word has been placed.
  let taken: number[] | undefined;
  const isFree = (from: number, to: number): boolean => {
    if (taken) {
      for (let index = 0; index < taken.length; index += 2) {
        if (!(to <= taken[index]! || from >= taken[index + 1]!)) {
          return false;
        }
      }
    }

    return true;
  };

  for (const token of query.tokens) {
    let from = -1;
    let to = -1;
    const short = token.length < SHORT_WORD;

    // An exact occurrence of its own, as the matching rule allows.
    for (let at = text.indexOf(token); at >= 0; at = text.indexOf(token, at + 1)) {
      if ((!short || atWordStart(text, at)) && isFree(at, at + token.length)) {
        from = at;
        to = at + token.length;
        break;
      }
    }

    if (from < 0) {
      if (short) {
        return null;
      }

      // A word of its own: the same word never serves two query words.
      let word: WordSpan | undefined;

      for (const candidate of words) {
        if (fuzzyWordMatches(token, candidate.text) && isFree(candidate.start, candidate.start + candidate.text.length)) {
          word = candidate;
          break;
        }
      }

      if (!word) {
        return null;
      }

      typos++;
      from = word.start;
      to = word.start + word.text.length;
    }

    (taken ??= []).push(from, to);
    start = Math.min(start, from);
    end = Math.max(end, to);
    ordered &&= from > previousStart;
    previousStart = from;
  }

  if (typos === 0) {
    return null;
  }

  return {
    quality: FUZZY_QUALITY,
    proximity: Math.min(FUZZY_MAX_PROXIMITY, proximityOf(end - start, query.phrase.length, ordered)),
    fuzzy: true,
  };
}

function score(match: FieldMatch, base: number): number {
  return base + WEIGHT_QUALITY * match.quality + WEIGHT_PROXIMITY * match.proximity;
}

/** 0–5 points for how recently the note was edited (a day-old note near 5, a year-old one near 0). */
export function recencyPoints(updatedMs: number, nowMs: number): number {
  if (!updatedMs) {
    return 0;
  }

  const ageDays = Math.max(0, nowMs - updatedMs) / 86_400_000;

  return WEIGHT_RECENCY * 100 * 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
}

/**
 * How well the body matches, judged on the raw prefilter text (so no Markdown parse is needed to order candidates):
 * the phrase as typed, the words close together on one line, or the words somewhere in the note. Null when a word
 * has no valid match there at all — notably a one- or two-letter word that only occurs inside other words.
 */
function bodyMatch(query: ParsedQuery, prefilter: string): (FieldMatch & { readonly base: number }) | null {
  const phrase = query.prefilterPhrase;

  if (phrase !== '' && phrase.length < SHORT_WORD) {
    // One unfinished short word: it counts only at the start of a word (one scan, however often the letter occurs).
    return startsAWord(prefilter, phrase) ? { quality: 70, proximity: 100, base: BASE.bodyPhrase } : null;
  } else if (phrase !== '') {
    const first = prefilter.indexOf(phrase);

    for (let at = first; at >= 0; at = prefilter.indexOf(phrase, at + 1)) {
      if (atWordStart(prefilter, at)) {
        return { quality: 70, proximity: 100, base: BASE.bodyPhrase };
      }
    }

    if (first >= 0 && query.tokens.every((token) => token.length >= SHORT_WORD)) {
      return { quality: 55, proximity: 100, base: BASE.bodyPhrase };
    }
  }

  const tokens = query.prefilterTokens.filter(Boolean);
  const positions = tokens.map((token) => positionsOf(prefilter, token, MAX_POSITIONS_PER_TOKEN));

  if (positions.some((found) => found.length === 0)) {
    return null;
  }

  const placed = placeTokens(positions, tokens.map((token) => token.length), prefilter, false);

  if (!placed) {
    return null;
  }

  const everyWordStart = tokens.every((_, index) => positions[index]!.some((at) => atWordStart(prefilter, at)));

  return placed.span === null
    ? { quality: 35, proximity: 10, base: BASE.bodySpread }
    : {
        quality: everyWordStart ? 60 : 35,
        proximity: proximityOf(placed.span, query.prefilterPhrase.length, placed.ordered),
        base: BASE.bodyNear,
      };
}

export function metaIncludes(meta: FoldedMeta, token: string): boolean {
  return (
    tokenMatches(meta.title, token) ||
    meta.aliases.some((alias) => tokenMatches(alias, token)) ||
    meta.headings.some((heading) => tokenMatches(heading, token)) ||
    meta.tags.some((tag) => tokenMatches(tag, token))
  );
}

/**
 * Decides, without parsing the body, how relevant a page is — or null when it cannot match. A page whose title,
 * aliases, headings or tags hold every word is final; one that would need its body is `pendingBody` and must be
 * confirmed with `confirmBody`, which can only remove it (a page that also matched elsewhere then keeps that lower
 * place, as its `fallback`). `recency` is `recencyPoints` for the page.
 */
export function classify(query: ParsedQuery, meta: FoldedMeta, body: BodyText, recency: number): Classification | null {
  let settled: Classification | undefined;
  const consider = (cls: MatchClass, value: number, fuzzy: boolean): void => {
    if (!settled || value + recency > settled.score) {
      settled = { cls, score: value + recency, pendingBody: false, fuzzy };
    }
  };

  const title = matchField(meta.title, query);

  if (title) {
    consider('title', score(title, BASE.title), false);
  }

  // One or two characters: titles only — an exact one, never a close one, and no other field is looked at.
  if (query.titleOnly) {
    return (settled as Classification | undefined) ?? null;
  }

  for (const alias of meta.aliases) {
    const match = matchField(alias, query);

    if (match) {
      consider('alias', score(match, BASE.alias), false);
    }
  }

  // No exact title or alias: either may still be a close match (a typo), which outranks everything below them.
  if (!settled && query.allowsClose) {
    const titleClose = matchFieldFuzzy(cachedTitleWords(meta), meta.title, query);

    if (titleClose) {
      consider('title', score(titleClose, BASE.titleClose), true);
    }

    // Aliases are few and short: their words are made as needed.
    for (const alias of meta.aliases) {
      const aliasClose = matchFieldFuzzy(wordsOf(alias), alias, query);

      if (aliasClose) {
        consider('alias', score(aliasClose, BASE.aliasClose), true);
      }
    }
  }

  // Tags and headings can only be the best place when neither the title nor an alias matched.
  if (!settled) {
    for (const heading of meta.headings) {
      const match = matchField(heading, query);

      if (match) {
        consider('heading', score(match, BASE.heading), false);
      }
    }

    for (const tag of meta.tags) {
      const match = matchField(tag, query);

      if (match) {
        consider('tag', score(match, BASE.tag), false);
      }
    }

    if (meta.tags.length > 1) {
      const match = matchField(meta.tags.join(' '), query);

      if (match) {
        consider('tag', score(match, BASE.tag), false);
      }
    }
  }

  const found = settled as Classification | undefined;

  // A title, an alias or a tag is above anything the body can offer: nothing more to look at.
  if (found && found.score >= BASE.tag) {
    return found;
  }

  // Early exit on the first word the body cannot hold: the common case for a page that is not a match at all.
  const tokens = query.prefilterTokens;
  let firstImpossible = -1;

  for (let index = 0; index < tokens.length; index++) {
    if (!body.mayContain(tokens[index]!)) {
      firstImpossible = index;
      break;
    }
  }

  if (firstImpossible < 0) {
    const match = bodyMatch(query, body.prefilter);

    if (match) {
      const inBody: Classification = {
        cls: 'body',
        score: score(match, match.base) + recency,
        pendingBody: true,
        fuzzy: false,
      };

      // Better than the heading or tag it also matched: take it, keeping that as the place to fall back to.
      return found && found.score >= inBody.score ? found : found ? { ...inBody, fallback: found } : inBody;
    }

    return found ?? null;
  }

  if (found) {
    return found;
  }

  // Spread over several places: every word is in the body or in the title, an alias, a heading or a tag. (Not for a
  // query whose words begin each other: it could "find" them in one word, and phrase or nearby matches serve it.)
  if (query.overlapping) {
    return null;
  }

  for (let index = firstImpossible; index < tokens.length; index++) {
    // The word already known not to be in the body is not searched for again.
    if (!metaIncludes(meta, query.tokens[index]!) && (index === firstImpossible || !body.mayContain(tokens[index]!))) {
      return null;
    }
  }

  return {
    cls: 'mixed',
    score: score({ quality: 35, proximity: 10 }, BASE.mixed) + recency,
    pendingBody: true,
    fuzzy: false,
  };
}

export interface Snippet {
  /** The visible line (or a window of it), ready to show. */
  readonly text: string;
  /** Ranges in `text` to highlight. */
  readonly highlights: readonly { readonly from: number; readonly to: number }[];
  /** The best match in it, as a range in the page's Markdown (the editor document) — what a reveal targets. */
  readonly range: { readonly from: number; readonly to: number };
}

export interface BodyResult {
  /** For each query word, whether the visible body contains it (by the matching rule). */
  readonly present: readonly boolean[];
  /** The best passages first (at most three). */
  readonly snippets: readonly Snippet[];
  /** How many more lines of the note match, beyond the passages returned. */
  readonly moreMatches: number;
}

interface TokenMatch {
  readonly from: number;
  readonly to: number;
  readonly token: number;
}

/** Occurrences of each word the matching rule accepts: at word starts, falling back to inside words for a long word. */
function findTokenMatches(folded: string, tokens: readonly string[]): TokenMatch[] {
  const matches: TokenMatch[] = [];

  tokens.forEach((token, index) => {
    const wordStarts: TokenMatch[] = [];
    const inside: TokenMatch[] = [];

    for (
      let at = folded.indexOf(token);
      at >= 0 && wordStarts.length < MAX_MATCHES_PER_TOKEN;
      at = folded.indexOf(token, at + token.length)
    ) {
      (atWordStart(folded, at) ? wordStarts : inside).push({ from: at, to: at + token.length, token: index });
    }

    matches.push(...wordStarts, ...(wordStarts.length === 0 && token.length >= SHORT_WORD ? inside : []));
  });

  return matches.sort((a, b) => a.from - b.from || a.token - b.token);
}

/**
 * Ranges in `text` (original coordinates) worth highlighting: the phrase where it occurs as typed, else each word
 * where it matches by the rule. A single letter is only ever highlighted as part of the phrase — never on its own.
 */
export function highlightRanges(
  text: string,
  tokens: readonly string[],
  allowCloseMatches = false
): { readonly from: number; readonly to: number }[] {
  const folded = foldText(text);
  const phrase = tokens.join(' ');
  const ranges: { from: number; to: number }[] = [];
  let phraseFound = false;

  if (tokens.length > 1) {
    for (let at = folded.text.indexOf(phrase); at >= 0; at = folded.text.indexOf(phrase, at + phrase.length)) {
      phraseFound = true;
      ranges.push({ ...sourceRangeOf(folded, text, at, at + phrase.length) });
    }
  }

  if (!phraseFound) {
    const worth = tokens.filter((token) => token.length >= 2 || tokens.length === 1);

    for (const match of findTokenMatches(folded.text, worth)) {
      ranges.push({ ...sourceRangeOf(folded, text, match.from, match.to) });
    }

    // A title or alias found by a typo: highlight the word that was meant, not unrelated letters.
    if (allowCloseMatches) {
      const words = wordsOf(folded.text);

      for (const token of worth) {
        if (!tokenMatches(folded.text, token)) {
          const word = words.find((candidate) => fuzzyWordMatches(token, candidate.text));

          if (word) {
            ranges.push({ ...sourceRangeOf(folded, text, word.start, word.start + word.text.length) });
          }
        }
      }
    }
  }

  ranges.sort((a, b) => a.from - b.from);

  const merged: { from: number; to: number }[] = [];

  for (const range of ranges) {
    const last = merged[merged.length - 1];

    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push(range);
    }
  }

  return merged;
}

/** Index in the visible text of the folded index `index` (a line boundary, or the end). */
function visibleIndex(folded: FoldedText, visibleLength: number, index: number): number {
  if (index >= folded.text.length) {
    return visibleLength;
  }

  return foldedIndexToSource(folded.breaks, index);
}

function windowAround(line: string, matchStart: number): string {
  if (line.length <= SNIPPET_CHARS) {
    return line;
  }

  let start = Math.max(0, Math.min(matchStart - 30, line.length - SNIPPET_CHARS));
  let end = Math.min(line.length, start + SNIPPET_CHARS);

  // Never cut between the two halves of a surrogate pair.
  if (start > 0 && /[\udc00-\udfff]/.test(line[start]!)) start++;
  if (end < line.length && /[\udc00-\udfff]/.test(line[end]!)) end++;

  return `${start > 0 ? '…' : ''}${line.slice(start, end)}${end < line.length ? '…' : ''}`;
}

interface LineMatch {
  lineStart: number;
  lineEnd: number;
  tokens: Set<number>;
  first: TokenMatch;
  hasPhrase: boolean;
}

/**
 * Parses the body and reports which query words it really contains (link destinations, delimiters and the like do
 * not count) plus the best passages, best first: the lines holding the phrase as typed, then those holding the most
 * of the words, earlier lines breaking ties — never merely the first lines of the note. Only called for a page that
 * is going to be shown or has to be confirmed.
 */
export function confirmBody(query: ParsedQuery, body: BodyText): BodyResult {
  const { visible, folded } = body.visible;
  const matches = findTokenMatches(folded.text, query.tokens);
  const present = query.tokens.map((_, index) => matches.some((match) => match.token === index));

  const phraseStarts: number[] = [];

  if (query.tokens.length > 1) {
    for (
      let at = folded.text.indexOf(query.phrase);
      at >= 0;
      at = folded.text.indexOf(query.phrase, at + query.phrase.length)
    ) {
      phraseStarts.push(at);
    }
  }

  const lines = new Map<number, LineMatch>();

  for (const match of matches) {
    const lineStart = folded.text.lastIndexOf('\n', match.from - 1) + 1;
    const existing = lines.get(lineStart);

    if (existing) {
      existing.tokens.add(match.token);
      continue;
    }

    const newline = folded.text.indexOf('\n', match.from);

    lines.set(lineStart, {
      lineStart,
      lineEnd: newline < 0 ? folded.text.length : newline,
      tokens: new Set([match.token]),
      first: match,
      hasPhrase: false,
    });
  }

  for (const start of phraseStarts) {
    const line = lines.get(folded.text.lastIndexOf('\n', start - 1) + 1);

    if (line && !line.hasPhrase) {
      line.hasPhrase = true;
      line.first = { from: start, to: start + query.phrase.length, token: 0 };
    }
  }

  const ranked = [...lines.values()].sort(
    (a, b) => Number(b.hasPhrase) - Number(a.hasPhrase) || b.tokens.size - a.tokens.size || a.lineStart - b.lineStart
  );

  const snippets: Snippet[] = [];

  for (const line of ranked) {
    if (snippets.length >= SNIPPET_LIMIT) {
      break;
    }

    const from = visibleIndex(folded, visible.length, line.lineStart);
    const to = visibleIndex(folded, visible.length, line.lineEnd);
    const raw = visible.slice(from, to);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();

    if (trimmed === '') {
      continue;
    }

    const firstVisible = sourceRangeOf(folded, visible, line.first.from, line.first.to);
    const text = windowAround(trimmed, Math.max(0, firstVisible.from - from - leading));

    snippets.push({
      text,
      highlights: highlightRanges(text, query.tokens),
      range: visibleRangeToSource(visible, firstVisible.from, firstVisible.to),
    });
  }

  return { present, snippets, moreMatches: Math.max(0, ranked.length - snippets.length) };
}
