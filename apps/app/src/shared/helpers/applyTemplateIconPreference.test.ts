// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_APPLY_TEMPLATE_ICON,
  readApplyTemplateIcon,
  subscribeApplyTemplateIcon,
  writeApplyTemplateIcon,
} from './applyTemplateIconPreference';

const KEY = 'clutter-apply-template-icon';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Apply template icon preference', () => {
  it('is on by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_APPLY_TEMPLATE_ICON).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readApplyTemplateIcon()).toBe(true);
  });

  it('persists being turned off, and a fresh read (as after a restart) sees it', () => {
    writeApplyTemplateIcon(false);

    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readApplyTemplateIcon()).toBe(false);
  });

  it('turning it back on removes the stored value, so a missing value is the default', () => {
    writeApplyTemplateIcon(false);
    writeApplyTemplateIcon(true);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readApplyTemplateIcon()).toBe(true);
  });

  it.each(['', 'true', '0', 'off', 'FALSE'])('reads an unrecognised stored value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);

    expect(readApplyTemplateIcon()).toBe(true);
  });

  it('tells subscribers when it changes, and stops after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeApplyTemplateIcon(listener);

    writeApplyTemplateIcon(false);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeApplyTemplateIcon(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to on when storage is unavailable, and does not throw writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readApplyTemplateIcon()).toBe(true);
    expect(() => writeApplyTemplateIcon(false)).not.toThrow();
  });
});
