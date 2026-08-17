import { CountBadge } from '@components/count-badge/CountBadge';
import { Entry, EntryProps } from '@components/entry/Entry';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { useChangeIconTrigger } from '@components/change-icon-picker/useChangeIconTrigger';
import { AppIcon } from '@shared/icon';
import './Tag.css';

interface TagProps extends Omit<EntryProps, 'children'> {
  title?: string;
  emoji?: string | null;
  count?: number;
  isFavorite?: boolean;

  menuItems?: readonly OverflowMenuItemConfig[];
  menuOpen?: boolean;
  onMenuOpenChange?(open: boolean): void;
  onMenuSelect?(id: string): void;
  onChangeIcon?: (emoji: string | null) => void;
}

export function Tag({
  title,
  emoji,
  count,
  isFavorite = false,
  menuItems,
  menuOpen = false,
  onMenuOpenChange,
  onMenuSelect,
  onChangeIcon,
  forceHover: externalForceHover = false,
  ...entryProps
}: TagProps) {
  const changeIconTrigger = useChangeIconTrigger(onChangeIcon !== undefined);
  const triggerRef = changeIconTrigger.triggerRef;

  return (
    <>
      <Entry
        {...entryProps}
        forceHover={externalForceHover || menuOpen || changeIconTrigger.open}
        leading={<AppIcon className="tag__icon" icon="tag" emoji={emoji} />}
        trailing={<CountBadge count={count} />}
        actions={
          menuItems && menuItems.length > 0 ? (
            <OverflowMenu
              items={menuItems}
              triggerRef={triggerRef}
              open={menuOpen}
              onOpenChange={onMenuOpenChange ?? (() => {})}
              onSelect={(id) =>
                changeIconTrigger.handleSelect(id, onMenuSelect ?? (() => {}))
              }
              side="bottom"
              alignment="start"
            />
          ) : undefined
        }
      >
        {title}
      </Entry>
      {onChangeIcon !== undefined && (
        <ChangeIconPicker
          anchorRef={triggerRef}
          open={changeIconTrigger.open}
          onClose={changeIconTrigger.close}
          hasIcon={emoji != null && emoji !== ''}
          onSelect={onChangeIcon}
          onRemove={() => onChangeIcon(null)}
          side="bottom"
          alignment="start"
        />
      )}
    </>
  );
}
