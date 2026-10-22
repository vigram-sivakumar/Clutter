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
  it('is off by default, for a new installation and for one with no stored value', () => {
    expect(DEFAULT_GROUP_TASKS_BY_DUE_DATE).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readGroupTasksByDueDate()).toBe(false);
  });

  it('persists being turned on, and a fresh read (as after a restart) sees it', () => {
    writeGroupTasksByDueDate(true);

    expect(localStorage.getItem(KEY)).toBe('true');
    expect(readGroupTasksByDueDate()).toBe(true);
  });

  it('turning it off again removes the stored value, so a missing value is the default', () => {
    writeGroupTasksByDueDate(true);
    writeGroupTasksByDueDate(false);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readGroupTasksByDueDate()).toBe(false);
  });

  it.each(['', 'false', '1', 'yes', 'TRUE'])('reads an unrecognised stored value (%j) as the default, off', (value) => {
    localStorage.setItem(KEY, value);

    expect(readGroupTasksByDueDate()).toBe(false);
  });

  it('is app-wide: it lives in the browser store only, never in a Space or a note', () => {
    writeGroupTasksByDueDate(true);

    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  it('tells subscribers when it changes, and stops after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGroupTasksByDueDate(listener);

    writeGroupTasksByDueDate(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeGroupTasksByDueDate(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to off when storage is unavailable, and does not throw writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readGroupTasksByDueDate()).toBe(false);
    expect(() => writeGroupTasksByDueDate(true)).not.toThrow();
  });
});
