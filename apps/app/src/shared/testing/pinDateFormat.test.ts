// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDateFormatChoice, writeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { applyPinnedDateFormat, pinDateFormat } from './pinDateFormat';

const KEY = 'clutter-date-format';

beforeEach(() => localStorage.clear());

describe('applyPinnedDateFormat', () => {
  it('pins the format, and the returned function puts back the preference that was in effect before', () => {
    writeDateFormatChoice('ymd');

    const restore = applyPinnedDateFormat('full');
    expect(readDateFormatChoice()).toBe('full');

    restore();
    expect(readDateFormatChoice()).toBe('ymd');
  });

  it('restores "nothing saved" as nothing saved, not as a saved default', () => {
    expect(localStorage.getItem(KEY)).toBeNull();

    applyPinnedDateFormat('full')();

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('restores even when the code between pinning and restoring throws', () => {
    writeDateFormatChoice('dmy');
    const restore = applyPinnedDateFormat('full');

    expect(() => {
      try {
        throw new Error('the test failed');
      } finally {
        restore();
      }
    }).toThrow('the test failed');

    expect(readDateFormatChoice()).toBe('dmy');
  });
});

describe('pinDateFormat', () => {
  // The hooks below run around each of this describe's tests, the way a test file uses it.
  describe('pins for every test', () => {
    pinDateFormat('full');

    it('the first test sees the pinned format', () => {
      expect(readDateFormatChoice()).toBe('full');
    });

    it('a test that changes the format cannot leak it into the next one', () => {
      writeDateFormatChoice('mdy');
      expect(readDateFormatChoice()).toBe('mdy');
    });

    it('the next test sees the pinned format again', () => {
      expect(readDateFormatChoice()).toBe('full');
    });
  });

  describe('after the pinned tests', () => {
    afterEach(() => localStorage.clear());

    it('the app is back on its default: nothing was left behind', () => {
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(readDateFormatChoice()).toBe('relative');
    });
  });
});
