import './Calendar.Weekdays.css';

export function CalendarWeekdays() {
  const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="calendar-weekdays-row">
      {DAYS.map((day) => (
        <span key={day} className="calendar-weekday">
          {day}
        </span>
      ))}
    </div>
  );
}
