// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FOLDER_ITEM_LIMIT_CHOICE,
  FOLDER_ITEM_LIMIT_CHOICES,
  readFolderItemLimitChoice,
  subscribeFolderItemLimitChoice,
  toFolderItemLimit,
  writeFolderItemLimitChoice,
} from './folderItemLimitPreference';

const KEY = 'clutter-folder-item-limit';

beforeEach(() => localStorage.clear());

describe('folder item limit preference', () => {
  it('defaults to the 10 the sidebar always capped at, with nothing saved', () => {
    expect(DEFAULT_FOLDER_ITEM_LIMIT_CHOICE).toBe(10);
    expect(readFolderItemLimitChoice()).toBe(10);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('offers 5, 10, 15, 20 and Show all', () => {
    expect([...FOLDER_ITEM_LIMIT_CHOICES]).toEqual([5, 10, 15, 20, 'all']);
  });

  it.each(FOLDER_ITEM_LIMIT_CHOICES.filter((choice) => choice !== 10))(
    'saves %s and reads it back, as after a restart',
    (choice) => {
      writeFolderItemLimitChoice(choice);
      expect(localStorage.getItem(KEY)).toBe(String(choice));
      expect(readFolderItemLimitChoice()).toBe(choice);
    }
  );

  it('choosing the default again removes the saved value', () => {
    writeFolderItemLimitChoice(20);
    writeFolderItemLimitChoice(10);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readFolderItemLimitChoice()).toBe(10);
  });

  it.each(['', '7', '0', '-5', 'ALL', 'many', '10.5'])(
    'treats an unrecognised saved value (%j) as the default',
    (value) => {
      localStorage.setItem(KEY, value);
      expect(readFolderItemLimitChoice()).toBe(10);
    }
  );

  it('is app-wide: it lives in the browser store, never in a Space', () => {
    writeFolderItemLimitChoice(15);
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  it('notifies subscribers of a change, until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFolderItemLimitChoice(listener);
    writeFolderItemLimitChoice(5);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeFolderItemLimitChoice(15);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('turns Show all into no cap at all', () => {
    expect(toFolderItemLimit(5)).toBe(5);
    expect(toFolderItemLimit('all')).toBe(Infinity);
    expect(12 > toFolderItemLimit('all')).toBe(false);
  });
});
