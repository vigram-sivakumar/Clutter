import { describe, expect, it } from 'vitest';
import { foldString, foldText, sourceRangeOf } from './foldText';

/** The source text a match of `query` in `source` covers, found the way search does it. */
function matchedSource(source: string, query: string): string | null {
  const folded = foldText(source);
  const needle = foldString(query);
  const at = folded.text.indexOf(needle);

  if (at < 0) {
    return null;
  }

  const range = sourceRangeOf(folded, source, at, at + needle.length);

  return source.slice(range.from, range.to);
}

describe('foldText', () => {
  it('is the identity on indices for ASCII', () => {
    const folded = foldText('Hello World');

    expect(folded.text).toBe('hello world');
    expect(folded.breaks).toBeNull();
  });

  it('folds case and diacritics', () => {
    expect(foldString('Café ÉCOLE')).toBe('cafe ecole');
    expect(foldString('naïve')).toBe(foldString('NAIVE'));
  });

  it('treats a precomposed and a decomposed character as the same', () => {
    expect(foldString('é')).toBe('e');
    expect(foldString('é')).toBe('e');
  });

  it('keeps the fold context-free: final and medial sigma fold alike', () => {
    expect(foldString('ΟΔΥΣΣΕΥΣ')).toBe(foldString('οδυσσευς'));
  });

  it('folds the query exactly as it folds the text', () => {
    for (const sample of ['ﬁnal', '½ cup', '한국어', 'İstanbul', '𝒜bc', 'Ａｂｃ', 'ABC ΟΔΥΣΣΕΥΣ Def', 'x Café Ünï 😀 END', '日本語 and ASCII']) {
      expect(foldString(sample)).toBe(foldText(sample).text);
    }
  });
});

describe('sourceRangeOf — length-changing folds never point at the wrong text', () => {
  it('maps a match after a ligature that folds to two units', () => {
    const source = 'ﬁnal word';
    const folded = foldText(source);

    expect(folded.text).toBe('final word');
    // The folded text is longer than the source: a raw index would be off by one.
    expect(folded.text.indexOf('word')).toBe(6);
    expect(matchedSource(source, 'word')).toBe('word');
  });

  it('widens a match that starts or ends inside an expansion to the whole source character', () => {
    expect(matchedSource('ﬁnal', 'i')).toBe('ﬁ');
    expect(matchedSource('½ cup', '2')).toBe('½');
    expect(matchedSource('a½b', 'b')).toBe('b');
  });

  it('maps a match after several expanding characters', () => {
    expect(matchedSource('ﬁ½ﬁ target', 'target')).toBe('target');
  });

  it('maps through Hangul syllables that fold to several jamo', () => {
    expect(matchedSource('한국어 문서 검색', '문서')).toBe('문서');
    expect(matchedSource('한국어 문서 검색', '검색')).toBe('검색');
  });

  it('maps through astral code points (surrogate pairs) without splitting them', () => {
    const source = '𝒜𝒜 after';

    expect(matchedSource(source, 'after')).toBe('after');
    expect(matchedSource(source, 'a')).toBe('𝒜');
  });

  it('never returns a range that starts or ends inside a surrogate pair', () => {
    const source = 'x😀y';
    const range = sourceRangeOf(foldText(source), source, 1, 2);

    expect(source.slice(range.from, range.to)).toBe('😀');
  });

  it('covers a base letter together with the combining marks that follow it', () => {
    expect(matchedSource('café au lait', 'cafe')).toBe('café');
    expect(matchedSource('a ẹ́ b', 'e')).toBe('ẹ́');
  });

  it('is exact for ASCII text', () => {
    const source = 'The Quick Brown Fox';
    const folded = foldText(source);

    expect(sourceRangeOf(folded, source, 4, 9)).toEqual({ from: 4, to: 9 });
  });

  it('keeps ranges correct when non-ASCII text precedes the match', () => {
    const source = 'Ünïcödé prefix, then NEEDLE here';

    expect(matchedSource(source, 'needle')).toBe('NEEDLE');
  });
});

describe('foldText — the length-change map is only as big as the length changes', () => {
  it('stores nothing for text whose characters all keep their length, accents included', () => {
    expect(foldText('Café ÉCOLE naïve résumé').breaks).toBeNull();
    expect(foldText('Café').text).toBe('cafe');
  });

  it('stores nothing for astral characters that fold to the same number of units', () => {
    expect(foldText('😀 emoji').breaks).toBeNull();
  });

  it('stores one entry per length-changing code point, not one per character', () => {
    const text = `${'plain ascii text '.repeat(500)}ﬁ ${'more text '.repeat(500)}½ é`;
    const { breaks } = foldText(text);

    // ﬁ (1 → 2) and ½ (1 → 3): two entries of four ints, for a text of ~13,000 characters.
    expect(breaks).not.toBeNull();
    expect(breaks!.length).toBe(2 * 4);
  });

  it('stores an entry for a dropped combining mark and for an astral character that shrinks', () => {
    expect(foldText('e\u0301').breaks).not.toBeNull();
    expect(foldText('𝒜').breaks).not.toBeNull();
  });
});

/** The straightforward map this module started with — a source index for every folded unit — as the reference. */
function referenceRange(source: string, from: number, to: number) {
  const toSource: number[] = [];
  const pieces: string[] = [];

  for (let index = 0; index < source.length; ) {
    const length = /[\ud800-\udbff]/.test(source[index]!) && /[\udc00-\udfff]/.test(source[index + 1] ?? '') ? 2 : 1;
    const char = source.slice(index, index + length);
    let folded = char.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    if (folded === 'ς') folded = 'σ';
    pieces.push(folded);
    for (let unit = 0; unit < folded.length; unit++) toSource.push(index);
    index += length;
  }

  const sourceFrom = toSource[from]!;
  const last = toSource[to - 1]!;
  const lastLength = /[\ud800-\udbff]/.test(source[last]!) && /[\udc00-\udfff]/.test(source[last + 1] ?? '') ? 2 : 1;
  let sourceTo = last + lastLength;

  while (sourceTo < source.length) {
    const length = /[\ud800-\udbff]/.test(source[sourceTo]!) && /[\udc00-\udfff]/.test(source[sourceTo + 1] ?? '') ? 2 : 1;
    if (!/^\p{M}$/u.test(source.slice(sourceTo, sourceTo + length))) break;
    sourceTo += length;
  }

  return { text: pieces.join(''), range: { from: sourceFrom, to: sourceTo } };
}

describe('sourceRangeOf — exactly the same ranges as a full per-unit map', () => {
  const POOL = ['a', 'B', 'é', 'e\u0301', 'ﬁ', '½', '한', '😀', '𝒜', 'İ', 'ς', 'Σ', ' ', '\u0301', 'x', 'Å', '①'];

  function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('agrees for every folded range of 400 random strings built from tricky characters', () => {
    const next = random(42);

    for (let run = 0; run < 400; run++) {
      const length = 1 + Math.floor(next() * 10);
      let source = '';
      for (let i = 0; i < length; i++) source += POOL[Math.floor(next() * POOL.length)];

      const folded = foldText(source);
      const reference = referenceRange(source, 0, 1).text;

      expect(folded.text).toBe(reference);

      for (let from = 0; from < folded.text.length; from++) {
        for (let to = from + 1; to <= folded.text.length; to++) {
          expect(sourceRangeOf(folded, source, from, to), `${JSON.stringify(source)} [${from},${to})`).toEqual(
            referenceRange(source, from, to).range
          );
        }
      }
    }
  });
});
