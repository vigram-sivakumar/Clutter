import { Fragment } from 'react';

// Components
import { DailyNote } from '../components/DailyNote';
import { Section } from '@components/sidebar/section/Sidebar.Section';
// Models
import type { DailyNote as DailyNoteModel } from '../models/DailyNote';
// Helpers
import { groupByMonth } from './groupByMonth';
import { formatMonth } from '@shared/helpers/date/formatMonth';
import { formatMonthYear } from '@shared/helpers/date/formatMonthYear';

interface RenderDailyNotesByMonthProps {
  dailyNotes: DailyNoteModel[];
}

export function renderDailyNotesByMonth({
  dailyNotes,
}: RenderDailyNotesByMonthProps) {
  const monthGroups = groupByMonth(dailyNotes);
  return Object.entries(monthGroups).map(([month, notes]) => {
    // check current year
    const currentYear = new Date().getFullYear();
    const noteYear = new Date(`${month}-01`).getFullYear();
    // Skips rendering year for current year
    const title =
      noteYear === currentYear
        ? formatMonth(month, 'short')
        : formatMonthYear(month, 'short');

    return (
      <Fragment key={month}>
        <Section hasHeader title={title} isCollapsible onClick={() => {}}>
          {notes.map((note) => (
            <DailyNote
              key={note.id}
              title={note.title}
              date={note.date}
              onClick={() => {}}
            />
          ))}
        </Section>
      </Fragment>
    );
  });
}
