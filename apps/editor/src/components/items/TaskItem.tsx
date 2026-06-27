import { ListItem } from '../ListItem';
import { Checkbox } from '../Checkbox';
import { Caret } from '../Caret';
import { Button } from '../Button';
import { Icons } from '../../design-system/icons';

interface TaskItemProps {
  title?: string;
  isEmpty?: boolean;
  isExpanded?: boolean;
  checked: boolean;
  onClick?: () => void;
  onCheckedChange?: (checked: boolean) => void;
}

export function TaskItem({
  title,
  checked,
  isExpanded = false,
  isEmpty = false,
  onClick,
  onCheckedChange,
}: TaskItemProps) {
  const caretState = isEmpty
    ? 'placeholder'
    : isExpanded
      ? 'expanded'
      : 'collapsed';
  return (
    <ListItem
      className={checked ? 'is-completed' : undefined}
      onClick={onClick}
      startSlot={
        <>
          <Caret state={caretState} type="tree" />
          <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
        </>
      }
      actions={
        <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
          <Icons.MoreHorizontal />
        </Button>
      }
    >
      {title}
    </ListItem>
  );
}
