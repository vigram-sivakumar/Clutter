import { describe, expect, it } from 'vitest';

import { DailyNotePath } from './DailyNotePath';

describe('DailyNotePath', () => {
  it('builds a path from a date using owned month folder names', () => {
    expect(DailyNotePath.from(new Date(2026, 6, 30))).toBe(
      'Daily Notes/2026/July/2026-07-30.md'
    );
  });

  it('builds an absolute path by prefixing the vault root', () => {
    expect(DailyNotePath.absoluteFrom('/vault', new Date(2026, 6, 30))).toBe(
      '/vault/Daily Notes/2026/July/2026-07-30.md'
    );
  });

  it('derives month ISO date from year and month folder names', () => {
    expect(DailyNotePath.monthIsoFromFolderNames('2026', 'July')).toBe(
      '2026-07-01'
    );
    expect(DailyNotePath.monthIsoFromFolderNames('2025', 'December')).toBe(
      '2025-12-01'
    );
  });

  it('sorts newer month folders before older ones via ISO dates', () => {
    const july2026 = DailyNotePath.monthIsoFromFolderNames('2026', 'July');
    const december2025 = DailyNotePath.monthIsoFromFolderNames(
      '2025',
      'December'
    );

    expect(july2026.localeCompare(december2025)).toBeGreaterThan(0);
  });

  it('throws for an unknown month folder name', () => {
    expect(() =>
      DailyNotePath.monthIsoFromFolderNames('2026', 'Jly')
    ).toThrow('Unknown Daily Notes month folder: Jly');
  });
});

describe('DailyNotePath.matchesCanonicalPath', () => {
  const ROOT = '/vault';

  it('matches the exact canonical path for a date', () => {
    expect(
      DailyNotePath.matchesCanonicalPath(
        ROOT,
        `${ROOT}/Daily Notes/2026/August/2026-08-12.md`
      )
    ).toBe(true);
  });

  it('rejects a non-date filename', () => {
    expect(
      DailyNotePath.matchesCanonicalPath(ROOT, `${ROOT}/Daily Notes/Random Note.md`)
    ).toBe(false);
  });

  it('rejects a date-looking filename with no year/month folders', () => {
    expect(
      DailyNotePath.matchesCanonicalPath(ROOT, `${ROOT}/Daily Notes/2026-08-12.md`)
    ).toBe(false);
  });

  it('rejects numeric month folder names instead of the full month name', () => {
    expect(
      DailyNotePath.matchesCanonicalPath(
        ROOT,
        `${ROOT}/Daily Notes/2026/08/2026-08-12.md`
      )
    ).toBe(false);
  });

  it('rejects extra nesting beyond year/month', () => {
    expect(
      DailyNotePath.matchesCanonicalPath(
        ROOT,
        `${ROOT}/Daily Notes/2026/August/12/Random.md`
      )
    ).toBe(false);
  });

  it('rejects a year segment that disagrees with the filename year', () => {
    expect(
      DailyNotePath.matchesCanonicalPath(
        ROOT,
        `${ROOT}/Daily Notes/2025/August/2026-08-12.md`
      )
    ).toBe(false);
  });

  it('rejects a path outside Daily Notes entirely', () => {
    expect(
      DailyNotePath.matchesCanonicalPath(ROOT, `${ROOT}/Projects/2026-08-12.md`)
    ).toBe(false);
  });

  it('rejects an impossible calendar date (day-of-month rollover)', () => {
    expect(
      DailyNotePath.matchesCanonicalPath(
        ROOT,
        `${ROOT}/Daily Notes/2026/February/2026-02-30.md`
      )
    ).toBe(false);
  });

  describe('folderLevel — what a folder is within the Daily Notes tree', () => {
    it.each([
      ['/vault/Daily Notes', 'root'],
      ['/vault/Daily Notes/2026', 'year'],
      ['/vault/Daily Notes/2026/October', 'month'],
    ])('%s is the %s', (path, level) => {
      expect(DailyNotePath.folderLevel('/vault', path)).toBe(level);
    });

    it.each([
      '/vault/Projects',
      '/vault/Projects/2026',
      '/vault/Daily Notes/Misc', // not a year
      '/vault/Daily Notes/26', // not a four-digit year
      '/vault/Daily Notes/2026/Octobre', // not a month
      '/vault/Daily Notes/2026/October/Week 1', // deeper than a month
      '/vault/Daily Notes Archive',
      '/elsewhere/Daily Notes',
    ])('%s is not part of the tree', (path) => {
      expect(DailyNotePath.folderLevel('/vault', path)).toBeNull();
    });
  });

  describe('compareFolderNames — years newest first, months January to December', () => {
    const sorted = (level: 'root' | 'year', names: string[]) =>
      [...names].sort((a, b) => DailyNotePath.compareFolderNames(level, a, b));

    it('puts the latest year first', () => {
      expect(sorted('root', ['2024', '2026', '2025', '2023'])).toEqual(['2026', '2025', '2024', '2023']);
    });

    it('puts months in calendar order, not alphabetical (April, August, ... would come first)', () => {
      expect(sorted('year', ['October', 'April', 'January', 'December', 'August', 'February'])).toEqual([
        'January',
        'February',
        'April',
        'August',
        'October',
        'December',
      ]);
    });

    it('puts a name that is not a year or month after the real ones, in alphabetical order', () => {
      expect(sorted('root', ['Misc', '2024', 'Archive', '2026'])).toEqual(['2026', '2024', 'Archive', 'Misc']);
      expect(sorted('year', ['Zed', 'March', 'Alpha', 'January'])).toEqual(['January', 'March', 'Alpha', 'Zed']);
    });
  });

  describe('isWithinRoot — the Daily Notes folder and everything inside it', () => {
    it.each([
      '/vault/Daily Notes',
      '/vault/Daily Notes/Foo.md',
      '/vault/Daily Notes/2026',
      '/vault/Daily Notes/2026/October/Foo.md',
      '/vault/Daily Notes/2099/March/Anything/Deep.md',
      '/vault/daily notes/2026/October/Foo.md', // the file system does not tell these apart
      '/vault/DAILY NOTES/Foo.md',
    ])('%s is inside', (path) => {
      expect(DailyNotePath.isWithinRoot('/vault', path)).toBe(true);
    });

    it.each([
      '/vault/Projects/Foo.md',
      '/vault/Projects/Daily Notes/Foo.md', // a folder of that name somewhere else is just a folder
      '/vault/Daily Notes Archive/Foo.md', // a sibling that merely starts the same
      '/vault/Daily NotesX/Foo.md',
      '/vault/Foo.md',
      '/elsewhere/Daily Notes/Foo.md', // not under this vault
    ])('%s is not', (path) => {
      expect(DailyNotePath.isWithinRoot('/vault', path)).toBe(false);
    });
  });
});

