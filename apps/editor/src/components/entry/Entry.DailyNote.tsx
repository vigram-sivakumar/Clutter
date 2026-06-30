import { DateIndicator } from '../DateLabel';
import { Entry, type EntryProps } from './Entry';

interface DailyNoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  isToday?: boolean;
  date?: number;
}

export function DailyNote({
  title,
  isToday,
  date,
  ...entryProps
}: DailyNoteProps) {
  return (
    <Entry
      {...entryProps}
      leading={<DateIndicator isToday={isToday} date={date} />}
    >
      {title}
    </Entry>
  );
}
