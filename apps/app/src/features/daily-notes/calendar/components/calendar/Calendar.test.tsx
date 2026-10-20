// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { writeWeekStart } from '../../weekStart';
import { Calendar } from './Calendar';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 15));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderCalendar(
  mode: 'week' | 'month',
  onSelectedDateChange = vi.fn()
) {
  render(
    <Calendar
      mode={mode}
      selectedDate="2026-07-15"
      onSelectedDateChange={onSelectedDateChange}
      onModeChange={() => {}}
    />
  );
  return onSelectedDateChange;
}

const headers = () =>
  Array.from(document.querySelectorAll('.calendar-weekday')).map((el) =>
    el.getAttribute('title')
  );
const firstRow = () =>
  Array.from(
    document
      .querySelector('.calendar-month .calendar-week-row, .calendar-week-row')!
      .querySelectorAll('.calendar-cell__date')
  ).map((el) => el.textContent);

describe('Calendar week start', () => {
  it('is Monday-first by default, in month mode', () => {
    renderCalendar('month');
    expect(headers()[0]).toBe('Monday');
    expect(firstRow()).toEqual(['29', '30', '1', '2', '3', '4', '5']);
  });

  it('is Sunday-first when saved, in month mode', () => {
    writeWeekStart('sunday');
    renderCalendar('month');
    expect(headers()[0]).toBe('Sunday');
    expect(firstRow()).toEqual(['28', '29', '30', '1', '2', '3', '4']);
    cleanup();
    writeWeekStart('monday');
    renderCalendar('month');
    expect(headers()).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(firstRow()).toEqual(['29', '30', '1', '2', '3', '4', '5']);
  });

  it('week mode follows the preference too', () => {
    renderCalendar('week');
    expect(firstRow()).toEqual(['13', '14', '15', '16', '17', '18', '19']);
    cleanup();
    writeWeekStart('sunday');
    renderCalendar('week');
    expect(firstRow()).toEqual(['12', '13', '14', '15', '16', '17', '18']);
  });

  it('updates a mounted calendar when the preference changes', () => {
    renderCalendar('month');
    expect(headers()[0]).toBe('Monday');
    act(() => writeWeekStart('sunday'));
    expect(headers()[0]).toBe('Sunday');
    act(() => writeWeekStart('monday'));
    expect(headers()[0]).toBe('Monday');
  });

  it.each(['sunday', 'monday'] as const)(
    'clicking a date reports the same date either way (%s-first)',
    (weekStart) => {
      writeWeekStart(weekStart);
      const onSelect = renderCalendar('month');
      fireEvent.click(
        screen
          .getAllByText('20')
          .find((el) =>
            el.closest('.calendar-cell:not(.calendar-cell--outside-month)')
          )!
      );
      expect(onSelect).toHaveBeenCalledWith('2026-07-20');
      fireEvent.click(
        screen
          .getAllByText('1')
          .find((el) =>
            el.closest('.calendar-cell:not(.calendar-cell--outside-month)')
          )!
      );
      expect(onSelect).toHaveBeenLastCalledWith('2026-07-01');
    }
  );

  it('an outside-month cell reports its own real date in either mode', () => {
    const onSelect = renderCalendar('month');
    // Monday-first (the default) July 2026: the first row's first cell is June 29.
    fireEvent.click(
      document.querySelector('.calendar-month .calendar-cell--outside-month')!
    );
    expect(onSelect).toHaveBeenCalledWith('2026-06-29');
  });

  it.each(['sunday', 'monday'] as const)(
    'Today and previous/next navigation are unaffected (%s-first)',
    (weekStart) => {
      writeWeekStart(weekStart);
      const onSelect = renderCalendar('month');
      const [previous, today, next] = Array.from(
        document.querySelectorAll('.calendar-actions button')
      );
      fireEvent.click(next!);
      expect(
        document.querySelector('.calendar-header .calendar-month')
      ).toHaveTextContent('Aug');
      fireEvent.click(previous!);
      fireEvent.click(previous!);
      expect(
        document.querySelector('.calendar-header .calendar-month')
      ).toHaveTextContent('Jun');
      fireEvent.click(today!);
      expect(onSelect).toHaveBeenCalledWith('2026-07-15');
      expect(
        document.querySelector('.calendar-header .calendar-month')
      ).toHaveTextContent('Jul');
    }
  );
});
