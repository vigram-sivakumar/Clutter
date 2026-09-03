import { describe, expect, it } from 'vitest';

import { scanEmbed } from './embedScanner';

/**
 * Pure scanner tests — no CM6/Lezer runtime involved. `scanEmbed` delegates
 * the entire `[[path|alias]]` parsing to `scanWikiLink` (see its own doc
 * comment); these tests exist to confirm the one thing genuinely new here —
 * recognizing/consuming the leading `!` — not to re-prove `scanWikiLink`'s
 * own escaping/alias/lazy-close rules a second time (already covered by
 * wikiLinkScanner.test.ts).
 */

describe('scanEmbed — successful matches', () => {
  it('parses a simple filename', () => {
    const text = '![[image.png]]';
    const match = scanEmbed(text, 0);
    expect(match).toEqual({ path: 'image.png', alias: null, end: text.length });
  });

  it('parses a nested path', () => {
    const text = '![[folder/image.png]]';
    const match = scanEmbed(text, 0);
    expect(match).toEqual({ path: 'folder/image.png', alias: null, end: text.length });
  });

  it('parses a path containing spaces', () => {
    const text = '![[My Folder/My Image.png]]';
    const match = scanEmbed(text, 0);
    expect(match).toEqual({ path: 'My Folder/My Image.png', alias: null, end: text.length });
  });

  it('an escaped pipe is not a separator — reuses scanWikiLink\'s own escaping rule', () => {
    const text = '![[notes \\| ideas.png]]';
    const match = scanEmbed(text, 0);
    expect(match).toEqual({ path: 'notes | ideas.png', alias: null, end: text.length });
  });

  it('an unescaped pipe splits path from alias, if the syntax happens to carry one — the underlying grammar permits it even though this milestone builds no alias-editing affordance for it', () => {
    const text = '![[hero.png|caption]]';
    const match = scanEmbed(text, 0);
    expect(match).toEqual({ path: 'hero.png', alias: 'caption', end: text.length });
  });

  it('a doubled-escaped bracket pair produces a literal ]] inside the path', () => {
    const text = '![[A\\]\\]B.png]]';
    const match = scanEmbed(text, 0);
    expect(match).toEqual({ path: 'A]]B.png', alias: null, end: text.length });
  });

  it('the leading ! is consumed and never appears in the parsed path', () => {
    const text = '![[document.pdf]]';
    const match = scanEmbed(text, 0);
    expect(match?.path).toBe('document.pdf');
    expect(match?.path).not.toContain('!');
  });

  it('the end index includes the leading ! plus the whole bracketed span', () => {
    const text = '![[a.png]]';
    const match = scanEmbed(text, 0);
    expect(match?.end).toBe(text.length);
  });
});

describe('scanEmbed — failure / incomplete input', () => {
  it('returns null when there is no leading !', () => {
    expect(scanEmbed('[[image.png]]', 0)).toBeNull();
  });

  it('returns null for an unterminated ![[', () => {
    expect(scanEmbed('![[', 0)).toBeNull();
  });

  it('returns null for ![[hero with no closing ]]', () => {
    expect(scanEmbed('![[hero', 0)).toBeNull();
  });

  it('returns null for ![[folder/hero with no closing ]]', () => {
    expect(scanEmbed('![[folder/hero', 0)).toBeNull();
  });

  it('returns null for a bare ! with nothing after it', () => {
    expect(scanEmbed('!', 0)).toBeNull();
  });

  it('returns null for ![ with only a single bracket', () => {
    expect(scanEmbed('![', 0)).toBeNull();
  });

  it('never crosses a newline — same rule scanWikiLink enforces', () => {
    expect(scanEmbed('![[hero\nmore.png]]', 0)).toBeNull();
  });

  it('defers to a genuine CommonMark Image via the continuation-lookahead — ![[Alt]](url) is not claimed', () => {
    expect(scanEmbed('![[Alt]](url)', 0)).toBeNull();
  });
});
