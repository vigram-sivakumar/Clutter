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

/** The individual controls of the row, in the order they are drawn. */
export type DailyNoteNavControl = 'calendar' | 'previousDay' | 'today' | 'nextDay';

const ALL_CONTROLS: readonly DailyNoteNavControl[] = ['calendar', 'previousDay', 'today', 'nextDay'];

interface DailyNoteNavControlsProps {
  /** ISO date of the Daily Note currently being viewed. */
  date: ISODate;
  /** Opens the Daily Note for `date` — same flow as any other date-navigation entry point (Sidebar's calendar, an inline date link). */
  onNavigateToDate(date: ISODate): void;
  /**
   * Which controls to draw. Omitted: all four, as before. Given: only those (always in the row's own order
   * — calendar, previous, today, next — whatever order they are listed in); nothing is drawn for the rest,
   * and no empty wrapper is left behind. Hiding a control changes only what is shown: every handler and the
   * calendar overlay work exactly as they do when it is visible.
   */
  visibleControls?: readonly DailyNoteNavControl[];
  /**
   * Controlled calendar state (with `onCalendarOpenChange`) for a host that coordinates this menu with others —
   * the title section's controls row, which never has two menus open. Omitted, the calendar keeps its own state.
   */
  calendarOpen?: boolean;
  onCalendarOpenChange?: (open: boolean) => void;
}

/**
 * The Daily Note's [Calendar] [←] [Today] [→] controls. Only PageHost renders
 * this, and only for a Daily Note (real or draft), in the title section's
 * controls row above the title — currently with just the calendar visible
 * (`visibleControls`).
 */
export function DailyNoteNavControls({
  date,
  onNavigateToDate,
  visibleControls = ALL_CONTROLS,
  calendarOpen,
  onCalendarOpenChange,
}: DailyNoteNavControlsProps) {
  const ownCalendar = useOverlay<HTMLButtonElement>();
  const calendar = {
    anchorRef: ownCalendar.anchorRef,
    open: calendarOpen ?? ownCalendar.open,
    hide: () => {
      if (calendarOpen === undefined) ownCalendar.hide();
      onCalendarOpenChange?.(false);
    },
    toggle: () => {
      if (calendarOpen === undefined) ownCalendar.toggle();
      onCalendarOpenChange?.(!(calendarOpen ?? ownCalendar.open));
    },
  };
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');

  function shiftDate(deltaDays: number): void {
    const shifted = toDate(date);
    shifted.setDate(shifted.getDate() + deltaDays);
    onNavigateToDate(toISODate(shifted));
  }

  const shows = (control: DailyNoteNavControl) => visibleControls.includes(control);
  const showsDateNav = shows('previousDay') || shows('today') || shows('nextDay');

  // Nothing to draw: no empty row either.
  if (!shows('calendar') && !showsDateNav) {
    return null;
  }

  return (
    <div className="daily-note-nav-controls">
      {shows('calendar') && (
        <Button
          className="daily-note__calendar-button"
          ref={calendar.anchorRef}
          isIconOnly
          size="small"
          variant="ghost"
          aria-label="Open calendar"
          aria-haspopup="dialog"
          aria-expanded={calendar.open}
          // Stays highlighted while its calendar is open, like every other menu trigger (see Controls).
          isActive={calendar.open}
          onClick={calendar.toggle}
        >
          <AppIcon icon="calendar" />
        </Button>
      )}
      {showsDateNav && (
        <div className="daily-note__date-nav">
          {shows('previousDay') && (
            <Button
              isIconOnly
              size="small"
              variant="ghost"
              aria-label="Previous day"
              onClick={() => shiftDate(-1)}
            >
              <AppIcon icon="caretLeft" />
            </Button>
          )}
          {shows('today') && (
            <Button
              size="small"
              variant="ghost"
              aria-label="Today"
              onClick={() => onNavigateToDate(toISODate(new Date()))}
            >
              {/* <AppIcon icon="calendarDot" /> */}
              Today
            </Button>
          )}
          {shows('nextDay') && (
            <Button
              isIconOnly
              size="small"
              variant="ghost"
              aria-label="Next day"
              onClick={() => shiftDate(1)}
            >
              <AppIcon icon="caretRight" />
            </Button>
          )}
        </div>
      )}

      {shows('calendar') && (
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
      )}
    </div>
  );
}
