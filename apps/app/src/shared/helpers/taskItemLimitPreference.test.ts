// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FOLDER_ITEM_LIMIT_CHOICES, readFolderItemLimitChoice } from './folderItemLimitPreference';
import {
  DEFAULT_TASK_ITEM_LIMIT_CHOICE,
  readTaskItemLimitChoice,
  subscribeTaskItemLimitChoice,
  writeTaskItemLimitChoice,
} from './taskItemLimitPreference';

const KEY = 'clutter-task-item-limit';

beforeEach(() => localStorage.clear());

describe('task item limit preference', () => {
  it('defaults to 5, with nothing saved', () => {
    expect(DEFAULT_TASK_ITEM_LIMIT_CHOICE).toBe(5);
    expect(readTaskItemLimitChoice()).toBe(5);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('uses the same choices as the folder Show setting', () => {
    expect([...FOLDER_ITEM_LIMIT_CHOICES]).toEqual([5, 10, 15, 20, 'all']);
  });

  it.each([10, 15, 20, 'all'] as const)('saves %s and reads it back, as after a restart', (choice) => {
    writeTaskItemLimitChoice(choice);

    expect(localStorage.getItem(KEY)).toBe(String(choice));
    expect(readTaskItemLimitChoice()).toBe(choice);
  });

  it('choosing the default removes the saved value', () => {
    writeTaskItemLimitChoice(15);
    writeTaskItemLimitChoice(5);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readTaskItemLimitChoice()).toBe(5);
  });

  it.each(['', '0', '7', 'many', '-5'])('reads an unrecognised stored value (%j) as the default', (value) => {
    localStorage.setItem(KEY, value);

    expect(readTaskItemLimitChoice()).toBe(5);
  });

  it('is its own choice: it never reads or writes the folder one', () => {
    writeTaskItemLimitChoice(20);

    expect(readFolderItemLimitChoice()).toBe(10);
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  it('tells subscribers when it changes, and stops after they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTaskItemLimitChoice(listener);

    writeTaskItemLimitChoice(10);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeTaskItemLimitChoice(5);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to 5 when storage is unavailable, and does not throw writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readTaskItemLimitChoice()).toBe(5);
    expect(() => writeTaskItemLimitChoice(10)).not.toThrow();
  });
});
