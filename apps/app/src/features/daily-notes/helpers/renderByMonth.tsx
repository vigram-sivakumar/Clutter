import { Fragment } from 'react';
// components
import { Section } from '@components/sidebar/section/Sidebar.Section';
import { DailyNote } from '../components/Entry.DailyNote';
// helper
import { MonthGroup } from './groupByMonth';
import { isToday } from './isToday';

interface RenderByMonthProps {
  months: MonthGroup[];
}

/**
 * Renders all month sections in the sidebar.
 */
export function renderByMonth({ months }: RenderByMonthProps) {
  // Render every month group
  return months.map((month) => (
    // Fragement let's us return multiple components
    // without adding an unnessary wrapper div.
    <Fragment key={month.title}>
      {/* Month heading */}
      <Section hasHeader={!month.isCurrentMonth} title={month.title}>
        {/* Render every daily-note belongs to a month */}
        {month.notes.map((note) => (
          <DailyNote
            key={note.id}
            isToday={isToday(note.date)}
            // Display the date
            date={new Date(note.date).getDate()}
            title={note.title}
            onClick={() => {}}
          />
        ))}
      </Section>
    </Fragment>
  ));
}
