import './Week.css';
import { CalendarDate } from '../date/Date';
import type { CalendarDate as CalendarDateModel } from '../../models/CalendarDate';
import type { ISODate } from '@shared/helpers/time';

interface CalendarWeekProps {
  dates: CalendarDateModel[];
  isCurrentWeek?: boolean;
  notedDates?: Set<string>;
  onSelectedDateChange(fullDate: ISODate): void;
}

export function CalendarWeek({
  dates,
  isCurrentWeek,
  notedDates,
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
          indicator={
            notedDates?.has(date.fullDate) ? (
              <span className="calendar-cell__dot" />
            ) : undefined
          }
          onClick={onSelectedDateChange}
        />
      ))}
    </div>
  );
}
