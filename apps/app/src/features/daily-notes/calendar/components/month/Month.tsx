import './Month.css';

import type { CalendarDate as CalendarDateModel } from '../../models/CalendarDate';
import { CalendarWeek } from '../week/Week';
import { isToday } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time';

interface CalendarMonthProps {
  weeks: CalendarDateModel[][];
  onSelectedDateChange(fullDate: ISODate): void;
}

export function CalendarMonth({
  weeks,
  onSelectedDateChange,
}: CalendarMonthProps) {
  return (
    <div className="calendar-month">
      {/* Calendar weeks */}
      {weeks.map((week, index) => {
        const isCurrentWeek = week.some((date) => isToday(date.fullDate));
        return (
          <CalendarWeek
            key={index}
            dates={week}
            onSelectedDateChange={onSelectedDateChange}
            isCurrentWeek={isCurrentWeek}
          />
        );
      })}
    </div>
  );
}
