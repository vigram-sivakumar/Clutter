// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ENABLE_EMOJI_LISTS,
  readEnableEmojiLists,
  subscribeEnableEmojiLists,
  writeEnableEmojiLists,
} from './enableEmojiListsPreference';
import { readPreserveBulletStyle, writePreserveBulletStyle } from './preserveBulletStylePreference';

const KEY = 'clutter-enable-emoji-lists';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Enable emoji lists preference', () => {
  it('is on by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_ENABLE_EMOJI_LISTS).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readEnableEmojiLists()).toBe(true);
  });

  it('persists being turned off, and a fresh read (as after a restart) sees it', () => {
    writeEnableEmojiLists(false);

    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readEnableEmojiLists()).toBe(false);
  });

  it('turning it on again removes the stored value, so a missing value is the default', () => {
    writeEnableEmojiLists(false);
    writeEnableEmojiLists(true);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readEnableEmojiLists()).toBe(true);
  });

  it.each(['', 'true', '0', 'no', 'FALSE'])('reads an unrecognised stored value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);

    expect(readEnableEmojiLists()).toBe(true);
  });

  it('is independent of the sibling setting: changing one never changes the other', () => {
    writeEnableEmojiLists(false);
    expect(readPreserveBulletStyle()).toBe(true);

    writeEnableEmojiLists(true);
    writePreserveBulletStyle(false);
    expect(readEnableEmojiLists()).toBe(true);
    expect(Object.keys(localStorage)).not.toContain(KEY);
  });

  it('notifies subscribers on every change, until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEnableEmojiLists(listener);

    writeEnableEmojiLists(false);
    writeEnableEmojiLists(true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    writeEnableEmojiLists(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('still reads the default when the store is unreadable or unwritable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readEnableEmojiLists()).toBe(true);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => writeEnableEmojiLists(false)).not.toThrow();
  });
});
