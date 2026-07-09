import { Fragment } from 'react';

// Components
import { DailyNote } from '../components/DailyNote';
import { Section } from '@app/layouts/sidebar/section/Section';
// Models
import type { DailyNote as DailyNoteModel } from '../models/DailyNote';
// Helpers
import { groupByMonth } from './groupByMonth';
import {
  formatDate,
  isCurrentMonth,
  isCurrentYear,
  isToday,
} from '@shared/helpers/time';

interface RenderDailyNotesByMonthProps {
  dailyNotes: DailyNoteModel[];
}

export function renderDailyNotesByMonth({
  dailyNotes,
}: RenderDailyNotesByMonthProps) {
  const monthGroups = groupByMonth(dailyNotes);
  return Object.entries(monthGroups).map(([month, notes]) => {
    // Skip rendering the year for the current year.
    const monthDate = `${month}-01`;
    const title = isCurrentYear(monthDate)
      ? formatDate(monthDate, 'monthShort')
      : formatDate(monthDate, 'monthYear');

    return (
      <Fragment key={month}>
        <Section
          hasHeader={!isCurrentMonth(month)}
          title={title}
          isCollapsible
          onClick={() => {}}
        >
          {notes.map((note) => (
            <DailyNote
              key={note.id}
              title={note.title}
              date={note.date}
              isToday={isToday(note.date)}
              onClick={() => {}}
            />
          ))}
        </Section>
      </Fragment>
    );
  });
}
