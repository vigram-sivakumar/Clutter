// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CalendarWeek } from './Week';
import type { CalendarDate } from '../../models/CalendarDate';

afterEach(() => {
  cleanup();
});

function makeDate(overrides: Partial<CalendarDate> = {}): CalendarDate {
  return {
    fullDate: '2026-07-15',
    date: 15,
    isToday: false,
    isSelected: false,
    isOutsideMonth: false,
    ...overrides,
  };
}

describe('CalendarWeek', () => {
  it('renders a dot indicator only for dates present in notedDates', () => {
    const dates = [
      makeDate({ fullDate: '2026-07-14', date: 14 }),
      makeDate({ fullDate: '2026-07-15', date: 15 }),
    ];
    const notedDates = new Set(['2026-07-15']);

    const { container } = render(
      <CalendarWeek dates={dates} notedDates={notedDates} onSelectedDateChange={() => {}} />
    );

    const cells = container.querySelectorAll('.calendar-cell');
    expect(cells[0]!.querySelector('.calendar-cell__dot')).toBeNull();
    expect(cells[1]!.querySelector('.calendar-cell__dot')).not.toBeNull();
  });

  it('renders no indicators when notedDates is not provided', () => {
    const dates = [makeDate()];

    const { container } = render(
      <CalendarWeek dates={dates} onSelectedDateChange={() => {}} />
    );

    expect(container.querySelector('.calendar-cell__dot')).toBeNull();
  });
});
