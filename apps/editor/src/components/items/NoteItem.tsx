import { Icons } from '../../design-system/icons';
import { IconSlot } from '../../design-system/icons/IconSlot';
import { Button } from '../Button';
import { Caret } from '../Caret';
import { ListItem } from '../ListItem';

interface NoteItemProps {
  title?: string;
  onClick?: () => void;
}

export function NoteItem({ title, onClick }: NoteItemProps) {
  return (
    <ListItem
      onClick={onClick}
      startSlot=<>
        <Caret state="placeholder" />{' '}
        <IconSlot>
          <Icons.Note />
        </IconSlot>
      </>
      actions=<Button
        isIconOnly
        size="small"
        variant="ghost"
        interaction="subtle"
      >
        <Icons.MoreHorizontal />
      </Button>
    >
      {title}
    </ListItem>
  );
}
