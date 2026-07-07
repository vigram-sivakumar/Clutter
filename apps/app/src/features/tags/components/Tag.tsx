import { CountBadge } from '@components/count-badge/CountBadge';
import { Entry, EntryProps } from '@components/sidebar/entry/Entry';
import { Badge, badgeColor } from '@components/badge/Badge';
import { Button } from '@components/button/Button';
import { Icons } from '@design-system/icons/index';

interface TagProps extends Omit<EntryProps, 'children'> {
  title?: string;
  count?: number;
  color?: badgeColor;
  isFavorite?: boolean;
}

export function Tag({
  title,
  color,
  count,
  isFavorite = false,
  ...entryProps
}: TagProps) {
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
