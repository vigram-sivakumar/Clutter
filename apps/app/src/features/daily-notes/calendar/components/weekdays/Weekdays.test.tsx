// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CalendarWeekdays } from './Weekdays';

afterEach(cleanup);

const headers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.calendar-weekday')).map((el) => [
    el.textContent,
    el.getAttribute('title'),
  ]);

describe('CalendarWeekdays', () => {
  it('is Sunday through Saturday by default', () => {
    const { container } = render(<CalendarWeekdays />);
    expect(headers(container).map(([letter]) => letter)).toEqual([
      'S',
      'M',
      'T',
      'W',
      'T',
      'F',
      'S',
    ]);
    expect(headers(container)[0]![1]).toBe('Sunday');
  });

  it('is Monday through Sunday when the week starts on Monday', () => {
    const { container } = render(<CalendarWeekdays weekStart="monday" />);
    expect(headers(container)).toEqual([
      ['M', 'Monday'],
      ['T', 'Tuesday'],
      ['W', 'Wednesday'],
      ['T', 'Thursday'],
      ['F', 'Friday'],
      ['S', 'Saturday'],
      ['S', 'Sunday'],
    ]);
  });
});
