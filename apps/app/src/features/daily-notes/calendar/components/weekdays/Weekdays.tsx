import './Weekdays.css';
import { weekdayNames, type WeekStart } from '../../weekStart';

interface CalendarWeekdaysProps {
  weekStart?: WeekStart;
}

export function CalendarWeekdays({
  weekStart = 'sunday',
}: CalendarWeekdaysProps) {
  const narrow = weekdayNames(weekStart, undefined, 'narrow');

  return (
    <div className="calendar-weekdays-row">
      {weekdayNames(weekStart).map((name, index) => (
        <span key={name} className="calendar-weekday" title={name}>
          {narrow[index]}
        </span>
      ))}
    </div>
  );
}
