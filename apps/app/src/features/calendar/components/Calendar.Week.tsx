import './Calendar.Week.css';
import { CalendarDate } from './Calendar.Date';
import type { CalendarDate as CalendarDateModel } from '../models/CalendarDate';

interface CalendarWeekProps {
  dates: CalendarDateModel[];
  isCurrentWeek?: boolean;
  onSelectedDateChange(fullDate: string): void;
}

export function CalendarWeek({
  dates,
  isCurrentWeek,
  onSelectedDateChange,
}: CalendarWeekProps) {
  return (
    <div className={`calendar-week-row ${isCurrentWeek ? 'current-week' : ''}`}>
      {dates.map((date) => (
        <CalendarDate
          key={date.fullDate}
          fullDate={date.fullDate}
          date={date.date}
          isToday={date.isToday}
          isSelected={date.isSelected}
          isOutsideMonth={date.isOutsideMonth}
          onClick={onSelectedDateChange}
        />
      ))}
    </div>
  );
}
