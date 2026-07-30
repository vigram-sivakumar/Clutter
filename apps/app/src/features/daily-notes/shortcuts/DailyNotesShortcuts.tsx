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
}

export function DailyNotesShortcuts({ vault }: DailyNotesShortcutsProps) {
  const dailyNotes = Array.from(vault.dailyNotes());
  const todayNote = findTodayNote(dailyNotes);

  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week');

  return (
    <Section>
      <Calendar
        mode={calendarMode}
        selectedDate={selectedDate}
        onSelectedDateChange={setSelectedDate}
        onModeChange={setCalendarMode}
      />
      {!todayNote && (
        <Button
          leading={<DateLabel isToday />}
          variant="outline-fill"
          className="button--muted"
        >
          Start your day...
        </Button>
      )}
    </Section>
  );
}
