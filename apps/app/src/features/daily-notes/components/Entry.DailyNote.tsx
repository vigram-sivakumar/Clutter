import { DateLabel } from '@components/date-label/DateLabel';
import { Entry, type EntryProps } from '@components/sidebar/entry/Entry';
import { Button } from '@components/button/Button';
import { Icons } from '@design-system/icons';

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
      actions={
        <Button isIconOnly size="small" variant="ghost" interaction="subtle">
          <Icons.MoreHorizontal />
        </Button>
      }
    >
      {title}
    </Entry>
  );
}
