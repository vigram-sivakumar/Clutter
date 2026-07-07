// commponents
import { useState } from 'react';
import type { CalendarMode } from '@features/calendar/models/CalendarMode';
import { Button } from '@components/button/Button';
import { Section } from '@components/sidebar/section/Sidebar.Section';
import { View } from '@components/sidebar/View/Sidebar.View';
import { DateLabel } from '@components/date-label/DateLabel';
import { Calendar } from '@features/calendar/components/calendar/Calendar';
// helpers
import { findTodayNote } from './helpers/findTodayNote';
import { renderDailyNotesByMonth } from './helpers/renderDailyNotesByMonth';
// mock date
import { dailyNotes } from './mock/dailyNote';

export function DailyNotesPanel() {
  /**
   * Check whether today's journal already exists.
   * If it exists: Hide the "Create Today's Journal" button.
   * If it doesn't exist: Show the button.
   */
  const todayNote = findTodayNote(dailyNotes);

  // Currently selected date in the calendar.
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
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
