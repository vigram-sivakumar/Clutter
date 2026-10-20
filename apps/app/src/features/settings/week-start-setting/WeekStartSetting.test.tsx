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

import { Calendar } from '@features/daily-notes/calendar/components/calendar/Calendar';
import { readWeekStart } from '@features/daily-notes/calendar/weekStart';
import { WeekStartSetting } from './WeekStartSetting';

const KEY = 'clutter-week-start';
const toggle = () =>
  screen.getByRole('switch', { name: 'Start week on Monday' });
const headers = () =>
  Array.from(document.querySelectorAll('.calendar-weekday')).map((el) =>
    el.getAttribute('title')
  );

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 15));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WeekStartSetting', () => {
  it('is on by default (Monday-first), with the entry copy', () => {
    render(<WeekStartSetting />);
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText('Start week on Monday', { selector: 'span' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Display Monday as the first day of the week')
    ).toBeInTheDocument();
  });

  it('turning it off makes the week Sunday-first, and persists false', () => {
    const { unmount } = render(<WeekStartSetting />);
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem(KEY)).toBe('sunday');
    expect(readWeekStart()).toBe('sunday');

    unmount();
    render(<WeekStartSetting />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle());
    expect(readWeekStart()).toBe('monday');
  });

  it.each([null, '', 'bogus', 'true', 'Sunday'])(
    'a missing or invalid saved value (%s) is Monday-first',
    (stored) => {
      if (stored !== null) localStorage.setItem(KEY, stored);
      render(<WeekStartSetting />);
      expect(toggle()).toHaveAttribute('aria-checked', 'true');
    }
  );

  it('updates a mounted calendar immediately, headers and dates together', () => {
    render(
      <>
        <WeekStartSetting />
        <Calendar
          mode="month"
          selectedDate="2026-07-15"
          onSelectedDateChange={() => {}}
          onModeChange={() => {}}
        />
      </>
    );
    const firstRow = () =>
      Array.from(
        document
          .querySelector('.calendar-month .calendar-week-row')!
          .querySelectorAll('.calendar-cell__date')
      ).map((el) => el.textContent);
    expect(headers()[0]).toBe('Monday');
    expect(firstRow()).toEqual(['29', '30', '1', '2', '3', '4', '5']);

    act(() => fireEvent.click(toggle()));
    expect(headers()[0]).toBe('Sunday');
    expect(firstRow()).toEqual(['28', '29', '30', '1', '2', '3', '4']);

    act(() => fireEvent.click(toggle()));
    expect(headers()[0]).toBe('Monday');
    expect(firstRow()).toEqual(['29', '30', '1', '2', '3', '4', '5']);
  });
});
