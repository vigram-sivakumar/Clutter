import { ListItem } from '../ListItem';

interface DailyNoteProps {
  title?: string;
  onClick?: () => void;
}

export function DailyNote({ title, onClick }: DailyNoteProps) {
  return <ListItem onClick={onClick}>{title}</ListItem>;
}
