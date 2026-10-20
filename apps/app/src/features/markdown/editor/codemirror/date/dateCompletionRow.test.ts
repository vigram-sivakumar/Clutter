import { describe, expect, it } from 'vitest';

import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

import { dateRow } from './dateCompletionRow';

describe('dateRow', () => {
  it('shows only formatDateDisplay(isoDate, "long") — no raw ISO date', () => {
    const row = dateRow({ label: '12 August', isoDate: '2026-08-12' });

    expect(row.title).toBe(formatDateDisplay('2026-08-12', 'long'));
    expect(row.title).not.toContain('2026-08-12');
    expect(row.trailing).toBeUndefined();
  });

  it('shows nothing beside a relative keyword — the title already reads "Today, ..."', () => {
    const today = toISODate(new Date());
    const row = dateRow({ label: 'Today', isoDate: today });

    expect(row.title).toBe(formatDateDisplay(today, 'long'));
    expect(row.title).toContain('Today');
    expect(row).not.toHaveProperty('trailing');
  });
});
