// commponents
import { Button } from '@components/button/Button';
import { Section } from '@components/sidebar/section/Sidebar.Section';
import { View } from '@components/sidebar/View/Sidebar.View';
import { DateLabel } from '@components/date-label/DateLabel';
// helpers
import { findTodayNote } from './helpers/findTodayNote';
import { renderDailyNotesByMonth } from './helpers/renderDailyNotesByMonth';
// mock date
import { dailyNotes } from './mock/Mock.DailyNote';

export function DailyNotesPanel() {
  /**
   * Check whether today's journal already exists.
   * If it exists: Hide the "Create Today's Journal" button.
   * If it doesn't exist: Show the button.
   */
  const todayNote = findTodayNote(dailyNotes);

  return (
    <View
      navigation={
        <Section>
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
