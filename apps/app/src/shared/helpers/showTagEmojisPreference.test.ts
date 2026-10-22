// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SHOW_TAG_EMOJIS,
  readShowTagEmojis,
  subscribeShowTagEmojis,
  writeShowTagEmojis,
} from './showTagEmojisPreference';

const KEY = 'clutter-show-tag-emojis';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Show tag emojis preference', () => {
  it('is on by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_SHOW_TAG_EMOJIS).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readShowTagEmojis()).toBe(true);
  });

  it('persists being turned off, and a fresh read (as after a restart) sees it', () => {
    writeShowTagEmojis(false);

    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readShowTagEmojis()).toBe(false);
  });

  it('turning it on again removes the stored value, so a missing value is the default', () => {
    writeShowTagEmojis(false);
    writeShowTagEmojis(true);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readShowTagEmojis()).toBe(true);
  });

  it.each(['', 'true', '0', 'no', 'FALSE'])('reads an unrecognised stored value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);

    expect(readShowTagEmojis()).toBe(true);
  });

  it('is app-wide: it lives in the browser store only, never in a Space or a note', () => {
    writeShowTagEmojis(false);

    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  it('tells subscribers when it changes, and stops after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeShowTagEmojis(listener);

    writeShowTagEmojis(false);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeShowTagEmojis(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to on when storage is unavailable, and does not throw writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readShowTagEmojis()).toBe(true);
    expect(() => writeShowTagEmojis(false)).not.toThrow();
  });
});
