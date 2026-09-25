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
