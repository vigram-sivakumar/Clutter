import { Icons } from '@design-system/icons';
import './Header.css';
import { Button } from '@components/button/Button';

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
          <Icons.ArrowLeft />
        </Button>
        <Button isIconOnly size="small" variant="ghost" onClick={onNext}>
          <Icons.ArrowRight />
        </Button>
        <Button isIconOnly size="small" variant="ghost" onClick={onToday}>
          <Icons.CalendarWithDot />
        </Button>
      </div>
    </header>
  );
}
