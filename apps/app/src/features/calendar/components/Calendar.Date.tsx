import type { ReactNode } from 'react';
import type { CalendarDate as CalendarDateModel } from '../models/CalendarDate';
import './Calendar.Date.css';

export interface CalendarDateProps extends CalendarDateModel {
  indicator?: ReactNode;

  onClick(fullDate: string): void;
}

export function CalendarDate({
  fullDate,
  date,
  isToday,
  isSelected,
  isOutsideMonth,
  indicator,
  onClick,
}: CalendarDateProps) {
  return (
    <button
      className={`calendar-cell ${isToday ? `calendar-cell--today` : ''} ${isSelected ? `calendar-cell--selected` : ''} ${isOutsideMonth ? 'calendar-cell--outside-month' : ''}`}
      type="button"
      aria-selected={isSelected}
      onClick={() => onClick(fullDate)}
    >
      <span className="calendar-cell__date">{date}</span>
      {indicator && (
        <span className="calendar-cell__indicator">{indicator}</span>
      )}
    </button>
  );
}
