// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SHOW_REFERENCES_AUTOMATICALLY,
  readShowReferencesAutomatically,
  subscribeShowReferencesAutomatically,
  writeShowReferencesAutomatically,
} from './showReferencesAutomaticallyPreference';

const KEY = 'clutter-show-references-automatically';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Show references automatically preference', () => {
  it('is on by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_SHOW_REFERENCES_AUTOMATICALLY).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readShowReferencesAutomatically()).toBe(true);
  });

  it('persists being turned off, and a fresh read (as after a restart) sees it', () => {
    writeShowReferencesAutomatically(false);

    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readShowReferencesAutomatically()).toBe(false);
  });

  it('turning it back on removes the stored value, so a missing value is the default', () => {
    writeShowReferencesAutomatically(false);
    writeShowReferencesAutomatically(true);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readShowReferencesAutomatically()).toBe(true);
  });

  it.each(['', 'true', '0', 'off', 'FALSE'])('reads an unrecognised stored value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);

    expect(readShowReferencesAutomatically()).toBe(true);
  });

  it('is app-wide and never touches the per-page References state or any other stored setting', () => {
    localStorage.setItem('clutter-week-start', 'sunday');

    writeShowReferencesAutomatically(false);

    expect(Object.keys(localStorage).sort()).toEqual([KEY, 'clutter-week-start']);
    expect(localStorage.getItem('clutter-week-start')).toBe('sunday');
  });

  it('tells subscribers when it changes, and stops after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeShowReferencesAutomatically(listener);

    writeShowReferencesAutomatically(false);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeShowReferencesAutomatically(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to on when storage is unavailable, and does not throw writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readShowReferencesAutomatically()).toBe(true);
    expect(() => writeShowReferencesAutomatically(false)).not.toThrow();
  });
});
