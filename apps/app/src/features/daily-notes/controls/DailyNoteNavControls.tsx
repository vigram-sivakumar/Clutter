import { useState } from 'react';
import type { ISODate } from '@shared/helpers/time/types';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { Calendar } from '@features/daily-notes/calendar/components/calendar/Calendar';
import type { CalendarMode } from '@features/daily-notes/calendar/models/CalendarMode';
import './DailyNoteNavControls.css';

interface DailyNoteNavControlsProps {
  /** ISO date of the Daily Note currently being viewed. */
  date: ISODate;
  /** Opens the Daily Note for `date` — same flow as any other date-navigation entry point (Sidebar's calendar, an inline date link). */
  onNavigateToDate(date: ISODate): void;
}

/**
 * The Daily Note page header's [Calendar] [←] [Today] [→] row. Only
 * PageHost renders this, and only for a Daily Note (real or draft) — see
 * PageTitleSection's `belowDescription` slot.
 */
export function DailyNoteNavControls({
  date,
  onNavigateToDate,
}: DailyNoteNavControlsProps) {
  const calendar = useOverlay<HTMLButtonElement>();
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');

  function shiftDate(deltaDays: number): void {
    const shifted = toDate(date);
    shifted.setDate(shifted.getDate() + deltaDays);
    onNavigateToDate(toISODate(shifted));
  }

  return (
    <div className="daily-note-nav-controls">
      <Button
        className="daily-note__calendar-button"
        ref={calendar.anchorRef}
        isIconOnly
        size="small"
        variant="outline-fill"
        aria-label="Open calendar"
        onClick={calendar.toggle}
      >
        <AppIcon icon="calendar" />
      </Button>
      <div className="daily-note__date-nav">
        <Button
          isIconOnly
          size="small"
          variant="ghost"
          aria-label="Previous day"
          onClick={() => shiftDate(-1)}
        >
          <AppIcon icon="arrowLeft" />
        </Button>
        <Button
          size="small"
          variant="ghost"
          aria-label="Today"
          onClick={() => onNavigateToDate(toISODate(new Date()))}
        >
          {/* <AppIcon icon="calendarDot" /> */}
          Today
        </Button>
        <Button
          isIconOnly
          size="small"
          variant="ghost"
          aria-label="Next day"
          onClick={() => shiftDate(1)}
        >
          <AppIcon icon="arrowRight" />
        </Button>
      </div>

      <Overlay
        open={calendar.open}
        onClose={calendar.hide}
        anchorRef={calendar.anchorRef}
        side="bottom"
        alignment="start"
      >
        <div className="daily-notes-calendar">
          <Calendar
            mode={calendarMode}
            selectedDate={date}
            onModeChange={setCalendarMode}
            onSelectedDateChange={(selected) => {
              calendar.hide();
              onNavigateToDate(selected);
            }}
          />
        </div>
      </Overlay>
    </div>
  );
}
