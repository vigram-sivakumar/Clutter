// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CalendarDate } from './Date';

afterEach(() => {
  cleanup();
});

describe('CalendarDate', () => {
  it('renders the day number and calls onClick with the full date', () => {
    const onClick = vi.fn();

    render(
      <CalendarDate
        fullDate="2026-07-15"
        date={15}
        isToday={false}
        isSelected={false}
        isOutsideMonth={false}
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByText('15'));

    expect(onClick).toHaveBeenCalledWith('2026-07-15');
  });

  it('applies the today/selected/outside-month modifier classes based on props', () => {
    const { rerender } = render(
      <CalendarDate
        fullDate="2026-07-15"
        date={15}
        isToday
        isSelected={false}
        isOutsideMonth={false}
        onClick={() => {}}
      />
    );

    let button = screen.getByRole('button');
    expect(button.classList.contains('calendar-cell--today')).toBe(true);
    expect(button.classList.contains('calendar-cell--selected')).toBe(false);
    expect(button.classList.contains('calendar-cell--outside-month')).toBe(false);

    rerender(
      <CalendarDate
        fullDate="2026-07-15"
        date={15}
        isToday={false}
        isSelected
        isOutsideMonth
        onClick={() => {}}
      />
    );

    button = screen.getByRole('button');
    expect(button.classList.contains('calendar-cell--today')).toBe(false);
    expect(button.classList.contains('calendar-cell--selected')).toBe(true);
    expect(button.classList.contains('calendar-cell--outside-month')).toBe(true);
  });

  it('reflects isSelected in aria-selected for accessibility', () => {
    render(
      <CalendarDate
        fullDate="2026-07-15"
        date={15}
        isToday={false}
        isSelected
        isOutsideMonth={false}
        onClick={() => {}}
      />
    );

    expect(screen.getByRole('button').getAttribute('aria-selected')).toBe('true');
  });

  it('renders an indicator when provided, and omits it when not', () => {
    const { rerender, container } = render(
      <CalendarDate
        fullDate="2026-07-15"
        date={15}
        isToday={false}
        isSelected={false}
        isOutsideMonth={false}
        onClick={() => {}}
      />
    );

    expect(container.querySelector('.calendar-cell__indicator')).toBeNull();

    rerender(
      <CalendarDate
        fullDate="2026-07-15"
        date={15}
        isToday={false}
        isSelected={false}
        isOutsideMonth={false}
        indicator={<span>•</span>}
        onClick={() => {}}
      />
    );

    expect(container.querySelector('.calendar-cell__indicator')).not.toBeNull();
    expect(screen.getByText('•')).not.toBeNull();
  });
});
