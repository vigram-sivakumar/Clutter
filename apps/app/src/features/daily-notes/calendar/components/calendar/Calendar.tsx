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
  // The active Daily Note's date, or undefined when the active page isn't
  // a Daily Note — the calendar never invents or remembers its own
  // selection, it only renders whatever this is (single source of truth
  // is the active page, not the calendar widget).
  selectedDate: string | undefined;
  notedDates?: Set<string>;
  onSelectedDateChange(date: string): void;
  onModeChange(mode: CalendarMode): void;
}

export function Calendar({
  mode,
  selectedDate,
  notedDates,
  onSelectedDateChange,
  onModeChange,
}: CalendarProps) {
  // Date currently visible in the calendar. Purely a browsing position —
  // independent of selection — so it needs its own fallback when nothing
  // is selected yet.
  const [visibleDate, setVisibleDate] = useState(
    () => selectedDate ?? toISODate(new Date())
  );

  // Follow the active Daily Note into view when one becomes active — but
  // don't jerk the visible month when selection is merely cleared (the
  // active page became a non-Daily-Note page), since the user may still
  // be browsing.
  useEffect(() => {
    if (selectedDate) {
      setVisibleDate(selectedDate);
    }
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
            notedDates={notedDates}
            onSelectedDateChange={onSelectedDateChange}
          />
        ) : (
          <CalendarMonth
            weeks={getMonth(visibleDate, selectedDate)}
            notedDates={notedDates}
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
