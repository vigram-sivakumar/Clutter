import { DateLabel } from '@components/date-label/DateLabel';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { formatDate } from '@shared/helpers/time';
import './DailyNote.css';

interface DailyNoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  isToday?: boolean;
  date?: string;
  titleStyle?: 'default' | 'placeholder';
}

export function DailyNote({
  title,
  isToday,
  date,
  titleStyle = 'default',
  ...entryProps
}: DailyNoteProps) {
  const day = date ? Number(formatDate(date, 'date')) : undefined;

  return (
    <Entry
      {...entryProps}
      leading={<DateLabel isToday={isToday} date={day} />}
      actions={
        <Button isIconOnly size="small" variant="ghost" interaction="subtle">
          <AppIcon icon="moreHorizontal" />
        </Button>
      }
    >
      <span
        className={
          titleStyle === 'placeholder'
            ? 'daily-note__title daily-note__title--placeholder'
            : 'daily-note__title'
        }
      >
        {title}
      </span>
    </Entry>
  );
}
