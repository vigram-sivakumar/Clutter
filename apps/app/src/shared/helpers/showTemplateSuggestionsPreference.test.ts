// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SHOW_TEMPLATE_SUGGESTIONS,
  readShowTemplateSuggestions,
  subscribeShowTemplateSuggestions,
  writeShowTemplateSuggestions,
} from './showTemplateSuggestionsPreference';

const KEY = 'clutter-show-template-suggestions';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Show template suggestions preference', () => {
  it('is on by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_SHOW_TEMPLATE_SUGGESTIONS).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readShowTemplateSuggestions()).toBe(true);
  });

  it('persists being turned off, and a fresh read (as after a restart) sees it', () => {
    writeShowTemplateSuggestions(false);

    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readShowTemplateSuggestions()).toBe(false);
  });

  it('turning it back on removes the stored value, so a missing value is the default', () => {
    writeShowTemplateSuggestions(false);
    writeShowTemplateSuggestions(true);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readShowTemplateSuggestions()).toBe(true);
  });

  it.each(['', 'true', '0', 'off', 'FALSE'])('reads an unrecognised stored value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);

    expect(readShowTemplateSuggestions()).toBe(true);
  });

  it('is app-wide and never touches any other stored setting', () => {
    localStorage.setItem('clutter-week-start', 'sunday');

    writeShowTemplateSuggestions(false);

    expect(Object.keys(localStorage).sort()).toEqual([KEY, 'clutter-week-start']);
    expect(localStorage.getItem('clutter-week-start')).toBe('sunday');
  });

  it('tells subscribers when it changes, and stops after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeShowTemplateSuggestions(listener);

    writeShowTemplateSuggestions(false);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeShowTemplateSuggestions(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to on when storage is unavailable, and does not throw writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readShowTemplateSuggestions()).toBe(true);
    expect(() => writeShowTemplateSuggestions(false)).not.toThrow();
  });
});
