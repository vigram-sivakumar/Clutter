import { useState } from 'react';

import type { CalendarMode } from '@features/daily-notes/calendar/models/CalendarMode';
import { Button } from '@components/button/Button';
import { Section } from '@app/layouts/sidebar/section/Section';
import { DateLabel } from '@components/date-label/DateLabel';
import { Calendar } from '@features/daily-notes/calendar/components/calendar/Calendar';
import type { Vault } from '@core/vault/models';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

import { findTodayNote } from '../helpers/findTodayNote';

interface DailyNotesShortcutsProps {
  vault: Vault;
  onStartToday(): void;
  onOpenDate(date: string): void;
}

export function DailyNotesShortcuts({
  vault,
  onStartToday,
  onOpenDate,
}: DailyNotesShortcutsProps) {
  const dailyNotes = Array.from(vault.dailyNotes());
  const todayNote = findTodayNote(dailyNotes);

  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week');

  // The Calendar's date cells and its header's "Today" button both funnel
  // through this single handler (Calendar.tsx's handleToday calls the same
  // onSelectedDateChange prop) — one resolve-or-draft flow, no special case
  // for "Today".
  function handleSelectedDateChange(date: string) {
    setSelectedDate(date);
    onOpenDate(date);
  }

  return (
    <Section>
      <Calendar
        mode={calendarMode}
        selectedDate={selectedDate}
        onSelectedDateChange={handleSelectedDateChange}
        onModeChange={setCalendarMode}
      />
      {!todayNote && (
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
