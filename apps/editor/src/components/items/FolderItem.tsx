import { Icons } from '../../design-system/icons';
import { IconSlot } from '../../design-system/icons/IconSlot';
import { Button } from '../Button';
import { Caret } from '../Caret';
import { ListItem } from '../ListItem';

interface FolderItemProps {
  isExpanded?: boolean;
  isEmpty?: boolean;
  title?: string;
  onClick?: () => void;
}

export function FolderItem({
  isExpanded = false,
  isEmpty = false,
  title,
  onClick,
}: FolderItemProps) {
  const caretState = isEmpty
    ? 'disabled'
    : isExpanded
      ? 'expanded'
      : 'collapsed';
  return (
    <ListItem
      onClick={onClick}
      startSlot={
        <>
          <Caret state={caretState} type="tree" />
          <IconSlot>
            <Icons.Folder />
          </IconSlot>
        </>
      }
      actions={
        <>
          <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
            <Icons.Plus />
          </Button>
          <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
            <Icons.MoreHorizontal />
          </Button>
        </>
      }
    >
      {title}
    </ListItem>
  );
}
