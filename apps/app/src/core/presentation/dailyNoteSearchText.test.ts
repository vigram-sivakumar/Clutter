import { describe, expect, it } from 'vitest';

import { matchesSearchText } from '@shared/helpers/matchesSearchText';

import { dailyNoteSearchText } from './dailyNoteSearchText';
import { formatDailyNotePickerTitle, formatDailyNoteTitle } from './formatDailyNoteTitle';

describe('dailyNoteSearchText', () => {
  it('holds the canonical name and both of the app\'s own date titles, from the existing formatters', () => {
    const text = dailyNoteSearchText('2020-08-24');

    expect(text).toContain('2020-08-24');
    expect(text).toContain(formatDailyNoteTitle('2020-08-24'));
    expect(text).toContain(formatDailyNotePickerTitle('2020-08-24'));
    expect(formatDailyNoteTitle('2020-08-24')).toBe('Monday, 24 August 2020');
  });

  it.each(['2020-08-24', 'aug', 'august', 'aug 24', 'august 24', 'aug 24, 2020', 'monday', '24 aug'])(
    'is found by "%s"',
    (query) => {
      expect(matchesSearchText(dailyNoteSearchText('2020-08-24'), query)).toBe(true);
    }
  );

  it.each(['sep', 'aug 25', 'tuesday', '2021'])('is not found by "%s"', (query) => {
    expect(matchesSearchText(dailyNoteSearchText('2020-08-24'), query)).toBe(false);
  });

  it('degrades to the raw name for a malformed one, as the formatters do', () => {
    expect(dailyNoteSearchText('not-a-date')).toBe('not-a-date not-a-date not-a-date');
  });
});
