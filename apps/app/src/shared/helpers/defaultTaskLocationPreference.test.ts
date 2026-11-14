// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readDefaultTaskLocation,
  writeDefaultTaskLocation,
  subscribeDefaultTaskLocation,
} from './defaultTaskLocationPreference';
import { resetAppPreferences } from '@features/settings/reset-settings/resetAppPreferences';
describe('default task location', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
  });
  it('defaults to Inbox and rejects unrecognized stored preferences', () => {
    expect(readDefaultTaskLocation()).toBe('inbox');
    localStorage.setItem('clutter-default-task-location', 'unknown');
    expect(readDefaultTaskLocation()).toBe('inbox');
  });
  it('persists both alternatives, notifies subscribers and resets to Inbox', () => {
    const listener = vi.fn();
    const stop = subscribeDefaultTaskLocation(listener);
    writeDefaultTaskLocation('today');
    expect(readDefaultTaskLocation()).toBe('today');
    writeDefaultTaskLocation('due-date');
    expect(readDefaultTaskLocation()).toBe('due-date');
    expect(listener).toHaveBeenCalledTimes(2);
    resetAppPreferences();
    expect(readDefaultTaskLocation()).toBe('inbox');
    expect(localStorage.getItem('clutter-default-task-location')).toBeNull();
    stop();
  });
});
