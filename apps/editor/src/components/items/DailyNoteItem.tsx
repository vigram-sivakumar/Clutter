import { DateIndicator } from '../DateIndicator';
import { ListItem } from './ListItem';

interface DailyNoteProps {
  title?: string;
  isToday?: boolean;
  date?: number;
  onClick?: () => void;
}

export function DailyNote({ title, isToday, date, onClick }: DailyNoteProps) {
  return (
    <ListItem
      startSlot={<DateIndicator isToday={isToday} date={date} />}
      onClick={onClick}
    >
      {title}
    </ListItem>
  );
}
