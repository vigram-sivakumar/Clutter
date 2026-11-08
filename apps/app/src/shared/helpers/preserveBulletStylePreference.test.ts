// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PRESERVE_BULLET_STYLE,
  readPreserveBulletStyle,
  subscribePreserveBulletStyle,
  writePreserveBulletStyle,
} from './preserveBulletStylePreference';
import { readEnableEmojiLists, writeEnableEmojiLists } from './enableEmojiListsPreference';

const KEY = 'clutter-preserve-bullet-style';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Preserve bullet style preference', () => {
  it('is on by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_PRESERVE_BULLET_STYLE).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readPreserveBulletStyle()).toBe(true);
  });

  it('persists being turned off, and a fresh read (as after a restart) sees it', () => {
    writePreserveBulletStyle(false);

    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readPreserveBulletStyle()).toBe(false);
  });

  it('turning it on again removes the stored value, so a missing value is the default', () => {
    writePreserveBulletStyle(false);
    writePreserveBulletStyle(true);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readPreserveBulletStyle()).toBe(true);
  });

  it.each(['', 'true', '0', 'no', 'FALSE'])('reads an unrecognised stored value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);

    expect(readPreserveBulletStyle()).toBe(true);
  });

  it('is independent of the sibling setting: changing one never changes the other', () => {
    writePreserveBulletStyle(false);
    expect(readEnableEmojiLists()).toBe(true);

    writePreserveBulletStyle(true);
    writeEnableEmojiLists(false);
    expect(readPreserveBulletStyle()).toBe(true);
    expect(Object.keys(localStorage)).not.toContain(KEY);
  });

  it('notifies subscribers on every change, until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePreserveBulletStyle(listener);

    writePreserveBulletStyle(false);
    writePreserveBulletStyle(true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    writePreserveBulletStyle(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('still reads the default when the store is unreadable or unwritable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readPreserveBulletStyle()).toBe(true);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => writePreserveBulletStyle(false)).not.toThrow();
  });
});

describe('the root attribute (what the list CSS reads)', () => {
  it('is absent while the setting is on, present as "dot" while it is off, and follows every change', async () => {
    const { installPreserveBulletStyleSync, writePreserveBulletStyle } = await import('./preserveBulletStylePreference');
    const root = document.documentElement;

    const uninstall = installPreserveBulletStyleSync();
    expect(root.hasAttribute('data-markdown-bullet-style')).toBe(false);

    writePreserveBulletStyle(false);
    expect(root.getAttribute('data-markdown-bullet-style')).toBe('dot');

    writePreserveBulletStyle(true);
    expect(root.hasAttribute('data-markdown-bullet-style')).toBe(false);

    uninstall();
  });

  it('is applied at install time from a saved "off" (a restart)', async () => {
    const { installPreserveBulletStyleSync } = await import('./preserveBulletStylePreference');
    localStorage.setItem(KEY, 'false');

    const uninstall = installPreserveBulletStyleSync();
    expect(document.documentElement.getAttribute('data-markdown-bullet-style')).toBe('dot');

    uninstall();
    document.documentElement.removeAttribute('data-markdown-bullet-style');
  });
});
