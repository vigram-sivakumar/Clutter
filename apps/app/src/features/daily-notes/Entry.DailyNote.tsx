import { DateLabel } from '@components/DateLabel';
import { Entry, type EntryProps } from '@components/sidebar/Entry';

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
      leading={<DateLabel isToday={isToday} date={date} />}
    >
      {title}
    </Entry>
  );
}
