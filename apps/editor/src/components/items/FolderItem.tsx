import { Icons } from '../../design-system/icons';
import { IconSlot } from '../../design-system/icons/IconSlot';
import { Button } from '../Button';
import { Caret } from '../Caret';
import { ListItem } from './ListItem';

interface FolderItemProps {
  title?: string;

  isExpanded?: boolean;
  isEmpty?: boolean;
  onClick?: () => void;
}

export function FolderItem({
  isExpanded = false,
  isEmpty = false,
  title,
  onClick,
}: FolderItemProps) {
  return (
    <ListItem
      onClick={onClick}
      startSlot={
        <>
          <Caret disabled={isEmpty} isExpanded={isExpanded} variant="tree" />
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
