import { describe, expect, it } from 'vitest';

import { scanImage } from './imageScanner';

describe('scanImage', () => {
  it('parses alt text and a remote URL', () => {
    expect(scanImage('![Mountain view](https://example.com/mountain.jpg)')).toEqual({
      alt: 'Mountain view',
      url: 'https://example.com/mountain.jpg',
      presentationTokens: [],
    });
  });

  it('parses empty alt text', () => {
    expect(scanImage('![](https://example.com/image.png)')).toEqual({
      alt: '',
      url: 'https://example.com/image.png',
      presentationTokens: [],
    });
  });

  it('discards an optional link title, keeping only the URL', () => {
    expect(scanImage('![Alt](https://example.com/image.png "A title")')).toEqual({
      alt: 'Alt',
      url: 'https://example.com/image.png',
      presentationTokens: [],
    });
  });

  it('returns null for text that is not a well-formed image', () => {
    expect(scanImage('not an image')).toBeNull();
    expect(scanImage('![Alt](unterminated')).toBeNull();
    expect(scanImage('[Alt](https://example.com)')).toBeNull();
  });

  it('keeps a raw, unencoded space in a local Vault path as part of the url, not truncated to the first token', () => {
    expect(scanImage('![Testing](Delete me.jpg)')).toEqual({
      alt: 'Testing',
      url: 'Delete me.jpg',
      presentationTokens: [],
    });
  });

  it('keeps multiple raw spaces in a nested local path', () => {
    expect(scanImage('![Testing](Assets/My Photos/Delete me.jpg)')).toEqual({
      alt: 'Testing',
      url: 'Assets/My Photos/Delete me.jpg',
      presentationTokens: [],
    });
  });

  it('still discards a genuine quoted title after a space-containing local path', () => {
    expect(scanImage('![Testing](Delete me.jpg "A title")')).toEqual({
      alt: 'Testing',
      url: 'Delete me.jpg',
      presentationTokens: [],
    });
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

  describe('Obsidian-style presentation metadata (|token,token,...)', () => {
    it('splits alt from a single width token', () => {
      expect(scanImage('![Mountain view|290](photo.jpg)')).toEqual({
        alt: 'Mountain view',
        url: 'photo.jpg',
        presentationTokens: ['290'],
      });
    });

    it('splits alt from a full width,alignment,mode list', () => {
      expect(scanImage('![Mountain view|6,center,fit](photo.jpg)')).toEqual({
        alt: 'Mountain view',
        url: 'photo.jpg',
        presentationTokens: ['6', 'center', 'fit'],
      });
    });

    it('arbitrary token order is preserved as raw tokens (classification happens elsewhere)', () => {
      expect(scanImage('![Photo|fit,center,6](photo.jpg)')!.presentationTokens).toEqual(['fit', 'center', '6']);
    });

    it('an alt with no "|" at all has no presentation tokens', () => {
      expect(scanImage('![Photo](photo.jpg)')!.presentationTokens).toEqual([]);
    });

    it('an empty alt with only a pipe segment splits to empty alt + tokens', () => {
      expect(scanImage('![|6,center](photo.jpg)')).toEqual({ alt: '', url: 'photo.jpg', presentationTokens: ['6', 'center'] });
    });

    it('a title is still preserved alongside presentation metadata', () => {
      expect(scanImage('![Photo|6](photo.jpg "A title")')).toEqual({
        alt: 'Photo',
        url: 'photo.jpg',
        presentationTokens: ['6'],
      });
    });

    it('splits alt from fill mode alone', () => {
      expect(scanImage('![Mountain view|fill](photo.jpg)')).toEqual({
        alt: 'Mountain view',
        url: 'photo.jpg',
        presentationTokens: ['fill'],
      });
    });

    it('splits alt from width + fill in both orders', () => {
      expect(scanImage('![Photo|230,fill](photo.jpg)')).toEqual({
        alt: 'Photo',
        url: 'photo.jpg',
        presentationTokens: ['230', 'fill'],
      });
      expect(scanImage('![Photo|fill,230](photo.jpg)')).toEqual({
        alt: 'Photo',
        url: 'photo.jpg',
        presentationTokens: ['fill', '230'],
      });
    });

    it('splits alt from width + alignment + fill', () => {
      expect(scanImage('![Photo|230,center,fill](photo.jpg)')).toEqual({
        alt: 'Photo',
        url: 'photo.jpg',
        presentationTokens: ['230', 'center', 'fill'],
      });
    });
  });
});
