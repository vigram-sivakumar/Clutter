import { CountBadge } from '../CountBadge';
import { ListItem } from '../ListItem';
import { Pill, PillColor } from '../Pill';
import { Button } from '../Button';
import { Icons } from '../../design-system/icons';

interface TagItemProps {
  title?: string;
  count?: number;
  onClick?: () => void;
  color?: PillColor;
}

export function TagItem({ title, color, count, onClick }: TagItemProps) {
  return (
    <ListItem
      onClick={onClick}
      endSlot={<CountBadge count={count} />}
      actions={
        <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
          <Icons.MoreHorizontal />
        </Button>
      }
    >
      {<Pill label={title} color={color} />}
    </ListItem>
  );
}
