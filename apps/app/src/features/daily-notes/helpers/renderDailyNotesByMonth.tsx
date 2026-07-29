import { Fragment } from 'react';

// Components
import { DailyNote } from '../sidebar/DailyNote';
import { Section } from '@app/layouts/sidebar/section/Section';
// Models
import type { Page } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';
// Helpers
import { groupByMonth } from './groupByMonth';
import {
  formatDate,
  // isCurrentMonth,
  isCurrentYear,
  isToday,
} from '@shared/helpers/time';

interface RenderDailyNotesByMonthProps {
  dailyNotes: Page[];
  workspace: Workspace;
  onOpen(pageId: string): void;
}

export function renderDailyNotesByMonth({
  dailyNotes,
  workspace,
  onOpen,
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
        <Section hasHeader title={title} isCollapsible onClick={() => {}}>
          {notes.map((note) => (
            <DailyNote
              key={note.id}
              title={formatDate(note.name, 'date')}
              date={note.name}
              isToday={isToday(note.name)}
              selected={workspace.activePageId === note.id}
              onClick={() => onOpen(note.id)}
            />
          ))}
        </Section>
      </Fragment>
    );
  });
}
