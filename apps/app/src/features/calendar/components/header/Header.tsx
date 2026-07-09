import './Header.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface CalendarHeaderProps {
  month: string;
  year: string;
  onPrevious(): void;
  onNext(): void;
  onToday(): void;
}

export function CalendarHeader({
  month,
  year,
  onPrevious,
  onNext,
  onToday,
}: CalendarHeaderProps) {
  return (
    <header className="calendar-header">
      {/* Calendar month */}
      <div className="calendar-title">
        <span className="calendar-month">{month}</span>
        <span className="calendar-year">{year}</span>
      </div>

      {/* Navigation */}
      <div className="calendar-actions">
        <Button isIconOnly size="small" variant="ghost" onClick={onPrevious}>
          <AppIcon icon="arrowLeft" />
        </Button>
        <Button isIconOnly size="small" variant="ghost" onClick={onNext}>
          <AppIcon icon="arrowRight" />
        </Button>
        <Button isIconOnly size="small" variant="ghost" onClick={onToday}>
          <AppIcon icon="calendarDot" />
        </Button>
      </div>
    </header>
  );
}
