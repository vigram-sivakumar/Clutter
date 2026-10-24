// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_APPLY_TEMPLATE_COVER,
  readApplyTemplateCover,
  subscribeApplyTemplateCover,
  writeApplyTemplateCover,
} from './applyTemplateCoverPreference';

const KEY = 'clutter-apply-template-cover';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Apply template cover preference', () => {
  it('is on by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_APPLY_TEMPLATE_COVER).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readApplyTemplateCover()).toBe(true);
  });

  it('persists being turned off, and a fresh read (as after a restart) sees it', () => {
    writeApplyTemplateCover(false);

    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readApplyTemplateCover()).toBe(false);
  });

  it('turning it back on removes the stored value, so a missing value is the default', () => {
    writeApplyTemplateCover(false);
    writeApplyTemplateCover(true);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readApplyTemplateCover()).toBe(true);
  });

  it.each(['', 'true', '0', 'off', 'FALSE'])('reads an unrecognised stored value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);

    expect(readApplyTemplateCover()).toBe(true);
  });

  it('tells subscribers when it changes, and stops after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeApplyTemplateCover(listener);

    writeApplyTemplateCover(false);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeApplyTemplateCover(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to on when storage is unavailable, and does not throw writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readApplyTemplateCover()).toBe(true);
    expect(() => writeApplyTemplateCover(false)).not.toThrow();
  });
});
