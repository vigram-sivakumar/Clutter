// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  afterEach(cleanup);

  it('renders the shared Calendar with the selected date', () => {
    render(<DatePicker selectedDate="2026-09-15" onSelectedDateChange={vi.fn()} />);

    expect(document.querySelector('.date-picker .calendar-cell--selected')?.textContent).toBe('15');
  });

  it('reports a picked day', () => {
    const onSelectedDateChange = vi.fn();
    render(<DatePicker selectedDate="2026-09-15" onSelectedDateChange={onSelectedDateChange} />);

    const day = [...document.querySelectorAll('.date-picker button')].find((b) => b.textContent === '20')!;
    fireEvent.click(day);

    expect(onSelectedDateChange).toHaveBeenCalledWith('2026-09-20');
  });

  it('has no footer without Clear or actions', () => {
    render(<DatePicker selectedDate={undefined} onSelectedDateChange={vi.fn()} />);

    expect(document.querySelector('.date-picker__footer')).toBeNull();
  });

  it('draws a separator above the footer', () => {
    render(<DatePicker selectedDate="2026-09-15" onSelectedDateChange={vi.fn()} onClear={vi.fn()} />);

    const divider = document.querySelector('.date-picker > [role="separator"]');
    expect(divider).not.toBeNull();
    expect(divider?.nextElementSibling?.className).toBe('date-picker__footer');
  });

  it('puts Clear first in the footer, left of any other actions', () => {
    render(
      <DatePicker
        selectedDate="2026-09-15"
        onSelectedDateChange={vi.fn()}
        onClear={vi.fn()}
        actions={<button type="button">Time</button>}
      />
    );

    const footer = document.querySelector('.date-picker__footer')!;
    const buttons = [...footer.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Clear', 'Time']);
    expect(footer.querySelector('.date-picker__actions')?.textContent).toBe('Time');
  });

  it('keeps Clear alone in the footer when it is the only action', () => {
    render(<DatePicker selectedDate="2026-09-15" onSelectedDateChange={vi.fn()} onClear={vi.fn()} />);

    const footer = document.querySelector('.date-picker__footer')!;
    expect(footer.firstElementChild?.textContent).toBe('Clear');
    expect(footer.querySelector('.date-picker__actions')).toBeNull();
  });

  it('calls onClear, and disables Clear when there is nothing to clear', () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <DatePicker selectedDate="2026-09-15" onSelectedDateChange={vi.fn()} onClear={onClear} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);

    rerender(<DatePicker selectedDate={undefined} onSelectedDateChange={vi.fn()} onClear={onClear} clearDisabled />);
    expect((screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('only stops a press from taking focus when keepFocusOnPress is set', () => {
    const { rerender } = render(<DatePicker selectedDate={undefined} onSelectedDateChange={vi.fn()} />);
    expect(fireEvent.mouseDown(document.querySelector('.date-picker')!)).toBe(true);

    rerender(<DatePicker selectedDate={undefined} onSelectedDateChange={vi.fn()} keepFocusOnPress />);
    expect(fireEvent.mouseDown(document.querySelector('.date-picker')!)).toBe(false);
  });
});
