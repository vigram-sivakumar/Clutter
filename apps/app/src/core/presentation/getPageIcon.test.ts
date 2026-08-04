import { describe, expect, it } from 'vitest';
import { getPageIcon } from './getPageIcon';

describe('getPageIcon', () => {
  it('returns the plain calendar icon for a daily-note by default', () => {
    expect(getPageIcon('daily-note')).toBe('calendar');
  });

  it('returns the dotted calendar icon for a daily-note when isToday is true', () => {
    expect(getPageIcon('daily-note', true)).toBe('calendarDot');
  });

  it('returns the plain calendar icon for a daily-note when isToday is explicitly false', () => {
    expect(getPageIcon('daily-note', false)).toBe('calendar');
  });

  it('ignores isToday for every other type', () => {
    expect(getPageIcon('note', true)).toBe('squiggleLine');
    expect(getPageIcon('folder', true)).toBe('folder');
    expect(getPageIcon('tag', true)).toBe('tag');
  });
});
