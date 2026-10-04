import { describe, expect, it } from 'vitest';

import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';

import { dateRow } from './dateCompletionRow';

describe('dateRow', () => {
  it('shows only formatDateDisplay(isoDate, "shortWeekday") — no raw ISO date', () => {
    const row = dateRow({ label: '12 August', isoDate: '2026-08-12' });

    expect(row.title).toBe(formatDateDisplay('2026-08-12', 'shortWeekday'));
    expect(row.title).not.toContain('2026-08-12');
    expect(row.trailing).toBeUndefined();
  });

  it('shows a relative keyword on the right, next to the full date it resolved to', () => {
    const row = dateRow({ label: 'Today', isoDate: '2026-10-04' });

    expect(row.title).toBe(formatDateDisplay('2026-10-04', 'shortWeekday'));
    expect(row.trailing).toBe('Today');
  });
});
