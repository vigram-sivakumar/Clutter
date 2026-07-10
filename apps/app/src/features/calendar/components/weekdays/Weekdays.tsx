import './Weekdays.css';

export function CalendarWeekdays() {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="calendar-weekdays-row">
      {DAYS.map((day, index) => (
        <span key={index} className="calendar-weekday">
          {day}
        </span>
      ))}
    </div>
  );
}
