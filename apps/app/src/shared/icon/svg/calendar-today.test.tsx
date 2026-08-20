// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CalendarTodayIcon } from './calendar-today';

afterEach(() => {
  cleanup();
});

describe('CalendarTodayIcon', () => {
  it('renders the default (today) date without throwing — regression for the toDate() datetime-string trap', () => {
    // Previously fed `(date ?? new Date()).toISOString()` — a full
    // datetime-with-offset string like "2026-08-20T13:48:14.263Z" — into
    // formatDate()/toDate(), which now parses via local `YYYY-MM-DD`
    // component splitting. The stray time segment made the day component
    // NaN, producing an Invalid Date and a RangeError from
    // Intl.DateTimeFormat's format() at render time.
    expect(() => render(<CalendarTodayIcon />)).not.toThrow();
  });

  it('renders the day number for an explicit local Date prop', () => {
    const { container } = render(<CalendarTodayIcon date={new Date(2026, 7, 20)} />);

    expect(container.querySelector('text')?.textContent).toBe('20');
  });

  it('renders correctly for a Date whose local time-of-day is non-midnight — the exact shape .toISOString() previously produced', () => {
    const { container } = render(
      <CalendarTodayIcon date={new Date(2026, 7, 20, 23, 59, 59, 999)} />
    );

    expect(container.querySelector('text')?.textContent).toBe('20');
  });
});
