import { DateLabel } from '@components/date-label/DateLabel';
import { Entry, type EntryProps } from '@components/sidebar/entry/Entry';
import { Button } from '@components/button/Button';
import { Icons } from '@design-system/icons';

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
  // For now, display only the day of the month.
  // Later this can be replaced with a shared date formatting helper.
  const day = date ? Number(date.slice(-2)) : undefined;

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
