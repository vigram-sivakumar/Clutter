import './Month.css';

import type { CalendarDate as CalendarDateModel } from '../../models/CalendarDate';
import { CalendarWeek } from '../week/Week';

interface CalendarMonthProps {
  weeks: CalendarDateModel[][];
  onSelectedDateChange(fullDate: string): void;
}

export function CalendarMonth({
  weeks,
  onSelectedDateChange,
}: CalendarMonthProps) {
  return (
    <div className="calendar-month">
      {/* Calendar weeks */}
      {weeks.map((week, index) => {
        const today = new Date().toISOString().slice(0, 10);
        const isCurrentWeek = week.some((date) => date.fullDate === today);
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
