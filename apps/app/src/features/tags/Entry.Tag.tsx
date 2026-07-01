import { CountBadge } from '@components/CountBadge';
import { Entry, EntryProps } from '@components/sidebar/Entry';
import { Badge, badgeColor } from '@components/Badge';
import { Button } from '@components/Button';
import { Icons } from '../../design-system/icons';

interface TagProps extends Omit<EntryProps, 'children'> {
  title?: string;
  count?: number;
  color?: badgeColor;
}

export function Tag({ title, color, count, ...entryProps }: TagProps) {
  return (
    <Entry
      {...entryProps}
      trailing={<CountBadge count={count} />}
      actions={
        <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
          <Icons.MoreHorizontal />
        </Button>
      }
    >
      {<Badge label={title} color={color} />}
    </Entry>
  );
}
