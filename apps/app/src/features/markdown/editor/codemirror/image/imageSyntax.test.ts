import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';

/**
 * Pure parser-level tests — no EditorView, no DOM. Confirms
 * `imageSpacedDestinationSyntax` produces a full `Image` node for a
 * destination containing a raw, unescaped space (the one shape native
 * `@lezer/markdown` rejects outright — confirmed directly against its own
 * `parseURL`, which breaks scanning at the first whitespace character),
 * while every other case — titles, angle-bracket/percent-encoded
 * destinations, reference-style links, `![[...]]` Embeds — still goes
 * through native parsing completely unaffected. Same "load-bearing safety
 * net" style embedSyntax.test.ts/markdownLanguage.regression.test.ts
 * already established.
 */

function nodeNames(text: string): string[] {
  const language = markdownLanguageExtension().language;
  const names: string[] = [];
  language.parser.parse(text).iterate({
    enter(node) {
      names.push(node.name);
    },
  });
  return names;
}

function imageRange(text: string): { from: number; to: number } | null {
  const language = markdownLanguageExtension().language;
  let range: { from: number; to: number } | null = null;
  language.parser.parse(text).iterate({
    enter(node) {
      if (node.name === 'Image') {
        range = { from: node.from, to: node.to };
      }
    },
  });
  return range;
}

describe('imageSpacedDestinationSyntax — a raw space in the destination', () => {
  it('![Testing](Delete me.jpg) produces a single Image node spanning the whole construct', () => {
    const text = '![Testing](Delete me.jpg)';
    const range = imageRange(text);
    expect(range).toEqual({ from: 0, to: text.length });
  });

  it('a nested path with a space, ![Testing](Assets/My Photos/Delete me.jpg), also produces one full Image node', () => {
    const text = '![Testing](Assets/My Photos/Delete me.jpg)';
    expect(imageRange(text)).toEqual({ from: 0, to: text.length });
  });

  it('surrounding text is unaffected — the Image node sits correctly among plain text either side', () => {
    const text = 'See: ![Testing](Delete me.jpg) done';
    const range = imageRange(text);
    expect(range).toEqual({ from: 5, to: 5 + '![Testing](Delete me.jpg)'.length });
  });

  it('a paren inside a space-containing destination is balanced correctly, not mistaken for the closing paren', () => {
    const text = '![Testing](My Photos (2024)/Delete me.jpg)';
    expect(imageRange(text)).toEqual({ from: 0, to: text.length });
  });

  it('an escaped closing paren inside the destination does not prematurely end the node', () => {
    const text = '![Testing](Delete \\) me.jpg)';
    expect(imageRange(text)).toEqual({ from: 0, to: text.length });
  });

  it('never crosses a line break — a destination containing a newline falls back to native Image\'s own label-only shape, not an expanded node spanning the newline', () => {
    const text = '![Testing](Delete\nme.jpg)';
    // Native Image's own fallback for an unclosed/invalid destination: a
    // short node covering only `![Testing]` (the label), never expanding
    // to include what follows — confirmed pre-existing, unrelated to this
    // rule (same shape a plain unterminated destination produces below).
    expect(imageRange(text)).toEqual({ from: 0, to: 10 });
  });
});

describe('imageSpacedDestinationSyntax — every space-free case still goes through native Image parsing, completely unaffected', () => {
  it('a plain external URL produces a native Image node with its own LinkMark/URL children', () => {
    const text = '![Mountain view](https://example.com/mountain.jpg)';
    const names = nodeNames(text);
    expect(names).toContain('Image');
    expect(names).toContain('LinkMark');
    expect(names).toContain('URL');
  });

  it('a title still produces a full, correctly-spanned Image node — imageScanner.ts\'s own title-stripping logic (not this file) is what extracts the right url either way', () => {
    // NOTE: this rule's own "does the raw text between `](` and its
    // closing `)` contain a space" gate can't distinguish "space inside
    // the destination itself" from "the space that legitimately separates
    // a destination from a quoted title" (the destination+title pair
    // itself always contains at least one such space) — so a title case
    // like this one *also* goes through this rule's own direct-node path,
    // not native's LinkTitle/URL-child-bearing one, and therefore has no
    // LinkMark/URL children of its own (see imageSyntax.ts's own doc
    // comment, "No internal children"). This is a deliberately accepted,
    // documented trade-off: nothing downstream reads those children
    // (imageScanner.ts re-slices the node's raw text directly), so the
    // only cost is the highlighting imageSyntax.ts's own doc comment
    // already calls out — the extracted alt/url end up identical either
    // way, confirmed by imageScanner.test.ts's own title-stripping
    // coverage.
    const text = '![Alt](https://example.com/image.png "A title")';
    expect(imageRange(text)).toEqual({ from: 0, to: text.length });
  });

  it('an angle-bracketed destination with a space is untouched (already valid CommonMark on its own)', () => {
    const text = '![Testing](<Delete me.jpg>)';
    expect(imageRange(text)).toEqual({ from: 0, to: text.length });
  });

  it('a percent-encoded destination with no raw space is untouched', () => {
    const text = '![Testing](Delete%20me.jpg)';
    expect(imageRange(text)).toEqual({ from: 0, to: text.length });
  });

  it('reference-style images are unaffected — no `](` shape at all, so this rule never activates and native reference resolution is untouched', () => {
    const text = '![Alt][ref]';
    expect(imageRange(text)).toEqual({ from: 0, to: text.length });
  });

  it('![[...]] Embed syntax is completely unaffected — still its own distinct node, never Image', () => {
    const text = '![[Delete me.jpg]]';
    const names = nodeNames(text);
    expect(names).toContain('Embed');
    expect(names).not.toContain('Image');
  });

  it('![[Alt]](url) — a genuine Image whose alt text happens to be a doubled bracket — is not stolen by Embed, and still parses as Image (regression: an earlier version of this rule wrongly declined this case)', () => {
    const names = nodeNames('![[Alt]](url)');
    expect(names).not.toContain('Embed');
    expect(names).toContain('Image');
  });

  it('incomplete syntax (unterminated destination) still produces only the label-only fallback shape, never expanding to swallow the incomplete destination', () => {
    const text = '![Alt](unterminated';
    expect(imageRange(text)).toEqual({ from: 0, to: 6 }); // `![Alt]` only
  });
});
