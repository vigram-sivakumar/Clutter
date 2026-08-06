import { DateLabel } from '@components/date-label/DateLabel';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { formatDate } from '@shared/helpers/time';
import './DailyNote.css';

interface DailyNoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  isToday?: boolean;
  date?: string;
  titleStyle?: 'default' | 'placeholder';

  menuItems?: readonly OverflowMenuItemConfig[];
  menuOpen?: boolean;
  onMenuOpenChange?(open: boolean): void;
  onMenuSelect?(id: string): void;
}

export function DailyNote({
  title,
  isToday,
  date,
  titleStyle = 'default',
  menuItems,
  menuOpen = false,
  onMenuOpenChange,
  onMenuSelect,
  ...entryProps
}: DailyNoteProps) {
  const day = date ? Number(formatDate(date, 'date')) : undefined;

  return (
    <Entry
      {...entryProps}
      // Forces every hover-driven affordance (background, revealed
      // actions) to stay visible while this row's menu is open — the
      // trigger button that controls the menu lives in .entry__actions,
      // which is itself hover-gated, so without this, moving the mouse
      // away mid-menu would hide the button needed to close it.
      forceHover={menuOpen}
      leading={<DateLabel isToday={isToday} date={day} />}
      actions={
        <OverflowMenu
          items={menuItems ?? []}
          open={menuOpen}
          onOpenChange={onMenuOpenChange ?? (() => {})}
          onSelect={onMenuSelect ?? (() => {})}
          side="bottom"
          alignment="start"
          size="small"
        />
      }
    >
      <span
        className={
          titleStyle === 'placeholder'
            ? 'daily-note__title daily-note__title--placeholder'
            : 'daily-note__title'
        }
      >
        {title}
      </span>
    </Entry>
  );
}
