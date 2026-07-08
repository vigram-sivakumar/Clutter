import { useEffect, useState } from 'react';
import './Calendar.css';

import type { CalendarMode } from '../../models/CalendarMode';

import { CalendarHeader } from '../header/Header';
import { CalendarWeek } from '../week/Week';
import { CalendarMonth } from '../month/Month';
import { CalendarWeekdays } from '../weekdays/Weekdays';

import { getWeek } from '../../helpers/getWeek';
import { getMonth } from '../../helpers/getMonth';
import { moveCalendar } from '../../helpers/moveCalendar';
import { getCalendarTitle } from '../../helpers/getCalendarTitle';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

interface CalendarProps {
  mode: CalendarMode;
  selectedDate: string;
  onSelectedDateChange(date: string): void;
  onModeChange(mode: CalendarMode): void;
}

export function Calendar({
  mode,
  selectedDate,
  onSelectedDateChange,
  onModeChange,
}: CalendarProps) {
  // Date currently visible in the calendar.
  const [visibleDate, setVisibleDate] = useState(selectedDate);

  // Keep the visible date in sync when the
  // selected date changes externally.
  useEffect(() => {
    setVisibleDate(selectedDate);
  }, [selectedDate]);

  // Calendar title.
  const title = getCalendarTitle(visibleDate);

  function handleToggleMode() {
    onModeChange(mode === 'week' ? 'month' : 'week');
  }

  function handlePrevious() {
    setVisibleDate(moveCalendar(visibleDate, 'previous', mode));
  }

  function handleNext() {
    setVisibleDate(moveCalendar(visibleDate, 'next', mode));
  }

  function handleToday() {
    const today = toISODate(new Date());

    setVisibleDate(today);

    onSelectedDateChange(today);
  }

  return (
    <div className="calendar">
      <CalendarHeader
        month={title.month}
        year={title.year ?? ''}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onToday={handleToday}
      />
      <div className="calendar-view">
        <CalendarWeekdays />
        {mode === 'week' ? (
          <CalendarWeek
            dates={getWeek(visibleDate, selectedDate)}
            isCurrentWeek
            onSelectedDateChange={onSelectedDateChange}
          />
        ) : (
          <CalendarMonth
            weeks={getMonth(visibleDate, selectedDate)}
            onSelectedDateChange={onSelectedDateChange}
          />
        )}
        <div className="calendar-toggle">
          <button
            className="calendar-toggle--button"
            type="button"
            onClick={handleToggleMode}
          >
            <span className="calendar-toggle--bar"></span>
          </button>
        </div>
      </div>
    </div>
  );
}
