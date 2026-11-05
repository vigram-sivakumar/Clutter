// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readEnableEmojiLists, writeEnableEmojiLists } from './enableEmojiListsPreference';
import { readPreserveBulletStyle } from './preserveBulletStylePreference';
import {
  DEFAULT_PREFER_CLUTTER_QUOTE_SYNTAX,
  readPreferClutterQuoteSyntax,
  subscribePreferClutterQuoteSyntax,
  writePreferClutterQuoteSyntax,
} from './preferClutterQuoteSyntaxPreference';

const KEY = 'clutter-prefer-clutter-quote-syntax';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Prefer Clutter quote syntax preference', () => {
  it('is off by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_PREFER_CLUTTER_QUOTE_SYNTAX).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readPreferClutterQuoteSyntax()).toBe(false);
  });

  it('persists being turned on, and a fresh read (as after a restart) sees it', () => {
    writePreferClutterQuoteSyntax(true);

    expect(localStorage.getItem(KEY)).toBe('true');
    expect(readPreferClutterQuoteSyntax()).toBe(true);
  });

  it('turning it off again removes the stored value, so a missing value is the default', () => {
    writePreferClutterQuoteSyntax(true);
    writePreferClutterQuoteSyntax(false);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readPreferClutterQuoteSyntax()).toBe(false);
  });

  it.each(['', 'false', '1', 'yes', 'TRUE'])('reads an unrecognised stored value (%j) as the default, off', (value) => {
    localStorage.setItem(KEY, value);

    expect(readPreferClutterQuoteSyntax()).toBe(false);
  });

  it('is independent of the other Markdown settings', () => {
    writePreferClutterQuoteSyntax(true);
    expect(readEnableEmojiLists()).toBe(true);
    expect(readPreserveBulletStyle()).toBe(true);

    writeEnableEmojiLists(false);
    expect(readPreferClutterQuoteSyntax()).toBe(true);
  });

  it('tells subscribers about a change, until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePreferClutterQuoteSyntax(listener);

    writePreferClutterQuoteSyntax(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writePreferClutterQuoteSyntax(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still answers when storage is unavailable: the default, and a write that quietly does nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(readPreferClutterQuoteSyntax()).toBe(false);
    expect(() => writePreferClutterQuoteSyntax(true)).not.toThrow();
  });
});
