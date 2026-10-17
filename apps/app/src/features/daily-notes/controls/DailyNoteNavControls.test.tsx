// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DailyNoteNavControls } from './DailyNoteNavControls';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

describe('DailyNoteNavControls', () => {
  it('renders Calendar, Previous, Today, Next in that order', () => {
    render(<DailyNoteNavControls date="2026-01-15" onNavigateToDate={vi.fn()} />);

    const controls = document.querySelector('.daily-note-nav-controls')!;
    const buttons = controls.querySelectorAll('button');
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Open calendar');
    expect(buttons[1]).toHaveAttribute('aria-label', 'Previous day');
    expect(buttons[2]).toHaveAttribute('aria-label', 'Today');
    expect(buttons[3]).toHaveAttribute('aria-label', 'Next day');
  });

  it('Previous navigates to the previous calendar day', () => {
    const onNavigateToDate = vi.fn();
    render(<DailyNoteNavControls date="2026-01-15" onNavigateToDate={onNavigateToDate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));

    expect(onNavigateToDate).toHaveBeenCalledWith('2026-01-14');
  });

  it('Next navigates to the next calendar day', () => {
    const onNavigateToDate = vi.fn();
    render(<DailyNoteNavControls date="2026-01-15" onNavigateToDate={onNavigateToDate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));

    expect(onNavigateToDate).toHaveBeenCalledWith('2026-01-16');
  });

  it('Previous correctly rolls across a month boundary', () => {
    const onNavigateToDate = vi.fn();
    render(<DailyNoteNavControls date="2026-02-01" onNavigateToDate={onNavigateToDate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));

    expect(onNavigateToDate).toHaveBeenCalledWith('2026-01-31');
  });

  it('Today navigates to today\'s date, not an offset from the viewed date', () => {
    const onNavigateToDate = vi.fn();
    render(<DailyNoteNavControls date="2020-01-01" onNavigateToDate={onNavigateToDate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    expect(onNavigateToDate).toHaveBeenCalledWith(expected);
  });

  it('Calendar button opens the existing Calendar overlay showing the viewed date as selected', () => {
    render(<DailyNoteNavControls date="2026-01-15" onNavigateToDate={vi.fn()} />);

    expect(document.querySelector('.calendar')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));

    const calendar = document.querySelector('.calendar');
    expect(calendar).not.toBeNull();
    expect(calendar!.querySelector('.calendar-cell--selected')).not.toBeNull();
  });

  it('selecting a date in the calendar navigates there and closes the overlay', () => {
    const onNavigateToDate = vi.fn();
    render(<DailyNoteNavControls date="2026-01-15" onNavigateToDate={onNavigateToDate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    const targetDay = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.calendar-cell')
    ).find((button) => button.textContent?.trim() === '10');
    expect(targetDay).toBeDefined();

    fireEvent.click(targetDay!);

    expect(onNavigateToDate).toHaveBeenCalledWith('2026-01-10');
    expect(document.querySelector('.calendar')).toBeNull();
  });
});

describe('DailyNoteNavControls: visibleControls', () => {
  const labels = () =>
    Array.from(document.querySelectorAll('.daily-note-nav-controls button')).map((button) =>
      button.getAttribute('aria-label')
    );

  it('omitted: all four controls, exactly as before', () => {
    render(<DailyNoteNavControls date="2026-01-15" onNavigateToDate={vi.fn()} />);
    expect(labels()).toEqual(['Open calendar', 'Previous day', 'Today', 'Next day']);
    expect(document.querySelector('.daily-note__date-nav')).not.toBeNull();
  });

  it('listing all four is the same as omitting it', () => {
    render(
      <DailyNoteNavControls
        date="2026-01-15"
        onNavigateToDate={vi.fn()}
        visibleControls={['calendar', 'previousDay', 'today', 'nextDay']}
      />
    );
    expect(labels()).toEqual(['Open calendar', 'Previous day', 'Today', 'Next day']);
  });

  it('calendar only: just the calendar button, and no empty date-navigation wrapper', () => {
    render(
      <DailyNoteNavControls date="2026-01-15" onNavigateToDate={vi.fn()} visibleControls={['calendar']} />
    );
    expect(labels()).toEqual(['Open calendar']);
    expect(document.querySelector('.daily-note__date-nav')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open calendar' })).toBeInTheDocument();
  });

  it('calendar only: the calendar still opens with the viewed date selected, and selecting a date navigates and closes it', () => {
    const onNavigateToDate = vi.fn();
    render(
      <DailyNoteNavControls date="2026-01-15" onNavigateToDate={onNavigateToDate} visibleControls={['calendar']} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    const calendar = document.querySelector('.calendar');
    expect(calendar).not.toBeNull();
    expect(calendar!.querySelector('.calendar-cell--selected')).not.toBeNull();

    const targetDay = Array.from(document.querySelectorAll<HTMLButtonElement>('.calendar-cell')).find(
      (button) => button.textContent?.trim() === '10'
    );
    fireEvent.click(targetDay!);

    expect(onNavigateToDate).toHaveBeenCalledWith('2026-01-10');
    expect(document.querySelector('.calendar')).toBeNull();
  });

  it('a subset is drawn in the row\'s own order, whatever order it is listed in', () => {
    render(
      <DailyNoteNavControls
        date="2026-01-15"
        onNavigateToDate={vi.fn()}
        visibleControls={['nextDay', 'today']}
      />
    );
    expect(labels()).toEqual(['Today', 'Next day']);
    expect(document.querySelector('.daily-note__date-nav')).not.toBeNull();
  });

  it('a hidden control is simply absent: the visible ones keep working', () => {
    const onNavigateToDate = vi.fn();
    render(
      <DailyNoteNavControls
        date="2026-01-15"
        onNavigateToDate={onNavigateToDate}
        visibleControls={['previousDay', 'nextDay']}
      />
    );
    expect(labels()).toEqual(['Previous day', 'Next day']);
    expect(screen.queryByRole('button', { name: 'Open calendar' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));

    expect(onNavigateToDate).toHaveBeenNthCalledWith(1, '2026-01-14');
    expect(onNavigateToDate).toHaveBeenNthCalledWith(2, '2026-01-16');
  });

  it('an empty list draws nothing at all — not even the wrapper', () => {
    const { container } = render(
      <DailyNoteNavControls date="2026-01-15" onNavigateToDate={vi.fn()} visibleControls={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DailyNoteNavControls: the calendar button exposes its open state', () => {
  it('is a collapsed popup trigger at rest, expanded while the calendar is open, collapsed again after a pick', () => {
    render(<DailyNoteNavControls date="2026-01-15" onNavigateToDate={vi.fn()} visibleControls={['calendar']} />);
    const button = screen.getByRole('button', { name: 'Open calendar' });

    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    const targetDay = Array.from(document.querySelectorAll<HTMLButtonElement>('.calendar-cell')).find(
      (cell) => cell.textContent?.trim() === '10'
    );
    fireEvent.click(targetDay!);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('DailyNoteNavControls: the calendar button while its calendar is open', () => {
  it('keeps the forced-hover highlight (the app-wide active trigger state) exactly while the calendar is open', () => {
    render(<DailyNoteNavControls date="2026-01-15" onNavigateToDate={vi.fn()} visibleControls={['calendar']} />);
    const button = screen.getByRole('button', { name: 'Open calendar' });
    expect(button).not.toHaveClass('button--active');

    fireEvent.click(button);
    expect(button).toHaveClass('button--active');

    fireEvent.click(button);
    expect(button).not.toHaveClass('button--active');
  });

  it('controlled: the host decides, so the calendar opens only when told to, and asks to change on click', () => {
    const onCalendarOpenChange = vi.fn();
    const { rerender } = render(
      <DailyNoteNavControls
        date="2026-01-15"
        onNavigateToDate={vi.fn()}
        visibleControls={['calendar']}
        calendarOpen={false}
        onCalendarOpenChange={onCalendarOpenChange}
      />
    );
    const button = screen.getByRole('button', { name: 'Open calendar' });

    fireEvent.click(button);
    expect(onCalendarOpenChange).toHaveBeenLastCalledWith(true);
    expect(document.querySelector('.calendar')).toBeNull(); // the host has not opened it

    rerender(
      <DailyNoteNavControls
        date="2026-01-15"
        onNavigateToDate={vi.fn()}
        visibleControls={['calendar']}
        calendarOpen
        onCalendarOpenChange={onCalendarOpenChange}
      />
    );
    expect(document.querySelector('.calendar')).not.toBeNull();
    expect(button).toHaveClass('button--active');

    fireEvent.click(button);
    expect(onCalendarOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('controlled: picking a date navigates and asks the host to close the calendar', () => {
    const onNavigateToDate = vi.fn();
    const onCalendarOpenChange = vi.fn();
    render(
      <DailyNoteNavControls
        date="2026-01-15"
        onNavigateToDate={onNavigateToDate}
        visibleControls={['calendar']}
        calendarOpen
        onCalendarOpenChange={onCalendarOpenChange}
      />
    );

    const targetDay = Array.from(document.querySelectorAll<HTMLButtonElement>('.calendar-cell')).find(
      (cell) => cell.textContent?.trim() === '10'
    );
    fireEvent.click(targetDay!);

    expect(onNavigateToDate).toHaveBeenCalledWith('2026-01-10');
    expect(onCalendarOpenChange).toHaveBeenLastCalledWith(false);
  });
});

