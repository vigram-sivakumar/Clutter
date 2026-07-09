import { CountBadge } from '@components/count-badge/CountBadge';
import { Entry, EntryProps } from '@app/layouts/sidebar/entry/Entry';
import { Badge, badgeColor } from '@components/badge/Badge';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

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
          <AppIcon icon="moreHorizontal" />
        </Button>
      }
    >
      {<Badge label={title} color={color} />}
    </Entry>
  );
}
