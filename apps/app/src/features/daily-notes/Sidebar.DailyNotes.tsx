// commponents
import { useState } from 'react';
import type { CalendarMode } from '@features/calendar/models/CalendarMode';
import { Button } from '@components/button/Button';
import { Section } from '@app/layouts/sidebar/section/Section';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { DateLabel } from '@components/date-label/DateLabel';
import { Calendar } from '@features/calendar/components/calendar/Calendar';
// helpers
import { findTodayNote } from './helpers/findTodayNote';
import { renderDailyNotesByMonth } from './helpers/renderDailyNotesByMonth';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { Vault } from '@core/vault/models';

interface DailyNotesPanelProps {
  vault: Vault;
}

export function DailyNotes({ vault }: DailyNotesPanelProps) {
  /**
   * Check whether today's journal already exists.
   * If it exists: Hide the "Create Today's Journal" button.
   * If it doesn't exist: Show the button.
   */
  const dailyNotes = Array.from(vault.dailyNotes());

  const todayNote = findTodayNote(dailyNotes);

  // Currently selected date in the calendar.
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));
  // Current calendar display mode.
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('week');

  return (
    <View
      navigation={
        <Section>
          <Calendar
            mode={calendarMode}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            onModeChange={setCalendarMode}
          />
          {/* Shows create today's daily-note button if toda's note doesn't exist */}
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
      }
    >
      {renderDailyNotesByMonth({ dailyNotes })}
    </View>
  );
}
