import { CountBadge } from '@components/count-badge/CountBadge';
import { Entry, EntryProps } from '@components/entry/Entry';
// import { Badge, badgeColor } from '@components/badge/Badge';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import { AppIcon } from '@shared/icon';
import './Tag.css';

interface TagProps extends Omit<EntryProps, 'children'> {
  title?: string;
  emoji?: string | null;
  count?: number;
  // color?: badgeColor;
  isFavorite?: boolean;
}

export function Tag({
  title,
  emoji,
  count,
  isFavorite = false,
  ...entryProps
}: TagProps) {
  return (
    <Entry
      {...entryProps}
      leading={<AppIcon className="tag__icon" icon="tag" emoji={emoji} />}
      trailing={<CountBadge count={count} />}
      actions={
        <OverflowMenu
          items={[]}
          open={false}
          onOpenChange={() => {}}
          onSelect={() => {}}
          side="bottom"
          alignment="start"
        />
      }
    >
      {/* {<Badge label={title} color={color} />} */}
      {title}
    </Entry>
  );
}
