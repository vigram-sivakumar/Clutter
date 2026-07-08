import './Week.css';
import { CalendarDate } from '../date/Date';
import type { CalendarDate as CalendarDateModel } from '../../models/CalendarDate';
import type { ISODate } from '@shared/helpers/time';

interface CalendarWeekProps {
  dates: CalendarDateModel[];
  isCurrentWeek?: boolean;
  onSelectedDateChange(fullDate: ISODate): void;
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
