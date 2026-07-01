import './DateLabel.css';

interface DateLabelProps {
  isToday?: boolean;
  date?: number;
}

export function DateLabel({ isToday = false, date }: DateLabelProps) {
  if (isToday) {
    return (
      <div
        className={['date-label', isToday && 'date-label--today']
          .filter(Boolean)
          .join(' ')}
      >
        <span className="date-label__today"></span>
      </div>
    );
  }
  return (
    <div className="date-label">
      <span className="date-label__date">{date}</span>
    </div>
  );
}
