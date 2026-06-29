import '../styles/DateLabel.css';

interface DateIndicatorProps {
  isToday?: boolean;
  date?: number;
}

export function DateIndicator({ isToday = false, date }: DateIndicatorProps) {
  if (isToday) {
    return (
      <div
        className={['date-indicator', isToday && 'date-indicator--today']
          .filter(Boolean)
          .join(' ')}
      >
        <span className="date-indicator__today"></span>
      </div>
    );
  }
  return (
    <div className="date-indicator">
      <span className="date-indicator__date">{date}</span>
    </div>
  );
}
