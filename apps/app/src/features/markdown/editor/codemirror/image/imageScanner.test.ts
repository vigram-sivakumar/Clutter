import { describe, expect, it } from 'vitest';

import { scanImage } from './imageScanner';

describe('scanImage', () => {
  it('parses alt text and a remote URL', () => {
    expect(scanImage('![Mountain view](https://example.com/mountain.jpg)')).toEqual({
      alt: 'Mountain view',
      url: 'https://example.com/mountain.jpg',
    });
  });

  it('parses empty alt text', () => {
    expect(scanImage('![](https://example.com/image.png)')).toEqual({
      alt: '',
      url: 'https://example.com/image.png',
    });
  });

  it('discards an optional link title, keeping only the URL', () => {
    expect(scanImage('![Alt](https://example.com/image.png "A title")')).toEqual({
      alt: 'Alt',
      url: 'https://example.com/image.png',
    });
  });

  it('returns null for text that is not a well-formed image', () => {
    expect(scanImage('not an image')).toBeNull();
    expect(scanImage('![Alt](unterminated')).toBeNull();
    expect(scanImage('[Alt](https://example.com)')).toBeNull();
  });

  it('returns null for an empty or whitespace-only destination (auto-closed `()` mid-typing)', () => {
    // closeBrackets() auto-inserts the matching `)` the instant a user
    // types `(` after `![alt]`, so `![alt]()` is what the document
    // actually contains the moment that one keystroke lands — treating
    // this as incomplete (not a real, renderable image with url: '') is
    // what keeps the auto-closed parens editable instead of instantly
    // flipping to the broken-image state. See this function's own doc
    // comment for the full account.
    expect(scanImage('![Alt]()')).toBeNull();
    expect(scanImage('![Alt](   )')).toBeNull();
  });
});
