import { useState } from 'react';

import type { CalendarMode } from '@features/daily-notes/calendar/models/CalendarMode';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Calendar } from '@features/daily-notes/calendar/components/calendar/Calendar';
import type { Vault } from '@core/vault/models';

import { datesWithNotes } from '@features/daily-notes/calendar/helpers/datesWithNotes';

interface DailyNotesShortcutsProps {
  vault: Vault;
  // The active Daily Note's date, or undefined when the active page isn't
  // a Daily Note. The calendar renders this directly rather than keeping
  // its own selection state, so it can never drift from whatever's
  // actually open (sidebar list, search, backlinks, Today — any entry
  // point).
  activeDate: string | undefined;
  onOpenDate(date: string): void;
}

export function DailyNotesShortcuts({
  vault,
  activeDate,
  onOpenDate,
}: DailyNotesShortcutsProps) {
  const notedDates = datesWithNotes(Array.from(vault.dailyNotes()));

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
    </Section>
  );
}
