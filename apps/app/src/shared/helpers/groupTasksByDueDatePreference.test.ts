// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_GROUP_TASKS_BY_DUE_DATE,
  readGroupTasksByDueDate,
  subscribeGroupTasksByDueDate,
  writeGroupTasksByDueDate,
} from './groupTasksByDueDatePreference';

const KEY = 'clutter-group-tasks-by-due-date';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the Group by due date (Tasks) preference', () => {
  it('is on by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_GROUP_TASKS_BY_DUE_DATE).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readGroupTasksByDueDate()).toBe(true);
  });

  it('turning it off persists explicitly, and a fresh read (as after a restart) sees it', () => {
    writeGroupTasksByDueDate(false);

    expect(localStorage.getItem(KEY)).toBe('false');
    expect(readGroupTasksByDueDate()).toBe(false);
  });

  it('turning it back on (the default) removes the stored value, so a missing value is the default again', () => {
    writeGroupTasksByDueDate(false);
    writeGroupTasksByDueDate(true);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readGroupTasksByDueDate()).toBe(true);
  });

  it.each(['', '1', 'yes', 'TRUE'])('reads an unrecognised stored value (%j) as the default, on', (value) => {
    localStorage.setItem(KEY, value);

    expect(readGroupTasksByDueDate()).toBe(true);
  });

  it('is app-wide: it lives in the browser store only, never in a Space or a note', () => {
    writeGroupTasksByDueDate(false);

    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  it('tells subscribers when it changes, and stops after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGroupTasksByDueDate(listener);

    writeGroupTasksByDueDate(false);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeGroupTasksByDueDate(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default when storage is unavailable, and does not throw writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readGroupTasksByDueDate()).toBe(true);
    expect(() => writeGroupTasksByDueDate(false)).not.toThrow();
  });
});
