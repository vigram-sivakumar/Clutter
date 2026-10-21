// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_HEADER_SEPARATOR_MODE,
  DEFAULT_HEADER_SEPARATOR_STYLE,
  readHeaderSeparatorMode,
  readHeaderSeparatorStyle,
  shouldShowHeaderSeparator,
  writeHeaderSeparatorMode,
  writeHeaderSeparatorStyle,
} from './headerSeparator';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Header separator preference', () => {
  it('is Automatic by default, for a new installation and for one whose storage has never held it', () => {
    expect(DEFAULT_HEADER_SEPARATOR_MODE).toBe('automatic');
    expect(readHeaderSeparatorMode()).toBe('automatic');
  });

  it('leaves every other stored setting alone when it is introduced or changed', () => {
    localStorage.setItem('clutter-week-start', 'sunday');
    localStorage.setItem('clutter.spaces.v1', '{"paths":["/a"],"activePath":"/a"}');

    expect(readHeaderSeparatorMode()).toBe('automatic');
    writeHeaderSeparatorMode('hide');

    expect(localStorage.getItem('clutter-week-start')).toBe('sunday');
    expect(localStorage.getItem('clutter.spaces.v1')).toBe('{"paths":["/a"],"activePath":"/a"}');
  });

  it.each(['automatic', 'show', 'hide'] as const)('persists %s and reads it back (a restart is a fresh read)', (mode) => {
    writeHeaderSeparatorMode(mode);

    expect(localStorage.getItem('clutter-header-separator')).toBe(mode);
    expect(readHeaderSeparatorMode()).toBe(mode);
  });

  it('reads anything unrecognised as Automatic', () => {
    localStorage.setItem('clutter-header-separator', 'sometimes');

    expect(readHeaderSeparatorMode()).toBe('automatic');
  });

  it('still reads, and falls back to Automatic, when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readHeaderSeparatorMode()).toBe('automatic');
    expect(() => writeHeaderSeparatorMode('show')).not.toThrow();
  });
});

describe('shouldShowHeaderSeparator', () => {
  it.each([
    ['automatic', true, true],
    ['automatic', false, false],
    ['show', true, true],
    ['show', false, true],
    ['hide', true, false],
    ['hide', false, false],
  ] as const)('%s, Properties section on screen: %s → %s', (mode, hasPropertiesSection, expected) => {
    expect(shouldShowHeaderSeparator(mode, hasPropertiesSection)).toBe(expected);
  });
});

describe('the Header separator style preference', () => {
  it('is Line (the divider\'s solid variant) by default', () => {
    expect(DEFAULT_HEADER_SEPARATOR_STYLE).toBe('solid');
    expect(readHeaderSeparatorStyle()).toBe('solid');
  });

  it.each(['solid', 'wavy', 'dotted'] as const)('persists %s and reads it back', (style) => {
    writeHeaderSeparatorStyle(style);

    expect(localStorage.getItem('clutter-header-separator-style')).toBe(style);
    expect(readHeaderSeparatorStyle()).toBe(style);
  });

  it('reads anything unrecognised as Line', () => {
    localStorage.setItem('clutter-header-separator-style', 'zigzag');

    expect(readHeaderSeparatorStyle()).toBe('solid');
  });

  it('is independent of the visibility mode: neither read nor write touches the other', () => {
    writeHeaderSeparatorMode('hide');
    writeHeaderSeparatorStyle('wavy');
    expect(readHeaderSeparatorMode()).toBe('hide');
    expect(readHeaderSeparatorStyle()).toBe('wavy');

    writeHeaderSeparatorMode('show');
    expect(readHeaderSeparatorStyle()).toBe('wavy');
    writeHeaderSeparatorStyle('dotted');
    expect(readHeaderSeparatorMode()).toBe('show');
  });

  it('leaves every other stored setting alone', () => {
    localStorage.setItem('clutter-week-start', 'sunday');

    expect(readHeaderSeparatorStyle()).toBe('solid');
    writeHeaderSeparatorStyle('dotted');

    expect(localStorage.getItem('clutter-week-start')).toBe('sunday');
  });
});
