import { Caret } from '../Caret';
import { ListItem } from '../ListItem';

interface SectionHeaderProps {
  title?: string;
  isCollapsible?: boolean;
  onClick?: () => void;
}

export function SectionHeader({
  title,
  isCollapsible = false,
  onClick,
}: SectionHeaderProps) {
  return (
    <ListItem
      className="label"
      titleSlot={isCollapsible ? <Caret type="dropdown" /> : undefined}
      onClick={onClick}
    >
      {title}
    </ListItem>
  );
}
