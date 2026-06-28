import { Caret } from '../Caret';
import { ListItem } from './ListItem';

interface SectionHeaderProps {
  title?: string;
  isCollapsible?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
  onClick?: () => void;
}

export function SectionHeader({
  title,
  isCollapsible = false,
  isExpanded = false,
  onExpandToggle,
  onClick,
}: SectionHeaderProps) {
  return (
    <ListItem
      className="label"
      titleSlot={
        isCollapsible ? (
          <Caret
            variant="dropdown"
            state={isExpanded ? 'expanded' : 'collapsed'}
            onClick={onExpandToggle}
          />
        ) : undefined
      }
      onClick={onClick}
    >
      {title}
    </ListItem>
  );
}
