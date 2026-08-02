import { useState } from 'react';

import type { CalendarMode } from '@features/daily-notes/calendar/models/CalendarMode';
import { Button } from '@components/button/Button';
import { Section } from '@app/layouts/sidebar/section/Section';
import { DateLabel } from '@components/date-label/DateLabel';
import { Calendar } from '@features/daily-notes/calendar/components/calendar/Calendar';
import type { Vault } from '@core/vault/models';
import { isToday } from '@shared/helpers/time';

import { findTodayNote } from '../helpers/findTodayNote';
import { datesWithNotes } from '@features/daily-notes/calendar/helpers/datesWithNotes';

interface DailyNotesShortcutsProps {
  vault: Vault;
  // The active Daily Note's date, or undefined when the active page isn't
  // a Daily Note. The calendar renders this directly rather than keeping
  // its own selection state, so it can never drift from whatever's
  // actually open (sidebar list, search, backlinks, Today — any entry
  // point).
  activeDate: string | undefined;
  onStartToday(): void;
  onOpenDate(date: string): void;
}

export function DailyNotesShortcuts({
  vault,
  activeDate,
  onStartToday,
  onOpenDate,
}: DailyNotesShortcutsProps) {
  const dailyNotes = Array.from(vault.dailyNotes());
  const todayNote = findTodayNote(dailyNotes);
  const notedDates = datesWithNotes(dailyNotes);

  // activeDate already covers both a persisted Daily Note and an open,
  // unpersisted draft (getActiveDailyNoteDate) — todayNote alone only
  // covers the persisted case, so checking it in isolation kept the CTA
  // visible while today's note was open but not yet saved.
  const isTodayOpen = activeDate !== undefined && isToday(activeDate);

  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week');

  return (
    <Section>
      <Calendar
        mode={calendarMode}
        selectedDate={activeDate}
        notedDates={notedDates}
        onSelectedDateChange={onOpenDate}
        onModeChange={setCalendarMode}
      />
      {!todayNote && !isTodayOpen && (
        <Button
          leading={<DateLabel isToday />}
          variant="outline-fill"
          className="button--muted"
          onClick={onStartToday}
        >
          Start your day...
        </Button>
      )}
    </Section>
  );
}
