// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MARKDOWN_ITALIC_FONT,
  installMarkdownItalicFontSync,
  readMarkdownItalicFont,
  subscribeMarkdownItalicFont,
  writeMarkdownItalicFont,
} from './markdownItalicFontPreference';

const KEY = 'clutter-markdown-italic-font';
const ATTRIBUTE = 'data-markdown-italic-font';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(ATTRIBUTE);
  vi.restoreAllMocks();
});
afterEach(() => {
  document.documentElement.removeAttribute(ATTRIBUTE);
});

describe('the Markdown italic font preference', () => {
  it('is off by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_MARKDOWN_ITALIC_FONT).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readMarkdownItalicFont()).toBe(false);
  });

  it('persists being turned on, and a fresh read (as after a restart) sees it', () => {
    writeMarkdownItalicFont(true);

    expect(localStorage.getItem(KEY)).toBe('true');
    expect(readMarkdownItalicFont()).toBe(true);
  });

  it('turning it off again removes the stored value, so a missing value is the default', () => {
    writeMarkdownItalicFont(true);
    writeMarkdownItalicFont(false);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readMarkdownItalicFont()).toBe(false);
  });

  it('treats an unrecognised stored value as the default', () => {
    localStorage.setItem(KEY, 'maybe');

    expect(readMarkdownItalicFont()).toBe(false);
  });

  it('notifies subscribers on a change, and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMarkdownItalicFont(listener);

    writeMarkdownItalicFont(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeMarkdownItalicFont(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default when storage cannot be read or written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readMarkdownItalicFont()).toBe(false);
    expect(() => writeMarkdownItalicFont(true)).not.toThrow();
  });
});

describe('the root attribute (installMarkdownItalicFontSync)', () => {
  const root = document.documentElement;

  it('is "off" at install while the setting is off — the default', () => {
    const stop = installMarkdownItalicFontSync();

    expect(root.getAttribute(ATTRIBUTE)).toBe('off');
    stop();
  });

  it('is absent when the saved choice is on, and follows every change after', () => {
    localStorage.setItem(KEY, 'true');
    const stop = installMarkdownItalicFontSync();
    expect(root.hasAttribute(ATTRIBUTE)).toBe(false);

    writeMarkdownItalicFont(false);
    expect(root.getAttribute(ATTRIBUTE)).toBe('off');

    writeMarkdownItalicFont(true);
    expect(root.hasAttribute(ATTRIBUTE)).toBe(false);
    stop();
  });

  it('stops following once unsubscribed', () => {
    const stop = installMarkdownItalicFontSync();
    stop();

    writeMarkdownItalicFont(true);
    expect(root.getAttribute(ATTRIBUTE)).toBe('off');
  });
});
