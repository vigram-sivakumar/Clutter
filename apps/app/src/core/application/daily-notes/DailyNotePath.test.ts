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
