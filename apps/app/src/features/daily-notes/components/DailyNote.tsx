import { DateLabel } from '@components/date-label/DateLabel';
import { Entry, type EntryProps } from '@components/sidebar/entry/Entry';
import { Button } from '@components/button/Button';
import { Icons } from '@design-system/icons';
import { formatDate } from '@shared/helpers/time';

interface DailyNoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  isToday?: boolean;
  date?: string;
}

export function DailyNote({
  title,
  isToday,
  date,
  ...entryProps
}: DailyNoteProps) {
  const day = date ? Number(formatDate(date, 'date')) : undefined;

  return (
    <Entry
      {...entryProps}
      leading={<DateLabel isToday={isToday} date={day} />}
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
